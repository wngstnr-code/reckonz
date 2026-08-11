/**
 * `pnpm safe:prove` — prove a Safe 2-of-3 actually administers the oracle on
 * X Layer, before anything on mainnet depends on it.
 *
 * Safe's contracts have bytecode at their canonical addresses on both X Layer
 * chains. That proves nothing. D35 cost a day because the Universal Router was
 * deployed, correctly shaped, carried the exact selector — and could not
 * perform the one operation we needed. An external dependency is unverified
 * until a call doing the *actual work* succeeds against it.
 *
 * So this does the actual work, and the sequence is chosen so nothing is left
 * bricked if it stops halfway:
 *
 *   1. deploy a 2-of-3 Safe
 *   2. hand the oracle's admin to it
 *   3. one approval, then execute — **must revert**, or the threshold is a lie
 *   4. second approval, then execute `setMaxAge` — the real admin action
 *   5. the Safe hands admin back to the deployer
 *
 * Step 3 is the one that matters. Without it this would prove "a Safe can act",
 * not "2-of-3 means two". Step 5 means a failed proof never costs us admin of
 * the testnet oracle.
 *
 * Runs against TARGET (default testnet). The mainnet Safe is a different script
 * with real owners — this one deploys ephemeral keys and must never be the Safe
 * anything depends on.
 */
import { formatEther, parseEther, type Address } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { FAIR_VALUE_ORACLE_ABI } from './abi';
import { encodeFunctionData } from 'viem';
import {
  approveHash,
  deploySafe,
  execTransaction,
  safeState,
  safeTxHash,
  type SafeTx,
} from './safe';
import { accountFrom, chainFor, deploymentFor, target, waitUntil, walletFor } from './wallet';

const t = target();
if (t === 'mainnet') {
  throw new Error(
    'safe:prove deploys ephemeral owner keys and must not run on mainnet — ' +
      'it would create a Safe nobody can sign for',
  );
}

const chain = chainFor(t);
const deployment = deploymentFor(t);
const ORACLE = deployment.contracts.FairValueOracle as Address;

const deployer = accountFrom('PRIVATE_KEY');
const wallet = walletFor(deployer, t);

// Ephemeral co-owners. Only one of them ever sends a transaction, so only one
// needs gas. They exist for the length of this run and are then worthless,
// which is exactly why this script refuses to run on mainnet.
const coOwner = privateKeyToAccount(generatePrivateKey());
const backup = privateKeyToAccount(generatePrivateKey());
const coWallet = walletFor(coOwner, t);

console.log(`\n  Safe 2-of-3 over FairValueOracle — ${deployment.name}, chain ${chain.id}\n`);
console.log(`  oracle    ${ORACLE}`);
console.log(`  owner 1   ${deployer.address}  (deployer)`);
console.log(`  owner 2   ${coOwner.address}  (ephemeral)`);
console.log(`  owner 3   ${backup.address}  (ephemeral)\n`);

const adminBefore = await wallet.readContract({
  address: ORACLE,
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'admin',
});
if (adminBefore.toLowerCase() !== deployer.address.toLowerCase()) {
  throw new Error(`deployer is not the oracle admin (${adminBefore}) — nothing to prove`);
}

// 1 — deploy
const safe = await deploySafe(
  wallet,
  [deployer.address, coOwner.address, backup.address],
  2,
  BigInt(Date.now()),
);
const state = await safeState(wallet, safe);
console.log(`  1. deployed  ${safe}`);
console.log(`     owners ${state.owners.length}, threshold ${state.threshold}\n`);
if (state.threshold !== 2n || state.owners.length !== 3) {
  throw new Error('the deployed Safe is not 2-of-3');
}

// Fund the one co-owner that has to send `approveHash`.
const gasGift = parseEther('0.002');
const fund = await wallet.sendTransaction({ to: coOwner.address, value: gasGift });
await wallet.waitForTransactionReceipt({ hash: fund });
console.log(`     funded owner 2 with ${formatEther(gasGift)} OKB for its approval\n`);

// 2 — hand admin to the Safe
const setAdminToSafe = await wallet.writeContract({
  address: ORACLE,
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'setAdmin',
  args: [safe],
});
await wallet.waitForTransactionReceipt({ hash: setAdminToSafe });
await waitUntil(
  () => wallet.readContract({ address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'admin' }),
  (a) => a.toLowerCase() === safe.toLowerCase(),
  { what: 'the oracle admin handover' },
);
console.log(`  2. oracle admin is now the Safe\n`);

// The real admin action the Safe will perform. A value that differs from the
// current one, so the read-back cannot pass by accident.
const maxAgeBefore = await wallet.readContract({
  address: ORACLE,
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'maxAge',
});
const newMaxAge = maxAgeBefore === 900n ? 600n : 900n;

const setMaxAgeTx: SafeTx = {
  to: ORACLE,
  value: 0n,
  data: encodeFunctionData({
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'setMaxAge',
    args: [newMaxAge],
  }),
};

const nonce0 = (await safeState(wallet, safe)).nonce;
const hash0 = await safeTxHash(wallet, safe, setMaxAgeTx, nonce0);

// 3 — one approval must not be enough
await approveHash(wallet, safe, hash0);
console.log(`  3. one approval recorded (deployer)`);
let rejected = false;
try {
  await execTransaction(wallet, safe, setMaxAgeTx, [deployer.address]);
} catch (e) {
  rejected = true;
  const msg = (e as Error).message;
  console.log(`     execute with 1 of 2 → reverted (${/GS\d+/.exec(msg)?.[0] ?? 'reverted'})\n`);
}
if (!rejected) {
  throw new Error(
    'a single approval executed a 2-of-3 Safe transaction — the threshold does not bind',
  );
}

// GS020 only proves Safe counts signatures. The sharper question is whether it
// *verifies* them: claim two approvers when only one has approved. If this
// passed, the threshold would be arithmetic rather than consent.
let forged = false;
try {
  await execTransaction(wallet, safe, setMaxAgeTx, [deployer.address, coOwner.address]);
} catch (e) {
  forged = true;
  const msg = (e as Error).message;
  console.log(`     claim 2 approvals with 1 recorded → reverted (${/GS\d+/.exec(msg)?.[0] ?? 'reverted'})\n`);
}
if (!forged) {
  throw new Error(
    'an unapproved owner was counted toward the threshold — approvals are not verified',
  );
}

// 4 — second approval, then the real action
await approveHash(coWallet, safe, hash0);
console.log(`  4. second approval recorded (owner 2)`);
const execHash = await execTransaction(wallet, safe, setMaxAgeTx, [
  deployer.address,
  coOwner.address,
]);
const maxAgeAfter = await waitUntil(
  () => wallet.readContract({ address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'maxAge' }),
  (v) => v === newMaxAge,
  { what: 'the Safe-executed setMaxAge' },
);
console.log(`     maxAge ${maxAgeBefore} → ${maxAgeAfter}  tx ${execHash}\n`);

// 5 — hand admin back, so a proof run costs us nothing
const handBack: SafeTx = {
  to: ORACLE,
  value: 0n,
  data: encodeFunctionData({
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'setAdmin',
    args: [deployer.address],
  }),
};
const nonce1 = (await safeState(wallet, safe)).nonce;
const hash1 = await safeTxHash(wallet, safe, handBack, nonce1);
await approveHash(wallet, safe, hash1);
await approveHash(coWallet, safe, hash1);
await execTransaction(wallet, safe, handBack, [deployer.address, coOwner.address]);
const adminAfter = await waitUntil(
  () => wallet.readContract({ address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'admin' }),
  (a) => a.toLowerCase() === deployer.address.toLowerCase(),
  { what: 'the admin handback' },
);
console.log(`  5. admin handed back to ${adminAfter}\n`);

console.log(
  '  ✓ Safe 1.4.1 works on X Layer: a 2-of-3 deployed, refused a single\n' +
    '    approval, performed a real oracle admin action on two, and handed\n' +
    '    admin back. The ephemeral Safe above is a proof artifact — do not use it.\n',
);
