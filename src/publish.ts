/**
 * Runs the fair-value engine and publishes the result to the deployed
 * FairValueOracle, then reads it back and asks the contract for an execution
 * decision. This is the loop end to end on a real chain.
 *
 * Assets are keyed by their **X Layer mainnet** addresses even when publishing
 * to testnet — the oracle is an address-keyed registry, and reusing the real
 * identifiers keeps testnet observations comparable to mainnet ones.
 */
import { BlockNotFoundError, formatEther, formatGwei, type Address } from 'viem';
import { FAIR_VALUE_ORACLE_ABI } from './abi';
import { crossCheck, describeCrossCheck } from './crosscheck';
import { ASSETS, computeFairValue, issuerSymbolFor, MEASURED, toOraclePayload } from './fairvalue';
import { publishRunway } from './health';
import { issuerBook, type IssuerQuote } from './issuer';
import { type IssuerState, writeHeartbeat } from './publisher-status';
import { readAll } from './observations';
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
// Scaled by how many slots are actually being published — a runway printed for
// thirty while publishing four is a number that is wrong in the reassuring
// direction. The gas arithmetic itself now lives in `health.ts`, because
// `GET /api/health` needs the same projection and two copies of it would drift
// the way five test counts once did (D60).
const slots = (process.env.PUBLISH_SYMBOLS ?? '').split(',').filter((s) => s.trim()).length || 30;
const runway = publishRunway({ address: account.address, balanceWei: balance, gasPriceWei: gasPrice }, slots);
const runsLeft = runway.runsLeft;
console.log(
  `  gas balance     ${formatEther(balance)} OKB — about ${runsLeft} runs ` +
    `(${runway.days.toFixed(1)} days) at ${formatGwei(gasPrice)} gwei\n`,
);
if (runsLeft < REFUEL_AT_RUNS) {
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
 * Publishing all thirty every ten minutes costs ~900k gas a cycle — about
 * $0.28 a day at 0.02 gwei and WOKB $107.15 (measured 2026-08-15; both move,
 * so re-measure rather than quote this). Narrowing to four costs ~$0.04.
 *
 * **The worker publishes all thirty anyway** (D85), and the default here is
 * what it relies on. The mandate form picks its allowlist from the same thirty
 * `GET /api/universe` returns, so a narrowed publisher does not save money on
 * assets nobody reads — it turns twenty-six checkboxes in the app into a fill
 * that reverts STALE. Twenty-one cents a day is not worth a failure mode.
 *
 * The filter stays because it is right for a hand publish, where the cost is
 * one transaction and the goal is clearing a single stale asset before a demo:
 *
 *   PUBLISH_SYMBOLS=wSPYx pnpm oracle:publish
 *
 * Measured rather than estimated: **919,563 gas for thirty against 142,872 for
 * four**, 6.4x. The saving is under-linear because the first write in a
 * transaction pays for the transaction, not because a slot is free.
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

/**
 * The evidence the cross-check needs, gathered once (D79).
 *
 * The book is one fetch for every asset, and `readAll()` is a file. Both are
 * pulled outside the loop because neither changes inside it, and the issuer's
 * book is cached for 30 seconds anyway — asking per asset would just make the
 * loop's timing depend on the cache TTL.
 */
let book: Map<string, IssuerQuote>;
try {
  book = await issuerBook();
} catch (e) {
  // The issuer not answering is a heartbeat, not a stack trace. Without this the
  // process died here and wrote nothing, and `/api/health` — which can only see
  // observations ageing — would call an unreachable price source a dead
  // publisher. Same wrong sentence, different cause.
  await writeHeartbeat({
    at: Math.floor(Date.now() / 1000),
    target: t,
    cycle: 'failed',
    considered: selected.length,
    published: 0,
    issuer: 'unreachable',
    quotable: 0,
    period: null,
  });
  console.error(`\n  ✗ the issuer did not answer: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}

/**
 * What the issuer is doing, as three states rather than one shrug.
 *
 * `publish.ts` said "the issuer is unreachable or carrying nothing" for weeks,
 * and that `or` was the whole ambiguity: the first is an outage, the second is
 * a Saturday. The API answers both explicitly — `canQuote` per asset and
 * `currentPeriod` for the session — and nothing was reading either.
 *
 * Measured over the assets *this run* was asked to price, not the issuer's whole
 * 714-name catalogue: a run narrowed by `PUBLISH_SYMBOLS` must report on what it
 * narrowed to, or it vouches for assets it never looked at.
 *
 * **No quotes at all reads as `unreachable`, never as `closed`.** The book being
 * empty, and the book being full of names none of which are ours, are both a
 * failure to obtain prices — the second is a broken symbol mapping. `closed` is
 * the one state that does not page, so nothing may fall into it by accident: it
 * has to be the issuer actively declining to quote assets we did find.
 */
const quotesForSelected = selected
  .map((spec) => book.get(issuerSymbolFor(spec.symbol)))
  .filter((q): q is IssuerQuote => q !== undefined);
const quotable = quotesForSelected.filter((q) => q.canQuote && !q.halted).length;
const issuerState: IssuerState =
  quotesForSelected.length === 0 ? 'unreachable' : quotable > 0 ? 'quoting' : 'closed';
const issuerPeriod = quotesForSelected[0]?.period ?? null;

/** One shape for every exit, so no path can forget a field. */
const beat = (cycle: 'published' | 'withheld' | 'failed', published: number) =>
  writeHeartbeat({
    at: Math.floor(Date.now() / 1000),
    target: t,
    cycle,
    considered: selected.length,
    published,
    issuer: issuerState,
    quotable,
    period: issuerPeriod,
  });
const lastMark = new Map<string, { mid: number; observedAt: number }>();
for (const sample of readAll()) {
  const seen = lastMark.get(sample.symbol);
  if (!seen || sample.observedAt > seen.observedAt) {
    lastMark.set(sample.symbol, { mid: sample.mid, observedAt: sample.observedAt });
  }
}

const items: Item[] = [];
/** Values a check refused. Printed together at the end, not buried in the loop. */
const withheldByCheck: { symbol: string; reasons: string[] }[] = [];

for (const spec of selected) {
  const address = ADDRESS_BY_SYMBOL.get(spec.symbol);
  if (!address) continue;

  const venues = await loadVenues(address);
  const onchainPrice = venues[0]?.spot;
  const capacityUsdg = venues.length ? capacity(venues, REFERENCE_IMPACT_BPS) : 0n;

  const report = await computeFairValue(spec, { now, onchainPrice });
  const p = toOraclePayload(report);

  // The second opinion, between the engine and the chain. It never adjusts the
  // number — a failed check withholds it, and the value publishes in exactly
  // the shape an unpriceable asset already does, so consumers need no new case.
  const quote = book.get(issuerSymbolFor(spec.symbol));
  const previous = lastMark.get(spec.symbol);
  const checked = crossCheck({
    symbol: spec.symbol,
    fairValue: report.fairValue,
    quote: quote ? { bid: quote.bid, ask: quote.ask, mid: quote.mid, spreadBps: quote.spreadBps } : null,
    previous: previous ? { mid: previous.mid, ageSeconds: now - previous.observedAt } : null,
    overnightSd: MEASURED[spec.symbol]?.gaps.overnightSd ?? null,
    onchainPrice: onchainPrice ?? null,
  });

  const refused = p.hasValue && !checked.publishable;
  if (refused) withheldByCheck.push({ symbol: spec.symbol, reasons: checked.reasons });

  items.push({
    asset: address,
    fairValueE8: refused ? 0n : p.fairValueE8,
    confidenceBps: p.confidenceBps,
    // Withheld basis publishes as 0 — the guard only reaches a basis trigger
    // once the oracle gate has already passed, which requires a value.
    basisBps: refused ? 0 : Math.round(report.basisBps ?? 0),
    capacityUsdg,
    gapRisk: p.gapRisk,
    state: p.state,
    anchorAt: BigInt(p.anchorAt),
    hasValue: refused ? false : p.hasValue,
  });

  console.log(
    `  ${spec.symbol.padEnd(9)} ` +
      `fv=${p.hasValue ? (Number(p.fairValueE8) / 1e8).toFixed(2).padStart(11) : 'withheld'.padStart(11)}  ` +
      `band=${(p.confidenceBps / 100).toFixed(2).padStart(6)}%  ` +
      `basis=${(report.basisBps === undefined ? '—' : (report.basisBps / 100).toFixed(2) + '%').padStart(8)}  ` +
      `cap=${(Number(capacityUsdg) / 1e6).toFixed(0).padStart(6)}  ` +
      `gap=${String(p.gapRisk).padStart(3)}` +
      (refused ? '  ✗ WITHHELD by cross-check' : ''),
  );
  if (refused) for (const line of describeCrossCheck(checked)) console.log(`      ${line}`);
}

if (withheldByCheck.length) {
  console.log(
    `\n  ${withheldByCheck.length} value(s) withheld by the cross-check (D79). They publish as` +
      `\n  unpriceable, which is what the guard already refuses on — no number this` +
      `\n  could not defend reaches the chain:`,
  );
  for (const w of withheldByCheck) {
    for (const reason of w.reasons) console.log(`    ${w.symbol.padEnd(9)} ${reason}`);
  }
}

// If nothing can be priced, do not spend gas saying so. The previous
// observations stay where they are and go stale on their own inside `maxAge`,
// at which point the guard rejects with STALE — the same outcome as publishing
// thirty withheld values, for free instead of ~900k gas. Exiting non-zero hands
// the decision to the loop's failure counter, which is what should escalate a
// source outage rather than a quiet cycle that looks like it worked.
if (items.length && !items.some((i) => i.hasValue)) {
  await beat('withheld', 0);
  console.error(
    `\n  ✗ not one asset could be priced — the issuer is ${
      issuerState === 'closed' ? `quoting nothing (session: ${issuerPeriod ?? 'unknown'})` : 'unreachable'
    }.\n` +
      '    Publishing nothing: the existing observations go stale inside maxAge and the\n' +
      '    guard refuses on their staleness, which costs no gas to achieve.\n' +
      '    The heartbeat says which of those this is, so /api/health does not have to guess.\n',
  );
  process.exit(1);
}

const assets = items.map((i) => i.asset);

/**
 * Values the chain kept, counted from the read-back rather than from what was
 * sent. The oracle's own jump bound can refuse a value we published, so the two
 * numbers are not the same fact and only one of them is evidence.
 */
let landed = 0;

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
//
// Fetching that bound is itself a read against a node that may be behind, and
// it was the one read here with nothing defending it. An unsynced node answers
// `eth_getBlockByNumber` with a well-formed `null`, which is a *successful*
// JSON-RPC response: `retryCount` in `rpcTransport` never fires and `fallback`
// never moves to another host, because nothing failed. viem turns that null
// into `BlockNotFoundError` and it propagates.
//
// The write has already landed by this point, so the cost was never a missing
// publication. It was everything below: the per-asset read-back, and the
// withhold report that tells us the oracle refused a value we sent. On the
// worker that killed roughly one cycle in three (2026-08-17), and six in a row
// exits the loop and restarts the container.
//
// Only `BlockNotFoundError` is worth waiting out. A dead RPC or a bad key
// should still surface on the first attempt rather than ten seconds later.
const publishedAt = (await waitUntil(
  () =>
    client.getBlock({ blockNumber: receipt.blockNumber }).catch((e) => {
      if (e instanceof BlockNotFoundError) return null;
      throw e;
    }),
  (block) => block !== null,
  { attempts: 20, delayMs: 500, what: `block ${receipt.blockNumber}` },
))!.timestamp;

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
  if (obs.hasValue) landed += 1;
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

// The cycle worked. Saying so is what lets `/api/health` tell a publisher that
// stopped from one that is alive and withholding — see `src/publisher-status.ts`.
await beat('published', landed);
console.log();
