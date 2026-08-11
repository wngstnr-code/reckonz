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
import { serial, USDG, XSTOCKS } from './chain';
import { computeFairValue, specFor, type FairValueReport } from './fairvalue';
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
