/**
 * Thesis Compiler — free text in, a structured, executable thesis out.
 *
 * The design point: the LLM is not asked "what should I buy". It is asked to
 * make a claim falsifiable. `disconfirmingConditions` forces it to state what
 * would prove the thesis wrong, and each of those conditions is compiled into
 * an **exit trigger the guard can actually evaluate on-chain**.
 *
 * That constraint is enforced by the schema, not by the prompt: a trigger must
 * name a metric from OBSERVABLE_METRICS. Anything the system cannot measure is
 * marked `observable: false` and surfaced to the user as a manual watch item
 * rather than quietly becoming a rule that never fires.
 */
import { keccak256, toHex } from 'viem';
import { z } from 'zod';

/**
 * The complete set of quantities this system can measure at execution time.
 * Every one is already produced by the oracle (`src/fairvalue.ts`) or the
 * planner (`src/planner.ts`) — nothing here is aspirational.
 */
export const OBSERVABLE_METRICS = {
  gapRisk: 'Oracle gap-risk score, 0-100. Rises when the reference market is closed, stale, or the on-chain price cannot be reconciled.',
  basisBps: 'On-chain price versus oracle fair value, in basis points. Signed: negative means the pool is below fair value.',
  confidenceBps: 'Half-width of the oracle 95% band, in basis points. Rises when the signals explain less of the move.',
  stalenessHours: 'Hours since the reference market last printed a regular-session price.',
  drawdownBpsFromEntry: 'Loss versus the execution price recorded in the receipt, in basis points.',
  capacityUsdg: 'USDG the asset can absorb at the mandate impact limit. Falls when liquidity is withdrawn.',
  priceVsThesisEntryBps: 'Move in fair value since the thesis was compiled, in basis points.',
} as const;

export type ObservableMetric = keyof typeof OBSERVABLE_METRICS;

const metricEnum = z.enum(
  Object.keys(OBSERVABLE_METRICS) as [ObservableMetric, ...ObservableMetric[]],
);

/** A disconfirming condition that compiles to something PolicyGuard can check. */
const ExitTrigger = z.object({
  metric: metricEnum,
  comparator: z.enum(['gt', 'lt']),
  threshold: z.number(),
  /**
   * Beneficiary entity names this applies to — must match
   * `beneficiaries[].entity`, because the compile step deliberately does not
   * know on-chain symbols (D16). `compileMandate` resolves these to symbols
   * once the allocation exists. Empty means the whole basket.
   */
  appliesTo: z.array(z.string()),
});

const DisconfirmingCondition = z.object({
  /** The condition as the user would state it. */
  statement: z.string(),
  /**
   * False when no metric in OBSERVABLE_METRICS captures this. The system says
   * so instead of inventing a proxy that would never fire.
   */
  observable: z.boolean(),
  trigger: ExitTrigger.nullable(),
  /** Why this metric and threshold represent the statement, or why none does. */
  reasoning: z.string(),
});

const Beneficiary = z.object({
  /** Company or instrument, as commonly known — resolved to an on-chain asset later. */
  entity: z.string(),
  /** Where it sits in the causal chain the thesis describes. */
  rationale: z.string(),
  /** What the claim rests on. "none" is an acceptable and useful answer. */
  evidence: z.string(),
  /** 0-1. Not a probability of profit — confidence that the causal link holds. */
  confidence: z.number().min(0).max(1),
  /** Direct exposure, or a second-order beneficiary. */
  order: z.enum(['primary', 'secondary']),
});

export const ThesisSchema = z.object({
  /** The claim, restated in one falsifiable sentence. */
  claim: z.string(),
  horizonDays: z.number().int().positive(),
  /** The mechanism, step by step. If this is vague the thesis is vague. */
  causalChain: z.array(z.string()),
  beneficiaries: z.array(Beneficiary),
  disconfirmingConditions: z.array(DisconfirmingCondition),
  /** Anything the thesis assumes without stating. */
  unstatedAssumptions: z.array(z.string()),
});

export type Thesis = z.infer<typeof ThesisSchema>;

/**
 * The canonical hash of a thesis — what gets published to `ThesisRegistry` and
 * stamped into every receipt the thesis produces.
 *
 * Canonical means key order cannot change the answer. `JSON.stringify` walks an
 * object in insertion order, so the same thesis rebuilt from a different code
 * path — parsed from a fixture rather than a model response, say — would hash
 * differently and silently break the link between a thesis and its fills. Keys
 * are sorted at every depth; arrays keep their order, because the order of a
 * causal chain is part of the argument.
 *
 * The on-chain half is `ThesisRegistry.publish(contentHash, cid)`. If this
 * function changes, every previously published thesis becomes unverifiable, so
 * it must not change casually.
 */
export function thesisHash(thesis: Thesis): `0x${string}` {
  return keccak256(toHex(canonicalise(thesis)));
}

/** Deterministic JSON: sorted keys at every depth, arrays left alone. */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`;
}
export type DisconfirmingCondition = z.infer<typeof DisconfirmingCondition>;
export type ExitTrigger = z.infer<typeof ExitTrigger>;

// --------------------------------------------------------------- allocation

export const AllocationSchema = z.object({
  legs: z.array(
    z.object({
      /** Must be one of the symbols supplied in the investable universe. */
      symbol: z.string(),
      weightBps: z.number().int().min(0).max(10_000),
      /** Which beneficiary in the thesis this leg expresses. */
      expresses: z.string(),
      rationale: z.string(),
    }),
  ),
  /** Beneficiaries with no tradable asset on X Layer — reported, not hidden. */
  unmapped: z.array(z.object({ entity: z.string(), reason: z.string() })),
});

export type Allocation = z.infer<typeof AllocationSchema>;

/** A leg naming an asset that does not exist in the universe it was given. */
export interface InventedLeg {
  symbol: string;
  weightBps: number;
}

export interface ValidatedAllocation {
  /** Legs whose symbol is in the universe. The only ones anything downstream may use. */
  allocation: Allocation;
  /** Legs naming an asset that is not in the universe — reported, never dropped quietly. */
  invented: InventedLeg[];
  /** Sum of the surviving legs' weights. 10000 when nothing was lost. */
  weightBpsTotal: number;
}

/**
 * The allocation, checked against the universe it was supposed to be drawn from.
 *
 * The schema cannot do this: `symbol` is a `z.string()`, because the set of
 * tradable assets is discovered from the factory at runtime and is not knowable
 * when the schema is written. So the model can name an asset that does not
 * exist, and until 2026-08-14 the pipeline handled that with
 * `allocation.legs.filter((l) => bySymbol.has(l.symbol))` — the leg vanished.
 *
 * Vanishing was the bug. A leg's weight is a share of the notional, so dropping
 * `wAAPLx` at 30% did not reallocate anything: 30% of the basket simply never
 * got planned, and `planBasket` reported it in `unallocated` — the same field
 * that carries capital the market genuinely could not absorb. A hallucination
 * was therefore rendered to the user as *the chain refused this size*, which is
 * the one sentence this product must never say when it is not true.
 *
 * The fix is not to repair the allocation. It is to say what happened: the legs
 * that survive are executable, the invented ones are named, and the weight that
 * left with them is visible rather than folded into a capacity number.
 */
export function validateAllocation(
  allocation: Allocation,
  universeSymbols: Iterable<string>,
): ValidatedAllocation {
  const known = new Set(universeSymbols);
  const legs: Allocation['legs'] = [];
  const invented: InventedLeg[] = [];

  for (const leg of allocation.legs) {
    if (known.has(leg.symbol)) legs.push(leg);
    else invented.push({ symbol: leg.symbol, weightBps: leg.weightBps });
  }

  return {
    allocation: { legs, unmapped: allocation.unmapped },
    invented,
    weightBpsTotal: legs.reduce((sum, l) => sum + l.weightBps, 0),
  };
}

// ----------------------------------------------------------------- prompts

const COMPILER_SYSTEM = `You compile investment theses into structured, falsifiable form for an execution system.

You do not decide what to buy and you do not give investment advice. The user owns the thesis; your job is to make its structure explicit so it can be executed under a mandate and audited afterwards.

Rules:
- Restate the claim as one sentence that could be shown false. If the input is too vague to falsify, say so in the claim itself rather than inventing precision.
- The causal chain is the mechanism. Each step should follow from the one before it. If a step is a leap, that belongs in unstatedAssumptions, not in the chain.
- Beneficiaries: name the company or instrument as commonly known (e.g. "Micron", "NVIDIA", "S&P 500"). Do not guess ticker symbols or on-chain names — a later step resolves those against what is actually tradable.
- Evidence: state what the claim actually rests on. "Asserted by the user, no evidence given" is a correct and useful answer. Never manufacture a citation.
- Confidence is in the causal link holding, not in making money.
- Disconfirming conditions are the point of this exercise. State what would make the user wrong, then map each to a metric the system can measure. Only use metrics from the provided list. If none captures the condition, set observable to false and explain why — an honest gap is worth more than a proxy that never fires.
- Thresholds must be defensible from the condition, not round numbers chosen for tidiness.`;

const ALLOCATOR_SYSTEM = `You map a compiled thesis onto assets that are actually tradable, and nothing else.

Rules:
- Use only symbols from the supplied universe. If a beneficiary has no matching asset, put it in unmapped with the reason — never substitute a loosely related asset.
- Weights express conviction and position in the causal chain, and must total 10000 bps across the legs you emit.
- Every leg states which beneficiary it expresses, so the position can be traced back to the claim.
- Do not consider liquidity, position size, or execution — a later stage measures real depth and will cut or stage these weights. Your job is the mapping.`;

// ---------------------------------------------------------------- provider

export interface ThesisProvider {
  compile(text: string): Promise<Thesis>;
  allocate(thesis: Thesis, universe: { symbol: string; name?: string }[]): Promise<Allocation>;
}

// ------------------------------------------------------------- compilation

export interface ResolvedTrigger {
  trigger: ExitTrigger;
  /** On-chain symbols the trigger actually governs. Empty means whole basket. */
  symbols: string[];
  /**
   * Entities named by the trigger that have no leg in the allocation, so the
   * trigger does not cover them. Surfaced loudly: a trigger that silently
   * governs less than the user thinks is the failure this design exists to
   * prevent.
   */
  unresolved: string[];
}

export interface CompiledMandate {
  /** Derived from the observable disconfirming conditions. */
  exitTriggers: ResolvedTrigger[];
  /** Conditions the user must watch themselves. */
  manualWatch: string[];
  /** Tightest gap-risk ceiling implied by the triggers, if any. */
  maxGapRisk?: number;
  /** Horizon, carried into the rebalance cadence. */
  horizonDays: number;
}

/**
 * The step that makes the whole design cohere: the same LLM output that
 * produced the entry also produces the risk rules. Conditions the system
 * cannot measure are separated out rather than silently dropped.
 */
export function compileMandate(thesis: Thesis, allocation?: Allocation): CompiledMandate {
  const exitTriggers: ResolvedTrigger[] = [];
  const manualWatch: string[] = [];

  // entity -> the symbols that express it, from the allocation
  const symbolsByEntity = new Map<string, string[]>();
  for (const leg of allocation?.legs ?? []) {
    const key = leg.expresses.trim().toLowerCase();
    symbolsByEntity.set(key, [...(symbolsByEntity.get(key) ?? []), leg.symbol]);
  }

  for (const c of thesis.disconfirmingConditions) {
    if (!c.observable || !c.trigger) {
      manualWatch.push(c.statement);
      continue;
    }
    const symbols: string[] = [];
    const unresolved: string[] = [];
    for (const entity of c.trigger.appliesTo) {
      const hit = symbolsByEntity.get(entity.trim().toLowerCase());
      if (hit?.length) symbols.push(...hit);
      else unresolved.push(entity);
    }
    exitTriggers.push({ trigger: c.trigger, symbols, unresolved });
  }

  const gapCeilings = exitTriggers
    .map((r) => r.trigger)
    .filter((t) => t.metric === 'gapRisk' && t.comparator === 'gt')
    .map((t) => t.threshold);

  return {
    exitTriggers,
    manualWatch,
    maxGapRisk: gapCeilings.length ? Math.min(...gapCeilings) : undefined,
    horizonDays: thesis.horizonDays,
  };
}

/** Human-readable form of a resolved trigger, for the receipt and the UI. */
export function describeTrigger(r: ResolvedTrigger): string {
  const { trigger: t } = r;
  const scope = t.appliesTo.length
    ? r.symbols.length
      ? r.symbols.join(', ')
      : '(nothing, see unresolved)'
    : 'basket';
  return `${scope}: exit when ${t.metric} ${t.comparator === 'gt' ? '>' : '<'} ${t.threshold}`;
}
