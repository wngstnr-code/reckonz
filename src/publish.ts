/**
 * Runs the fair-value engine and publishes the result to the deployed
 * FairValueOracle, then reads it back and asks the contract for an execution
 * decision. This is the loop end to end on a real chain.
 *
 * Assets are keyed by their **X Layer mainnet** addresses even when publishing
 * to testnet — the oracle is an address-keyed registry, and reusing the real
 * identifiers keeps testnet observations comparable to mainnet ones.
 */
import { formatEther, formatGwei, type Address } from 'viem';
import { FAIR_VALUE_ORACLE_ABI } from './abi';
import { ASSETS, computeFairValue, toOraclePayload } from './fairvalue';
import { capacity, loadVenues } from './planner';
import { addressBySymbol } from './pool';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitUntil,
  walletFor,
  waitForReceipt,} from './wallet';

/** Impact limit the published capacity is measured at. */
const REFERENCE_IMPACT_BPS = Number(process.env.REFERENCE_IMPACT_BPS ?? 50);

// Chain and addresses both come from TARGET, so this script cannot publish to
// one chain while reporting another. Defaulting to the recorded deployment
// rather than a literal also keeps it off older contracts that are still live.
const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const ORACLE = (process.env.ORACLE_ADDRESS ??
  deployment.contracts.FairValueOracle) as Address;

// Symbols joined to addresses by reading the chain, so this script cannot carry
// a stale copy of the universe. Mainnet addresses even when publishing to
// testnet — see the header.
const ADDRESS_BY_SYMBOL = await addressBySymbol();

const account = accountFrom('PUBLISHER_KEY', 'PRIVATE_KEY');
const client = walletFor(account, t);

console.log(`\n  FairValueOracle ${ORACLE}  (${deployment.name}, chain ${chain.id})`);
console.log(`  publisher       ${account.address}`);

// A scheduled publisher that quietly runs out of gas is worse than a manual
// one: the oracle goes stale, every on-chain check starts failing STALE, and
// nothing says why. So the runway is printed every run and a nearly-empty key
// fails the job loudly rather than half-working.
const REFUEL_AT_RUNS = 20;
const balance = await client.getBalance({ address: account.address });
const gasPrice = await client.getGasPrice();
// ~884k gas for 30 warm slots, rounded up, and scaled by how many are actually
// being published — a runway printed for thirty while publishing four is a
// number that is wrong in the reassuring direction.
const slots = BigInt((process.env.PUBLISH_SYMBOLS ?? '').split(',').filter((s) => s.trim()).length || 30);
const perRun = ((900_000n * slots) / 30n + 60_000n) * gasPrice;
const runsLeft = perRun > 0n ? balance / perRun : 0n;
console.log(
  `  gas balance     ${formatEther(balance)} OKB — about ${runsLeft} runs at ${formatGwei(gasPrice)} gwei\n`,
);
if (runsLeft < BigInt(REFUEL_AT_RUNS)) {
  console.error(
    `  ✗ under ${REFUEL_AT_RUNS} runs of gas left. Top up ${account.address}.\n` +
      '    Topping up is a plain transfer and needs no Safe signatures.\n',
  );
  process.exit(1);
}

// 1 — run the off-chain engine: fair value from the issuer's mark, capacity and basis
//     from live mainnet pool state via the planner.
const now = Math.floor(Date.now() / 1000);
type Item = {
  asset: Address;
  fairValueE8: bigint;
  confidenceBps: number;
  basisBps: number;
  capacityUsdg: bigint;
  gapRisk: number;
  state: number;
  anchorAt: bigint;
  hasValue: boolean;
};
/**
 * Which assets to publish this run.
 *
 * Publishing all thirty every ten minutes costs ~900k gas a cycle and about
 * $5 of OKB every three weeks. A live mandate holds four assets. The other
 * twenty-six are being published so that nothing reads them, which is the
 * same trade the publish worker itself was scheduled to avoid — *"running it
 * from now so that nothing observes it is the wrong trade"* — applied one
 * level down.
 *
 * So the set is configurable, and the default stays all thirty because a demo
 * that shows an empty asset is worse than a slightly expensive one. Narrow it
 * on the worker, where the cost is recurring:
 *
 *   PUBLISH_SYMBOLS=wTSLAx,wNVDAx,wQQQx,wSPYx pnpm publish:loop
 *
 * Measured rather than estimated: **919,563 gas for thirty against 142,872 for
 * four**, a 6.4x saving that turns three weeks of runway into roughly four and
 * a half months on the same $5. The saving is under-linear because the first
 * write in a transaction pays for the transaction, not because a slot is free.
 *
 * An unknown symbol is a hard error rather than a silent skip: a typo that
 * quietly publishes twenty-nine assets instead of thirty is exactly the kind
 * of drift nobody notices until a mandate cannot execute.
 */
const PUBLISH_SYMBOLS = (process.env.PUBLISH_SYMBOLS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (PUBLISH_SYMBOLS.length) {
  const unknown = PUBLISH_SYMBOLS.filter((s) => !ASSETS.some((a) => a.symbol === s));
  if (unknown.length) {
    console.error(`\n  ✗ PUBLISH_SYMBOLS names assets that are not in ASSETS: ${unknown.join(', ')}\n`);
    process.exit(1);
  }
}

const selected = PUBLISH_SYMBOLS.length
  ? ASSETS.filter((a) => PUBLISH_SYMBOLS.includes(a.symbol))
  : ASSETS;

if (PUBLISH_SYMBOLS.length) {
  console.log(
    `  publishing ${selected.length} of ${ASSETS.length} assets (PUBLISH_SYMBOLS)\n` +
      `  the rest keep whatever they last had on chain, and go stale — which is correct\n` +
      `  if nothing reads them, and wrong the moment a mandate allows one.\n`,
  );
}

const items: Item[] = [];

for (const spec of selected) {
  const address = ADDRESS_BY_SYMBOL.get(spec.symbol);
  if (!address) continue;

  const venues = await loadVenues(address);
  const onchainPrice = venues[0]?.spot;
  const capacityUsdg = venues.length ? capacity(venues, REFERENCE_IMPACT_BPS) : 0n;

  const report = await computeFairValue(spec, { now, onchainPrice });
  const p = toOraclePayload(report);

  items.push({
    asset: address,
    fairValueE8: p.fairValueE8,
    confidenceBps: p.confidenceBps,
    // Withheld basis publishes as 0 — the guard only reaches a basis trigger
    // once the oracle gate has already passed, which requires a value.
    basisBps: Math.round(report.basisBps ?? 0),
    capacityUsdg,
    gapRisk: p.gapRisk,
    state: p.state,
    anchorAt: BigInt(p.anchorAt),
    hasValue: p.hasValue,
  });

  console.log(
    `  ${spec.symbol.padEnd(9)} ` +
      `fv=${p.hasValue ? (Number(p.fairValueE8) / 1e8).toFixed(2).padStart(11) : 'withheld'.padStart(11)}  ` +
      `band=${(p.confidenceBps / 100).toFixed(2).padStart(6)}%  ` +
      `basis=${(report.basisBps === undefined ? '—' : (report.basisBps / 100).toFixed(2) + '%').padStart(8)}  ` +
      `cap=${(Number(capacityUsdg) / 1e6).toFixed(0).padStart(6)}  ` +
      `gap=${String(p.gapRisk).padStart(3)}`,
  );
}

const assets = items.map((i) => i.asset);

// 2 — publish
console.log(`\n  publishing ${assets.length} observations…`);
const hash = await client.writeContract({
  address: ORACLE,
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'publishMany',
  args: [items],
});
const receipt = await waitForReceipt(client, hash);
console.log(`  tx ${hash}`);
console.log(`  block ${receipt.blockNumber}  gas ${receipt.gasUsed}  status ${receipt.status}`);

// The public X Layer RPC load-balances, so a read issued straight after a
// confirmed write can land on a node that has not synced the block and return
// the *previous* observation — a stale read, not an error. See D18.
//
// This used to wait for `updatedAt !== 0`, which is the wrong question: an
// asset that has ever been published has a non-zero `updatedAt` forever, so the
// wait passed instantly against a node still serving the old block. The run
// that caught it reported three assets as `REJECT STALE` while the write had in
// fact landed for all thirty — a false alarm about the one condition this whole
// script exists to check.
//
// The right question is whether the node has caught up to *our* write, so the
// bound is the timestamp of the block it landed in.
const publishedAt = (await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp;

const peekFresh = (asset: Address) =>
  waitUntil(
    () =>
      client.readContract({
        address: ORACLE,
        abi: FAIR_VALUE_ORACLE_ABI,
        functionName: 'peek',
        args: [asset],
      }),
    (o) => o.updatedAt >= publishedAt,
    { attempts: 20, delayMs: 500, what: 'the published observation' },
  );

await peekFresh(assets[0]!);
console.log();

// 3 — read it back and let the contract decide
console.log('  contract read-back + checkExecution (maxGapRisk 60, ≤100bp deviation)\n');
for (let i = 0; i < assets.length; i++) {
  const symbol = ASSETS.find((a) => ADDRESS_BY_SYMBOL.get(a.symbol) === assets[i])!.symbol;
  // Every asset waits on its own read, not just the first: the RPC balances
  // per request, so asset 3 can land on a lagging node after asset 1 did not.
  const obs = await peekFresh(assets[i]!);

  // Execute exactly at fair value — the deviation term is then zero, so any
  // rejection here is the oracle's own state talking, not the price.
  const [ok, reason] = await client.readContract({
    address: ORACLE,
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'checkExecution',
    args: [assets[i]!, obs.fairValueE8, 60, 100],
  });

  const decoded = reason === `0x${'0'.repeat(64)}` ? '' : Buffer.from(reason.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');
  console.log(
    `  ${symbol.padEnd(9)} onchain fv=${(Number(obs.fairValueE8) / 1e8).toFixed(2).padStart(12)}  ` +
      `gap=${String(obs.gapRisk).padStart(3)}  cap=${(Number(obs.capacityUsdg) / 1e6).toFixed(0).padStart(6)}  ` +
      `→ ${ok ? 'ALLOW' : `REJECT ${decoded}`}`,
  );

  // A value the contract's jump bound refused comes back withheld even though
  // we sent one. Reporting it is not optional: a publisher that cannot tell
  // "the oracle declined my number" from "I published a withhold" would keep
  // resending and never learn it has to confirm.
  const sent = items.find((it) => it.asset === assets[i])!;
  if (sent.hasValue && !obs.hasValue) {
    const a = await client.readContract({
      address: ORACLE,
      abi: FAIR_VALUE_ORACLE_ABI,
      functionName: 'anchorOf',
      args: [assets[i]!],
    });
    const jumpPct =
      a.valueE8 === 0n
        ? '—'
        : `${((Number(sent.fairValueE8 - a.valueE8) / Number(a.valueE8)) * 100).toFixed(1)}%`;
    console.log(
      `  ${''.padEnd(9)} withheld by the publish bound: ${(Number(sent.fairValueE8) / 1e8).toFixed(2)} is ` +
        `${jumpPct} from the anchor ${(Number(a.valueE8) / 1e8).toFixed(2)}. ` +
        `Re-publish the same value after JUMP_CONFIRM_DELAY to confirm it.`,
    );
  }
}
console.log();
