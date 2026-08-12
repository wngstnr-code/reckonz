/**
 * Admin actions that only the Safe can perform.
 *
 * `FeeCollector.setTreasury` and `setFeeBps` are `onlyAdmin`, and admin has been
 * the 2-of-3 Safe since D42 — so neither had any caller in this repo, and the
 * fee has been landing in the deployer's EOA ever since (D52). This is the path
 * that fixes that, and the first thing on mainnet to actually use the Safe:
 * `nonce()` was still 0.
 *
 *   TARGET=mainnet pnpm safe:admin status
 *   TARGET=mainnet pnpm safe:admin treasury 0x98d1…      # send fees to the Safe
 *   TARGET=mainnet pnpm safe:admin feebps 15
 *
 * ## Keys
 *
 * Threshold is 2, so one key is never enough. Owner keys come from the
 * environment and never from an argument — a private key on a command line ends
 * up in shell history:
 *
 *   PRIVATE_KEY        owner 1 (the deployer)
 *   SAFE_OWNER_2_KEY   owner 2
 *   SAFE_OWNER_3_KEY   owner 3
 *
 * Supply any two. Whatever is present approves; the rest is reported so a
 * co-signer elsewhere can approve the same hash and someone can then execute.
 * That is the real workflow — this script simply does not pretend a 2-of-3 is a
 * 1-of-1 when both keys happen to sit on one machine.
 *
 * Approvals are recorded **on chain** with `approveHash`, so each owner needs a
 * little gas of their own. Safe checks recovered owners are strictly increasing,
 * which `prevalidatedSignatures` handles by sorting.
 */
import { encodeFunctionData, formatUnits, getAddress, isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { FEE_COLLECTOR_ABI, RECEIPT_REGISTRY_ABI, SAFE_ABI } from './abi';
import { USDG } from './chain';
import { approveHash, execTransaction, safeState, safeTxHash, type SafeTx } from './safe';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitUntil,
  walletFor,
} from './wallet';

const USAGE = `usage:
  TARGET=mainnet pnpm safe:admin status
  TARGET=mainnet pnpm safe:admin treasury <address>
  TARGET=mainnet pnpm safe:admin feebps <bps>
  TARGET=mainnet pnpm safe:admin writer <guard> on|off   (off needs --yes)

keys, from the environment only:
  PRIVATE_KEY  SAFE_OWNER_2_KEY  SAFE_OWNER_3_KEY   (supply any two)`;

const argv = process.argv.slice(2);
const CONFIRMED = argv.includes('--yes');
const [action, value, flag] = argv.filter((a) => a !== '--yes');
if (!action || !['status', 'treasury', 'feebps', 'writer'].includes(action)) {
  console.error(USAGE);
  process.exit(1);
}

const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const FEES = deployment.contracts.FeeCollector as Address;
const RECEIPTS = deployment.contracts.ReceiptRegistry as Address;

// `writer` administers the registry, everything else the fee collector. Reading
// the Safe from whichever contract is actually being changed is what stops this
// script approving hashes against a Safe that is no longer that contract's admin.
const TARGET_CONTRACT = action === 'writer' ? RECEIPTS : FEES;
const TARGET_ABI = action === 'writer' ? RECEIPT_REGISTRY_ABI : FEE_COLLECTOR_ABI;

const deployer = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(deployer, t);

// Read the Safe from the contract it administers rather than from a constant.
// A Safe address in a config that has drifted from the on-chain admin is a
// script that approves hashes nobody will ever execute.
const admin = await wallet.readContract({
  address: TARGET_CONTRACT,
  abi: TARGET_ABI as never,
  functionName: 'admin',
});

console.log(
  `\n  ${action === 'writer' ? 'ReceiptRegistry' : 'FeeCollector'} ${TARGET_CONTRACT}` +
    `  (${deployment.name}, chain ${chain.id})`,
);
console.log(`  admin        ${admin}`);

const adminCode = await wallet.getCode({ address: admin });
if (!adminCode || adminCode === '0x') {
  console.error(`\n  The admin is an EOA, not a Safe. This script is for Safe-administered`);
  console.error(`  contracts; call setTreasury/setFeeBps directly with that key instead.\n`);
  process.exit(1);
}

const safe = admin as Address;
const state = await safeState(wallet, safe);
console.log(`  threshold    ${state.threshold} of ${state.owners.length}   nonce ${state.nonce}`);

/**
 * Owner keys present locally. Missing ones are not an error — they are the
 * normal case for a multisig, and the point of printing the hash below.
 */
const available: { address: Address; label: string; key: Hex }[] = [];
for (const [envName, label] of [
  ['PRIVATE_KEY', 'owner 1 (deployer)'],
  ['SAFE_OWNER_2_KEY', 'owner 2'],
  ['SAFE_OWNER_3_KEY', 'owner 3'],
] as const) {
  const key = process.env[envName];
  if (!key) continue;
  const account = privateKeyToAccount(key as Hex);
  if (!state.owners.some((o) => o.toLowerCase() === account.address.toLowerCase())) {
    console.log(`  ⚠ ${envName} is ${account.address}, which is not an owner of this Safe — ignored`);
    continue;
  }
  if (available.some((a) => a.address.toLowerCase() === account.address.toLowerCase())) continue;
  available.push({ address: account.address, label, key: key as Hex });
}

console.log(`\n  owners`);
for (const owner of state.owners) {
  const have = available.find((a) => a.address.toLowerCase() === owner.toLowerCase());
  const balance = await wallet.getBalance({ address: owner });
  console.log(
    `    ${owner}  ${have ? `key present (${have.label})` : 'no key here'}` +
      `   ${formatUnits(balance, 18)} OKB`,
  );
}

if (action === 'status') {
  const [treasury, feeBps, maxFeeBps] = await Promise.all([
    wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'treasury' }),
    wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'feeBps' }),
    wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'MAX_FEE_BPS' }),
  ]);
  const treasuryCode = await wallet.getCode({ address: treasury });
  console.log(`\n  treasury     ${treasury}${!treasuryCode || treasuryCode === '0x' ? '  ⚠ EOA' : '  (contract)'}`);
  console.log(`  feeBps       ${feeBps}  (ceiling ${maxFeeBps}, a constant)`);
  console.log(
    `\n  ${available.length} of the ${state.threshold} required keys are present here.` +
      `${available.length >= Number(state.threshold) ? ' Enough to execute.' : ' Not enough — a co-signer is needed.'}\n`,
  );
  process.exit(0);
}

// ------------------------------------------------------------ build the call

let data: Hex;
let description: string;
let confirm: () => Promise<boolean>;

if (action === 'treasury') {
  if (!value || !isAddress(value)) {
    console.error(`\n  give the new treasury address.\n\n${USAGE}\n`);
    process.exit(1);
  }
  const next = getAddress(value);
  const current = await wallet.readContract({
    address: FEES,
    abi: FEE_COLLECTOR_ABI,
    functionName: 'treasury',
  });
  if (current.toLowerCase() === next.toLowerCase()) {
    console.log(`\n  treasury is already ${next}. Nothing to do.\n`);
    process.exit(0);
  }

  const nextCode = await wallet.getCode({ address: next });
  console.log(`\n  treasury ${current}\n        -> ${next}` +
    `${!nextCode || nextCode === '0x' ? '   ⚠ this is an EOA too' : '   (a contract)'}`);
  console.log(`  Everything already swept is unaffected; this changes where future sweeps land.`);

  data = encodeFunctionData({
    abi: FEE_COLLECTOR_ABI,
    functionName: 'setTreasury',
    args: [next],
  });
  description = `setTreasury(${next})`;
  confirm = async () =>
    (
      await wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'treasury' })
    ).toLowerCase() === next.toLowerCase();
} else if (action === 'writer') {
  if (!value || !isAddress(value) || (flag !== 'on' && flag !== 'off')) {
    console.error(`\n  usage: pnpm safe:admin writer <guardAddress> on|off\n`);
    process.exit(1);
  }
  const guard = getAddress(value);
  const allow = flag === 'on';

  const guardCode = await wallet.getCode({ address: guard });
  if (!guardCode || guardCode === '0x') {
    console.error(`\n  ${guard} has no code. Granting write access to an empty address is a`);
    console.error(`  permission nobody can use and a typo nobody notices.\n`);
    process.exit(1);
  }

  const already = await wallet.readContract({
    address: RECEIPTS,
    abi: RECEIPT_REGISTRY_ABI,
    functionName: 'isWriter',
    args: [guard],
  });
  if (already === allow) {
    console.log(`\n  ${guard} is already ${allow ? 'a writer' : 'not a writer'}. Nothing to do.\n`);
    process.exit(0);
  }

  // Revoking is the one action here that breaks a working system instantly:
  // a guard with no write access reverts on every fill and every exit. It
  // happened once, to the live guard, from a command typed to inspect output —
  // the script did exactly as told and that was the problem. Destructive and
  // irreversible-in-the-moment actions get a second word.
  if (!allow && !CONFIRMED) {
    const live = await wallet.readContract({
      address: RECEIPTS,
      abi: RECEIPT_REGISTRY_ABI,
      functionName: 'isWriter',
      args: [guard],
    });
    console.error(`\n  Refusing to revoke without --yes.`);
    console.error(`  ${guard} is currently ${live ? 'THE WRITER' : 'not a writer'}.`);
    if (live) {
      console.error(`\n  Revoking it stops every fill and every exit on every mandate it holds,`);
      console.error(`  immediately. If this is a migration, grant the new guard first.`);
    }
    console.error(`\n  Re-run with --yes if that is what you mean.\n`);
    process.exit(1);
  }

  console.log(`\n  ${allow ? 'granting' : 'revoking'} append rights on the receipt registry`);
  console.log(`    guard ${guard}`);
  if (allow) {
    console.log(`\n  Grant the new guard first, then revoke the old one. Two contracts able to`);
    console.log(`  append to one append-only history is two places trust can leak from — but a`);
    console.log(`  moment of two writers is safer than a moment of none, which is a guard that`);
    console.log(`  reverts on every fill.`);
  } else {
    console.log(`\n  Mandates still on this guard can no longer record anything. Their receipts`);
    console.log(`  stand; the history is append-only and nothing here rewrites it.`);
  }

  data = encodeFunctionData({
    abi: RECEIPT_REGISTRY_ABI,
    functionName: 'setWriter',
    args: [guard, allow],
  });
  description = `setWriter(${guard}, ${allow})`;
  confirm = async () =>
    (await wallet.readContract({
      address: RECEIPTS,
      abi: RECEIPT_REGISTRY_ABI,
      functionName: 'isWriter',
      args: [guard],
    })) === allow;
} else {
  const bps = Number(value);
  if (!Number.isInteger(bps) || bps < 0) {
    console.error(`\n  feebps takes a whole number of basis points.\n`);
    process.exit(1);
  }
  const [current, ceiling] = await Promise.all([
    wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'feeBps' }),
    wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'MAX_FEE_BPS' }),
  ]);
  // The contract would revert anyway; refusing here means the Safe's nonce is
  // not spent on a transaction that cannot succeed.
  if (bps > Number(ceiling)) {
    console.error(`\n  ${bps} bps exceeds MAX_FEE_BPS (${ceiling}), which is a constant, not a setting.\n`);
    process.exit(1);
  }
  if (Number(current) === bps) {
    console.log(`\n  feeBps is already ${bps}. Nothing to do.\n`);
    process.exit(0);
  }
  console.log(`\n  feeBps ${current} -> ${bps}   (ceiling ${ceiling})`);
  console.log(`  On a ${formatUnits(1_000_000n, USDG.decimals)} ${USDG.symbol} fill that is ` +
    `${formatUnits((1_000_000n * BigInt(bps)) / 10_000n, USDG.decimals)} ${USDG.symbol}.`);

  data = encodeFunctionData({ abi: FEE_COLLECTOR_ABI, functionName: 'setFeeBps', args: [bps] });
  description = `setFeeBps(${bps})`;
  confirm = async () =>
    Number(
      await wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'feeBps' }),
    ) === bps;
}

// -------------------------------------------------------- approve and execute

const tx: SafeTx = { to: TARGET_CONTRACT, value: 0n, data };
const txHash = await safeTxHash(wallet, safe, tx, state.nonce);

console.log(`\n  Safe transaction`);
console.log(`    call    ${description}`);
console.log(`    to      ${TARGET_CONTRACT}`);
console.log(`    nonce   ${state.nonce}`);
console.log(`    hash    ${txHash}`);

const approvals: Address[] = [];
for (const owner of state.owners) {
  const already = await wallet.readContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'approvedHashes',
    args: [owner, txHash],
  });
  if (already > 0n) {
    approvals.push(owner);
    console.log(`    ✓ already approved by ${owner}`);
  }
}

for (const owner of available) {
  if (approvals.some((a) => a.toLowerCase() === owner.address.toLowerCase())) continue;
  console.log(`\n  approving as ${owner.label} ${owner.address}…`);
  const ownerWallet = walletFor(privateKeyToAccount(owner.key), t);
  const hash = await approveHash(ownerWallet, safe, txHash);
  console.log(`    tx ${hash}`);
  approvals.push(owner.address);
}

if (approvals.length < Number(state.threshold)) {
  console.log(
    `\n  ${approvals.length} of ${state.threshold} approvals. A co-signer must approve this exact hash:`,
  );
  console.log(`\n    ${txHash}\n`);
  console.log(`  They can do it with either of:`);
  console.log(`    SAFE_OWNER_2_KEY=0x… TARGET=${t} pnpm safe:admin ${action} ${value}`);
  console.log(`    cast send ${safe} "approveHash(bytes32)" ${txHash} --rpc-url xlayer --private-key 0x…`);
  console.log(`\n  Nothing has changed yet. The approval is recorded and waiting.\n`);
  process.exit(0);
}

console.log(`\n  ${approvals.length} of ${state.threshold} approvals — executing…`);
const execHash = await execTransaction(wallet, safe, tx, approvals);
console.log(`    tx ${execHash}`);

// Polled, not read once: a confirmed write can outrun a readable block here
// (D18), and an admin change reported as done when it is not is the worst kind
// of wrong.
await waitUntil(confirm, (ok) => ok, {
  attempts: 30,
  delayMs: 500,
  what: 'the admin change to read back',
});

console.log(`\n  ${description} — confirmed by reading it back`);
console.log(`  explorer  ${deployment.explorer}/tx/${execHash}\n`);
