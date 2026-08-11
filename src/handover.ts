/**
 * `pnpm handover` — split the roles, then put the admin half behind a Safe.
 *
 * Today one key is every role: `admin` of the oracle, of `ReceiptRegistry` and
 * of `FeeCollector`; the oracle's only `isPublisher`; and the account holding
 * the funds. A single compromise is total. This separates them.
 *
 * The order is the whole design, because every step past the last one needs two
 * signatures instead of one:
 *
 *   1. grant the new publisher key
 *   2. fund it, and make it **publish for real** — an untested publisher that
 *      turns out not to work is discovered after the old one is gone (D35)
 *   3. revoke the deployer's publisher right
 *   4. hand `admin` of the oracle, the receipts and the fees to the Safe
 *
 * Step 2 exists because step 3 is irreversible without the Safe. Step 4 is
 * last for the same reason.
 *
 * `PolicyGuard` needs nothing here: it has no global admin, only a per-mandate
 * owner. `ThesisRegistry` has no admin at all, on purpose.
 *
 * Env:
 *   PRIVATE_KEY      the current admin
 *   PUBLISHER_KEY    the key that will publish from now on (must be real — the
 *                    script proves it works before revoking the old one)
 *   SAFE_OWNERS      comma-separated, includes the deployer
 *   SAFE_THRESHOLD   defaults to 2
 *   SAFE_ADDRESS     optional; reuse an existing Safe instead of deploying
 */
import { formatEther, getAddress, parseEther, type Address } from 'viem';
import { FAIR_VALUE_ORACLE_ABI, FEE_COLLECTOR_ABI, RECEIPT_REGISTRY_ABI } from './abi';
import { deploySafe, safeState } from './safe';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitForReceipt,
  waitUntil,
  walletFor,
} from './wallet';

const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);

const ORACLE = deployment.contracts.FairValueOracle as Address;
const RECEIPTS = deployment.contracts.ReceiptRegistry as Address;
const FEES = deployment.contracts.FeeCollector as Address | undefined;

const admin = accountFrom('PRIVATE_KEY');
const wallet = walletFor(admin, t);
const publisher = accountFrom('PUBLISHER_KEY');
const pubWallet = walletFor(publisher, t);

if (publisher.address.toLowerCase() === admin.address.toLowerCase()) {
  throw new Error('PUBLISHER_KEY is the deployer key — that is the concentration this undoes');
}

const owners = (process.env.SAFE_OWNERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => getAddress(s));
const threshold = Number(process.env.SAFE_THRESHOLD ?? 2);

console.log(`\n  Role split + Safe handover — ${deployment.name}, chain ${chain.id}\n`);
console.log(`  oracle     ${ORACLE}`);
console.log(`  receipts   ${RECEIPTS}`);
console.log(`  fees       ${FEES ?? '(none recorded)'}`);
console.log(`  admin now  ${admin.address}`);
console.log(`  publisher  ${publisher.address}  (new)\n`);

// ------------------------------------------------------------ preconditions

const oracleAdmin = await wallet.readContract({
  address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'admin',
});
const receiptsAdmin = await wallet.readContract({
  address: RECEIPTS, abi: RECEIPT_REGISTRY_ABI, functionName: 'admin',
});
const is = (a: string) => a.toLowerCase() === admin.address.toLowerCase();
if (!is(oracleAdmin)) throw new Error(`oracle admin is ${oracleAdmin}, not the deployer`);
if (!is(receiptsAdmin)) throw new Error(`receipts admin is ${receiptsAdmin}, not the deployer`);
if (FEES) {
  const feesAdmin = await wallet.readContract({
    address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'admin',
  });
  if (!is(feesAdmin)) throw new Error(`fees admin is ${feesAdmin}, not the deployer`);
}

// ---------------------------------------------------- 1: grant the publisher

let hash = await wallet.writeContract({
  address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'setPublisher',
  args: [publisher.address, true],
});
await waitForReceipt(wallet, hash);
await waitUntil(
  () => wallet.readContract({
    address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'isPublisher',
    args: [publisher.address],
  }),
  (ok) => ok === true,
  { what: 'the publisher grant' },
);
console.log('  1. publisher granted');

// ------------------------------------------- 2: prove the new publisher works

// Publishing 28 assets costs ~2.5M gas, and X Layer runs at ~0.02 gwei, so a
// cycle is ~0.00005 OKB. 0.002 is forty-odd cycles — enough that the publisher
// does not stall, small enough that a hot key is never worth stealing for its
// balance. Topping it up is a plain transfer and needs no signatures.
const gas = parseEther(process.env.PUBLISHER_GAS ?? '0.002');
const balance = await wallet.getBalance({ address: publisher.address });
if (balance < gas) {
  const fund = await wallet.sendTransaction({ to: publisher.address, value: gas - balance });
  await waitForReceipt(wallet, fund);
  console.log(`     funded with ${formatEther(gas - balance)} OKB`);
}

// A withheld observation for an address nothing else uses. It writes nothing
// anyone consumes, needs no market data, and still proves the key can pass
// `isPublisher` and land a transaction — which is the only thing in doubt.
//
// Deliberately not the burn address: other probes write there, and a proof that
// silently reads another script's leftovers is not a proof.
const PROBE = '0x00000000000000000000000000000000000c0dE5' as Address;
const probe = await pubWallet.writeContract({
  address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'publish',
  args: [{
    asset: PROBE, fairValueE8: 0n, confidenceBps: 0, basisBps: 0, capacityUsdg: 0n,
    gapRisk: 100, state: 5, anchorAt: BigInt(Math.floor(Date.now() / 1000)), hasValue: false,
  }],
});
await waitForReceipt(pubWallet, probe);
await waitUntil(
  () => wallet.readContract({
    address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'peek', args: [PROBE],
  }),
  (o) => o.updatedAt !== 0n,
  { what: 'the probe publication' },
);
console.log(`  2. new publisher published for real  tx ${probe}`);

// ------------------------------------------------- 3: revoke the old publisher

hash = await wallet.writeContract({
  address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'setPublisher',
  args: [admin.address, false],
});
await waitForReceipt(wallet, hash);
await waitUntil(
  () => wallet.readContract({
    address: ORACLE, abi: FAIR_VALUE_ORACLE_ABI, functionName: 'isPublisher',
    args: [admin.address],
  }),
  (ok) => ok === false,
  { what: 'the deployer publisher revocation' },
);
console.log('  3. deployer can no longer publish');

// -------------------------------------------------------- 4: admin to a Safe

let safe: Address;
if (process.env.SAFE_ADDRESS) {
  safe = getAddress(process.env.SAFE_ADDRESS);
  console.log(`  4. reusing Safe ${safe}`);
} else {
  if (owners.length < 3) throw new Error('SAFE_OWNERS needs at least three addresses for 2-of-3');
  if (!owners.some((o) => o.toLowerCase() === admin.address.toLowerCase())) {
    throw new Error('the deployer is not among SAFE_OWNERS — it would lose admin entirely');
  }
  safe = await deploySafe(wallet, owners, threshold, BigInt(Date.now()));
  console.log(`  4. Safe deployed ${safe}`);
}
const st = await safeState(wallet, safe);
console.log(`     owners ${st.owners.length}, threshold ${st.threshold}`);
if (st.threshold < 2n) throw new Error('a threshold below 2 is not a multisig');

for (const [name, address, abi] of [
  ['oracle', ORACLE, FAIR_VALUE_ORACLE_ABI],
  ['receipts', RECEIPTS, RECEIPT_REGISTRY_ABI],
  ...(FEES ? [['fees', FEES, FEE_COLLECTOR_ABI] as const] : []),
] as const) {
  const h = await wallet.writeContract({
    address, abi: abi as never, functionName: 'setAdmin', args: [safe] as never,
  });
  await waitForReceipt(wallet, h);
  await waitUntil(
    () => wallet.readContract({ address, abi: abi as never, functionName: 'admin' }),
    (a) => String(a).toLowerCase() === safe.toLowerCase(),
    { what: `${name} admin handover` },
  );
  console.log(`     ${name.padEnd(9)} admin -> Safe`);
}

console.log(
  `\n  ✓ done. Publishing is a hot key bounded by the contract; every admin action\n` +
    `    now needs ${st.threshold} of ${st.owners.length} signatures. Put ${safe}\n` +
    `    in docs/05-status.md and keep the gap-list entry: this slows a compromise,\n` +
    `    it does not prevent one.\n`,
);
