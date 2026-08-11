/**
 * The whole product as one streamed run.
 *
 * Every stage below is slow for an honest reason — an LLM call, the throttled
 * public RPC, a reference market — so this is an async generator rather than a
 * function that returns at the end. The page shows the pipeline working instead
 * of a spinner that hides it.
 *
 * Nothing here computes anything: it is a thin shell over the same modules the
 * CLI demos use, so the browser and the terminal can never disagree.
 */
import { parseUnits, type Address } from 'viem';
import { client, serial, USDG, XSTOCKS } from './chain';
import { computeFairValue, specFor, type FairValueReport } from './fairvalue';
import { FAIR_VALUE_ORACLE_ABI } from './abi';
import { MAINNET } from './deployments';
import { checkExecution, DEFAULT_MANDATE, type Decision } from './guard';
import {
  bestQuote,
  loadVenues,
  planBasket,
  type BasketPlan,
  type BasketTarget,
} from './planner';
import { loadToken } from './pool';
import { pickProvider } from './provider';
import {
  compileMandate,
  describeTrigger,
  type Allocation,
  type CompiledMandate,
  type Thesis,
} from './thesis';

export interface UniverseEntry {
  symbol: string;
  /** Absent when the token does not implement `name()`. */
  name?: string;
  address: Address;
}

export interface AssetVerdict {
  symbol: string;
  /** The single fill the guard was asked about, in whole USDG. */
  fillSizeUsdg: number;
  report: FairValueReport;
  onchainPrice: number | null;
  impactBps: number | null;
  effectivePrice: number | null;
  decision: Decision;
}

export type Stage = 'compile' | 'universe' | 'allocate' | 'mandate' | 'plan' | 'oracle';

/** Discriminated on `stage` + `status` so the client renders without casting. */
export type RunEvent =
  | { stage: Stage; status: 'start'; label: string }
  | { stage: 'compile'; status: 'done'; label: string; data: { thesis: Thesis; provider: string; live: boolean } }
  | { stage: 'universe'; status: 'done'; label: string; data: UniverseEntry[] }
  | { stage: 'allocate'; status: 'done'; label: string; data: Allocation }
  | {
      stage: 'mandate';
      status: 'done';
      label: string;
      data: CompiledMandate & { described: { text: string; unresolved: string[] }[] };
    }
  | { stage: 'plan'; status: 'done'; label: string; data: BasketPlan & { maxImpactBps: number } }
  | {
      stage: 'oracle';
      status: 'done';
      label: string;
      data: { verdicts: AssetVerdict[] };
    }
  | { done: true }
  | { error: string };

/** `maxAge` is a setting, not a constant, so it is read — once. */
let maxAgeCache: Promise<bigint> | null = null;
function oracleMaxAge(oracle: Address): Promise<bigint> {
  maxAgeCache ??= client.readContract({
    address: oracle,
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'maxAge',
  });
  return maxAgeCache;
}

/**
 * Let the deployed oracle override an optimistic off-chain verdict.
 *
 * `src/guard.ts` still mirrors `checkExecution` exactly; what can diverge is the
 * *input*. A value the contract withheld — because the jump bound has not
 * confirmed it — is `hasValue: false` on chain while this engine still believes
 * it. So the observation is read and, where the chain declines, the report is
 * marked unpublishable with the reason attached. No new field crosses the
 * FE seam: `publishable` and `notes` already exist and the page already renders
 * both.
 *
 * Failures here are swallowed on purpose. The chain read is a *tightening*, and
 * a demo must not break because an RPC node was slow — but a run that could not
 * check says so in the notes rather than staying silent.
 */
async function applyOnchainWithholding(
  asset: Address,
  report: FairValueReport,
  now: number,
): Promise<void> {
  const deployment = MAINNET;
  if (!deployment || !report.publishable) return;
  const oracle = deployment.contracts.FairValueOracle as Address;
  try {
    const [o, maxAge] = await Promise.all([
      client.readContract({
        address: oracle,
        abi: FAIR_VALUE_ORACLE_ABI,
        functionName: 'peek',
        args: [asset],
      }),
      oracleMaxAge(oracle),
    ]);
    if (o.updatedAt === 0n) {
      report.publishable = false;
      report.notes.push('no observation published on chain for this asset — the guard would reject NO_DATA');
      return;
    }

    // Staleness is noted, never used to flip the verdict — and the difference
    // matters. A withheld value is a statement about the *asset*: we cannot
    // defend a price for it. A stale observation is a statement about **us**:
    // nobody has published recently. Turning the second into a rejection would
    // make the page say "this trade is refused" when the truth is "our
    // publisher has not run for twenty minutes", which is a different sentence
    // about a different thing — and with publishing currently manual it would
    // refuse every asset on the page for a reason no user caused.
    //
    // So the verdict stays what the guard would decide about this market, and
    // the note says what a real fill would need first.
    const age = BigInt(now) - o.updatedAt;
    if (age > maxAge) {
      report.notes.push(
        `the on-chain observation is ${age}s old against a ${maxAge}s limit — executing for real ` +
          'would need the oracle republished first, though the verdict above still holds',
      );
    }

    if (!o.hasValue) {
      report.publishable = false;
      report.notes.push(
        'the deployed oracle is withholding this value — most likely the publish-time jump ' +
          'bound has not confirmed a move yet (D41). The chain refuses it whatever this ' +
          'estimate says.',
      );
    }
  } catch {
    report.notes.push('could not read the deployed oracle; this verdict is the off-chain estimate only');
  }
}

/** Chain reads are stable over a demo; the public RPC is not. */
let universeCache: { at: number; value: UniverseEntry[] } | null = null;
const UNIVERSE_TTL = 10 * 60_000;

export async function universe(): Promise<UniverseEntry[]> {
  if (universeCache && Date.now() - universeCache.at < UNIVERSE_TTL) return universeCache.value;
  const value = await serial(XSTOCKS, async (a: Address) => {
    const t = await loadToken(a);
    return { symbol: t.symbol, name: t.name, address: t.address };
  });
  universeCache = { at: Date.now(), value };
  return value;
}

export async function* runPipeline(
  thesisText: string,
  notional: number,
  maxImpactBps: number,
): AsyncGenerator<RunEvent> {
  const { provider, label, live } = pickProvider();

  // 1 — free text becomes a falsifiable structure
  yield { stage: 'compile', status: 'start', label: `compiling with ${label}` };
  const thesis = await provider.compile(thesisText);
  yield { stage: 'compile', status: 'done', label, data: { thesis, provider: label, live } };

  // 2 — what is actually investable, read from the chain
  yield { stage: 'universe', status: 'start', label: 'reading the xStock universe on X Layer' };
  const uni = await universe();
  yield { stage: 'universe', status: 'done', label: `${uni.length} assets`, data: uni };

  // 3 — the mapping, constrained to that universe
  yield { stage: 'allocate', status: 'start', label: 'mapping the thesis onto tradable assets' };
  const allocation = await provider.allocate(thesis, uni);
  yield {
    stage: 'allocate',
    status: 'done',
    label: `${allocation.legs.length} legs, ${allocation.unmapped.length} unmapped`,
    data: allocation,
  };

  // 4 — the mandate, out of the same compilation as the entry
  yield { stage: 'mandate', status: 'start', label: 'compiling exit triggers' };
  const mandate = compileMandate(thesis, allocation);
  yield {
    stage: 'mandate',
    status: 'done',
    label: `${mandate.exitTriggers.length} enforceable, ${mandate.manualWatch.length} manual`,
    data: {
      ...mandate,
      described: mandate.exitTriggers.map((t) => ({
        text: describeTrigger(t),
        unresolved: t.unresolved,
      })),
    },
  };

  // 5 — what the chain can absorb, against live depth
  const bySymbol = new Map(uni.map((u) => [u.symbol, u.address]));
  const targets: BasketTarget[] = allocation.legs
    .filter((l) => bySymbol.has(l.symbol))
    .map((l) => ({ asset: bySymbol.get(l.symbol)!, weightBps: l.weightBps }));

  yield {
    stage: 'plan',
    status: 'start',
    label: `sizing ${notional.toLocaleString('en-US')} USDG against live depth`,
  };
  const plan: BasketPlan = targets.length
    ? await planBasket(targets, notional, maxImpactBps)
    : { lines: [], totalUsdg: notional, naiveCost: 0, plannedCost: 0, unallocated: notional };
  yield {
    stage: 'plan',
    status: 'done',
    label: plan.unallocated > 0 ? 'capacity-limited' : 'fits',
    data: { ...plan, maxImpactBps },
  };

  // 6 — fair value and the guard's verdict, per leg
  yield { stage: 'oracle', status: 'start', label: 'fair value, gap risk, guard decision' };
  const now = Math.floor(Date.now() / 1000);

  const verdicts = await serial(plan.lines, async (line): Promise<AssetVerdict | null> => {
    const address = bySymbol.get(line.symbol);
    if (!address) return null;
    // Every tradable asset gets a verdict, including the 22 with no verified
    // reference market. Dropping those from the list would hide the guard's
    // most interesting refusal — the asset trades, we sized it, and we still
    // will not execute because we cannot defend a price for it. See D33.
    const spec = specFor(line.symbol);

    // Each leg is priced at its own planned fill. Quoting every leg at the
    // basket's largest size would ask the guard about a trade the planner
    // never proposed, and legs would fail an impact limit they respect.
    // Floored to whole USDG so float conversion cannot land a microdollar
    // above the capacity the planner solved for.
    const fillSizeUsdg = Math.max(1, Math.floor(line.notional));
    const amountIn = parseUnits(String(fillSizeUsdg), USDG.decimals);

    const venues = await loadVenues(address);
    const onchainPrice = venues[0]?.spot ?? null;
    const report = await computeFairValue(spec, {
      now,
      onchainPrice: onchainPrice ?? undefined,
    });

    // The contract has the last word, so ask it. `FairValueOracle` can withhold
    // a value this engine considers publishable — the publish-time jump bound
    // refuses a move it cannot confirm yet (D41) — and without this the page
    // would answer ALLOW where the chain answers NO_REFERENCE. Optimistic is
    // the wrong direction for a guard to be wrong in.
    await applyOnchainWithholding(address, report, now);

    const q = venues.length ? bestQuote(venues, amountIn) : null;
    const decision: Decision = q
      ? checkExecution(report, q.effectivePrice, q.impactBps, DEFAULT_MANDATE, now)
      : { ok: false, reason: 'NO_DATA', detail: 'no venue on X Layer' };

    return {
      symbol: line.symbol,
      fillSizeUsdg,
      report,
      onchainPrice,
      impactBps: q?.impactBps ?? null,
      effectivePrice: q?.effectivePrice ?? null,
      decision,
    };
  });

  const kept = verdicts.filter((v): v is AssetVerdict => v !== null);
  yield {
    stage: 'oracle',
    status: 'done',
    label: `${kept.filter((v) => v.decision.ok).length}/${kept.length} would execute`,
    data: { verdicts: kept },
  };
}
