/**
 * FairValueOracle — the off-chain engine.
 *
 * It does NOT predict prices. It carries the last official print forward using
 * instruments that are still trading, and states how wide the resulting band is.
 * Everything it publishes is a risk signal and an execution guard, never a claim
 * about the true price. That distinction is the whole defensibility argument.
 *
 *     FV = P_close × (1 + Σ βᵢ · rᵢ)     rᵢ = signal return since P_close
 *
 * β comes from OLS on a year of aligned daily returns. The band comes from the
 * security's own realised close-to-open jumps — weekend gaps sampled separately
 * from overnight gaps — shrunk by however much of that jump the signals explain.
 * It is deliberately not daily volatility scaled across calendar time: an asset
 * sits still over a weekend, and pretending otherwise produces ±19% bands.
 *
 * When there is no reference market (wSPCXx — SpaceX is private), or the
 * reference cannot be proven to match the wrapped security (wSKHYx quotes in
 * KRW), the oracle marks the value unpublishable rather than inventing one.
 */
import {
  alignedReturns,
  byDate,
  daily,
  gapStats,
  intraday,
  priceAt,
  type Series,
} from './marketdata';

export type MarketState =
  | 'OPEN'
  | 'PRE'
  | 'POST'
  | 'CLOSED_OVERNIGHT'
  | 'CLOSED_WEEKEND'
  | 'NO_REFERENCE';

export interface AssetSpec {
  /** on-chain symbol on X Layer */
  symbol: string;
  /** reference listing, or null for assets with no public market */
  reference: string | null;
  /** 24/7 or extended-hours instruments used to carry the close forward */
  signals: string[];
}

export const ASSETS: AssetSpec[] = [
  { symbol: 'wSPYx', reference: 'SPY', signals: ['ES=F'] },
  { symbol: 'wNVDAx', reference: 'NVDA', signals: ['NQ=F'] },
  { symbol: 'wMUx', reference: 'MU', signals: ['NQ=F'] },
  { symbol: 'wSNDKx', reference: 'SNDK', signals: ['NQ=F'] },
  { symbol: 'wINTCx', reference: 'INTC', signals: ['NQ=F'] },
  // The reference market is Seoul, so this asset's "closed" window is the
  // opposite of every US name — a fact no single-calendar oracle would model.
  { symbol: 'wSKHYx', reference: '000660.KS', signals: ['NQ=F'] },
  { symbol: 'wCRCLx', reference: 'CRCL', signals: ['NQ=F', 'BTC-USD'] },
  // SpaceX is private. There is no close to carry forward.
  { symbol: 'wSPCXx', reference: null, signals: [] },
];

export interface SignalContribution {
  symbol: string;
  beta: number;
  /** signal return since the equity's last official print */
  returnPct: number;
  /** contribution to the fair-value move, in bps */
  contributionBps: number;
  r2: number;
}

export interface GapRiskBreakdown {
  staleness: number;
  displacement: number;
  uncertainty: number;
  basis: number;
}

export interface FairValueReport {
  symbol: string;
  state: MarketState;
  reference: string | null;
  /** last official regular-session print */
  anchorPrice: number | null;
  anchorAt: number | null;
  stalenessHours: number;
  fairValue: number | null;
  /** half-width of the 95% band, in bps */
  confidenceBps: number | null;
  signals: SignalContribution[];
  /** price observed on X Layer, if supplied */
  onchainPrice?: number;
  /** on-chain price vs fair value, in bps */
  basisBps?: number;
  /**
   * False when the value must not be published on-chain at all: no reference
   * market, or a reference we cannot yet prove corresponds to the wrapped
   * security. Consumers treat this exactly like missing data.
   */
  publishable: boolean;
  gapRisk: number;
  gapRiskParts: GapRiskBreakdown;
  notes: string[];
}

// ------------------------------------------------------------------- stats

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

/** OLS slope of y on x, plus R² and residual standard deviation. */
export function regress(
  y: number[],
  x: number[],
): { beta: number; r2: number; residSd: number } {
  const n = Math.min(y.length, x.length);
  if (n < 20) return { beta: 0, r2: 0, residSd: 0 };

  const ys = y.slice(-n);
  const xs = x.slice(-n);
  const my = mean(ys);
  const mx = mean(xs);

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return { beta: 0, r2: 0, residSd: 0 };

  const beta = sxy / sxx;
  const alpha = my - beta * mx;

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = ys[i]! - (alpha + beta * xs[i]!);
    sse += e * e;
  }
  return {
    beta,
    r2: syy === 0 ? 0 : 1 - sse / syy,
    residSd: Math.sqrt(sse / (n - 2)),
  };
}

// ----------------------------------------------------------------- session

export function classifySession(ref: Series, now: number): MarketState {
  const s = ref.session;
  if (!s) return 'CLOSED_OVERNIGHT';
  if (now >= s.regularStart && now < s.regularEnd) return 'OPEN';
  if (now >= s.preStart && now < s.regularStart) return 'PRE';
  if (now >= s.regularEnd && now < s.postEnd) return 'POST';

  // More than ~2 days since the last regular print means a weekend or holiday
  // rather than an ordinary overnight gap.
  const gapHours = (now - ref.lastRegularPrintAt) / 3600;
  return gapHours > 26 ? 'CLOSED_WEEKEND' : 'CLOSED_OVERNIGHT';
}

// -------------------------------------------------------------- fair value

const SIGNAL_CACHE = new Map<string, Promise<{ intra: Series; day: Series }>>();

function loadSignal(symbol: string) {
  let p = SIGNAL_CACHE.get(symbol);
  if (!p) {
    p = (async () => ({
      intra: await intraday(symbol),
      day: await daily(symbol),
    }))();
    SIGNAL_CACHE.set(symbol, p);
  }
  return p;
}

export async function computeFairValue(
  spec: AssetSpec,
  opts: { now?: number; onchainPrice?: number } = {},
): Promise<FairValueReport> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const notes: string[] = [];

  if (!spec.reference) {
    // No public market: publish nothing, flag maximum risk. This is the honest
    // answer for wSPCXx and it is why a separate private-market price discovery
    // product is a different problem, not a parameter of this one.
    return {
      symbol: spec.symbol,
      state: 'NO_REFERENCE',
      reference: null,
      anchorPrice: null,
      anchorAt: null,
      stalenessHours: Infinity,
      fairValue: null,
      confidenceBps: null,
      signals: [],
      onchainPrice: opts.onchainPrice,
      publishable: false,
      gapRisk: 100,
      gapRiskParts: { staleness: 1, displacement: 0, uncertainty: 1, basis: 0 },
      notes: ['no public reference market — fair value withheld by design'],
    };
  }

  const refIntra = await intraday(spec.reference);
  const refDaily = await daily(spec.reference);

  const state = classifySession(refIntra, now);
  const anchorAt = refIntra.lastRegularPrintAt;
  const anchorPrice = refIntra.last;
  const stalenessHours = (now - anchorAt) / 3600;

  // While the reference market is open, its own print is the fair value.
  if (state === 'OPEN') {
    notes.push('reference market open — fair value is the live print');
  }

  const refDailyByDate = byDate(refDaily);
  const contributions: SignalContribution[] = [];
  let moveLog = 0;
  let bestR2 = 0;

  for (const sig of spec.signals) {
    const { intra, day } = await loadSignal(sig);

    const at = priceAt(intra, anchorAt);
    const nowPrice = priceAt(intra, now) ?? intra.last;
    if (at == null || !(at > 0) || !(nowPrice > 0)) {
      notes.push(`${sig}: no overlapping quote, skipped`);
      continue;
    }

    const { ra, rb } = alignedReturns(refDailyByDate, byDate(day));
    const { beta, r2, residSd } = regress(ra, rb);
    if (ra.length < 20) notes.push(`${sig}: only ${ra.length} aligned days`);

    const r = Math.log(nowPrice / at);
    moveLog += beta * r;
    bestR2 = Math.max(bestR2, Math.max(0, r2));
    void residSd; // band comes from realised gaps, not from daily residuals

    contributions.push({
      symbol: sig,
      beta,
      returnPct: (Math.exp(r) - 1) * 100,
      contributionBps: (Math.exp(beta * r) - 1) * 10_000,
      r2,
    });
  }

  const fairValue =
    state === 'OPEN' ? anchorPrice : anchorPrice * Math.exp(moveLog);

  // The band is the empirical distribution of close-to-open jumps for this very
  // security, using the weekend sample when the gap spans a weekend, shrunk by
  // however much of that jump the signals actually explain. No scaling of daily
  // volatility across calendar time — an asset sits still over a weekend, and
  // pretending otherwise is what produced ±19% bands.
  const gaps = gapStats(refDaily);
  const isLongGap = stalenessHours > 48;
  const sample = isLongGap && gaps.nLong >= 5 ? gaps.longSd : gaps.overnightSd;
  const unexplained = Math.sqrt(Math.max(0, 1 - bestR2));
  const confidenceBps = state === 'OPEN' ? 0 : sample * unexplained * 1.96 * 10_000;

  if (state !== 'OPEN') {
    notes.push(
      `band from ${isLongGap && gaps.nLong >= 5 ? `${gaps.nLong} weekend` : `${gaps.nOvernight} overnight`} gaps` +
        `, σ=${(sample * 100).toFixed(2)}%, ${(unexplained * 100).toFixed(0)}% unexplained`,
    );
  }

  const displacementBps = (Math.exp(moveLog) - 1) * 10_000;

  // A basis is only meaningful when both legs are quoted in the same currency
  // and the reference genuinely corresponds to the wrapped security. Where that
  // is unproven, withhold the number rather than print a misleading one.
  let basisBps: number | undefined;
  if (opts.onchainPrice && fairValue) {
    if (refIntra.currency !== 'USD') {
      notes.push(
        `reference quoted in ${refIntra.currency}; basis withheld until an FX leg and the wrapper's reference security are verified`,
      );
    } else {
      basisBps = (opts.onchainPrice / fairValue - 1) * 10_000;
    }
  }

  // An unverifiable basis is the riskiest state of all — it means we cannot
  // tell whether the pool is mispriced. It must score higher than a known
  // small basis, never zero.
  const basisUnverified = refIntra.currency !== 'USD';

  const parts: GapRiskBreakdown = {
    staleness: clamp01(stalenessHours / 72),
    displacement: clamp01(Math.abs(displacementBps) / 300),
    uncertainty: clamp01(confidenceBps / 400),
    basis: basisUnverified
      ? 1
      : basisBps === undefined
        ? 0
        : clamp01(Math.abs(basisBps) / 500),
  };

  const gapRisk = Math.round(
    100 *
      clamp01(
        0.25 * parts.staleness +
          0.25 * parts.displacement +
          0.25 * parts.uncertainty +
          0.25 * parts.basis,
      ),
  );

  return {
    symbol: spec.symbol,
    state,
    reference: spec.reference,
    anchorPrice,
    anchorAt,
    stalenessHours,
    fairValue,
    confidenceBps,
    signals: contributions,
    onchainPrice: opts.onchainPrice,
    basisBps,
    publishable: !basisUnverified,
    gapRisk,
    gapRiskParts: parts,
    notes,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Encoded exactly as the on-chain struct expects. */
export function toOraclePayload(r: FairValueReport) {
  const STATE_ENUM: Record<MarketState, number> = {
    OPEN: 0,
    PRE: 1,
    POST: 2,
    CLOSED_OVERNIGHT: 3,
    CLOSED_WEEKEND: 4,
    NO_REFERENCE: 5,
  };
  return {
    symbol: r.symbol,
    fairValueE8: r.fairValue == null ? 0n : BigInt(Math.round(r.fairValue * 1e8)),
    confidenceBps: r.confidenceBps == null ? 0 : Math.round(r.confidenceBps),
    gapRisk: r.gapRisk,
    state: STATE_ENUM[r.state],
    anchorAt: r.anchorAt ?? 0,
    hasValue: r.fairValue != null && r.publishable,
  };
}
