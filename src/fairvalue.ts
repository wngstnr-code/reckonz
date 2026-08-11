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
 * A reference quoted in another currency is converted through a live FX leg, so
 * the equity leg is the only thing ever carried forward. When there is no
 * reference market at all (wSPCXx — SpaceX is private), or the reference does
 * not reconcile with what the chain quotes (wSKHYx, −86%), the oracle marks the
 * value unpublishable rather than inventing one.
 */
import {
  alignedReturns,
  byDate,
  daily,
  gapStats,
  intraday,
  priceAt,
  toUsd,
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
  /**
   * The 24/7 instrument used to carry the close forward, chosen as the best
   * R² among the candidates in src/reconcile.ts rather than assigned by eye.
   */
  signals: string[];
  /**
   * The date the admission test in src/reconcile.ts admitted this mapping.
   *
   * Its presence — not membership of `ASSETS` — is what makes a fair value
   * publishable. Naming a reference is a claim; passing the test is evidence,
   * and only evidence gets published. `pnpm reconcile` re-runs the test against
   * live data and fails if an admitted mapping stops reconciling.
   */
  admittedOn?: string;
  /**
   * Why the value is withheld for an asset the test did not admit. The cases
   * look identical to a consumer — all unpublishable — but they are not the
   * same statement to a user, and saying the wrong one is the failure D33 was
   * about.
   */
  noReferenceNote?: string;
}

/**
 * Every xStock the admission test has an answer for, and what that answer was.
 *
 * This list is **measured**, not curated. `pnpm reconcile` names a candidate
 * reference for each wrapper, pulls its live quote, compares it against the
 * price X Layer is actually quoting, and admits the mapping only if the two
 * reconcile. 28 of 30 passed on 2026-08-11 with a widest basis of 2.0%; the two
 * that failed did so by an order of magnitude, not by a hair. See D38.
 *
 * The signal on each line is the one that fitted best, and its R² is not
 * filtered on: a weak fit is admitted and then pays for itself with a wide band
 * and a high uncertainty term in gap risk, which the guard acts on. Hiding a
 * measurable answer behind a missing one would be the worse trade.
 */
export const ASSETS: AssetSpec[] = [
  { symbol: 'wAAPLx', reference: 'AAPL', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wAMDx', reference: 'AMD', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wAMZNx', reference: 'AMZN', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wASMLx', reference: 'ASML', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wAVGOx', reference: 'AVGO', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  // The crypto-linked names fit BTC-USD better than either equity index, which
  // is the test choosing the signal rather than a human deciding Coinbase is a
  // crypto stock. wCRCLx used to carry NQ=F *and* BTC-USD; the engine sums
  // univariate betas, so two correlated signals counted the same move twice.
  { symbol: 'wCOINx', reference: 'COIN', signals: ['BTC-USD'], admittedOn: '2026-08-11' },
  { symbol: 'wCRCLx', reference: 'CRCL', signals: ['BTC-USD'], admittedOn: '2026-08-11' },
  { symbol: 'wDELLx', reference: 'DELL', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wEWYx', reference: 'EWY', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  // Gold against a tech index is a poor fit by construction (R² 0.10). Admitted
  // anyway: the mapping is sound, and the weak carry-forward shows up honestly
  // as a wide band instead of as a missing asset.
  { symbol: 'wGLDx', reference: 'GLD', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wGOOGLx', reference: 'GOOGL', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wHOODx', reference: 'HOOD', signals: ['BTC-USD'], admittedOn: '2026-08-11' },
  { symbol: 'wIBMx', reference: 'IBM', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wINTCx', reference: 'INTC', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wIWMx', reference: 'IWM', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wMETAx', reference: 'META', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wMRVLx', reference: 'MRVL', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wMSFTx', reference: 'MSFT', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wMSTRx', reference: 'MSTR', signals: ['BTC-USD'], admittedOn: '2026-08-11' },
  { symbol: 'wMUx', reference: 'MU', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wNVDAx', reference: 'NVDA', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wORCLx', reference: 'ORCL', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wPLTRx', reference: 'PLTR', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wQQQx', reference: 'QQQ', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  // Named correctly, converted correctly, and still not admitted. The KRW leg is
  // built and live, so this is no longer a gap in our tooling: X Layer quotes
  // wSKHYx at ~$137 against a share worth ~$1,008 on two independent venues that
  // agree within 1.6%. Whatever that pool is pricing, the test cannot call it a
  // claim on an SK Hynix share, so the oracle withholds. See D39.
  {
    symbol: 'wSKHYx',
    reference: '000660.KS',
    signals: ['NQ=F'],
    noReferenceNote:
      'reference market identified (SK Hynix, 000660.KS) and converted to USD, but ' +
      'the X Layer pool quotes ~86% below the share — the wrapper does not reconcile ' +
      'with the listing, so fair value is withheld',
  },
  { symbol: 'wSNDKx', reference: 'SNDK', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  // SpaceX is private. There is no close to carry forward, and no engineering
  // produces one.
  { symbol: 'wSPCXx', reference: null, signals: [] },
  { symbol: 'wSPYx', reference: 'SPY', signals: ['ES=F'], admittedOn: '2026-08-11' },
  { symbol: 'wTSLAx', reference: 'TSLA', signals: ['NQ=F'], admittedOn: '2026-08-11' },
  { symbol: 'wTSMx', reference: 'TSM', signals: ['NQ=F'], admittedOn: '2026-08-11' },
];

/**
 * The spec for any xStock, admitted or not.
 *
 * A wrapper that appears on X Layer before the test has run on it still has to
 * be mappable — the allocator must be allowed to size a thesis against its real
 * depth. What it must not do is pass the guard: no admitted reference means no
 * defensible fair value, so it comes back withheld at maximum gap risk and
 * `PolicyGuard` refuses it, for the true reason rather than the false claim that
 * the asset does not exist. See D33.
 */
export function specFor(symbol: string): AssetSpec {
  return (
    ASSETS.find((a) => a.symbol === symbol) ?? {
      symbol,
      reference: null,
      signals: [],
      noReferenceNote:
        'tradable on X Layer, but the reference-market admission test has not ' +
        'been run on it — fair value withheld until it is',
    }
  );
}

/** True when the admission test admitted this asset's reference market. */
export function isModelled(symbol: string): boolean {
  return ASSETS.some((a) => a.symbol === symbol && a.admittedOn != null);
}

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
      notes: [spec.noReferenceNote ?? 'no public reference market — fair value withheld by design'],
    };
  }

  // A reference quoted in another currency is converted to USD once, here, so
  // every calculation downstream is currency-blind. Where the FX leg is
  // unavailable the raw series is kept and the basis is marked unverifiable —
  // the same refusal as before, now reached only when it is actually true.
  const refIntraRaw = await intraday(spec.reference);
  const refDailyRaw = await daily(spec.reference);
  const refIntraUsd = await toUsd(refIntraRaw);
  const refDailyUsd = await toUsd(refDailyRaw);
  const fxUnavailable = refIntraUsd == null || refDailyUsd == null;
  const refIntra = refIntraUsd ?? refIntraRaw;
  const refDaily = refDailyUsd ?? refDailyRaw;

  if (refIntra.nativeCurrency) {
    notes.push(
      `reference quotes in ${refIntra.nativeCurrency}, converted at ` +
        `${refIntra.fxRate!.toFixed(2)} ${refIntra.nativeCurrency}/USD — the FX leg is live, ` +
        'so only the equity component is carried forward',
    );
  } else if (fxUnavailable) {
    notes.push(
      `reference quotes in ${refIntraRaw.currency} and no ${refIntraRaw.currency}/USD rate ` +
        'is available — basis withheld',
    );
  }

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

  // Naming a reference is a claim; passing the admission test is evidence. Only
  // evidence gets published. An asset whose mapping was never admitted still
  // computes a fair value here — the number is worth showing — but it leaves
  // marked unpublishable, so the guard treats it exactly like missing data.
  //
  // This note is pushed before any other withholding note on purpose: the guard
  // quotes the first one it finds, and "the test did not admit this mapping" is
  // the reason a user needs, ahead of the mechanism that produced it.
  if (!spec.admittedOn) {
    notes.push(
      spec.noReferenceNote ??
        'reference market not admitted by the reconciliation test — fair value withheld',
    );
  }

  const displacementBps = (Math.exp(moveLog) - 1) * 10_000;

  // A basis is only meaningful when both legs are quoted in the same currency
  // and the reference genuinely corresponds to the wrapped security. Where that
  // is unproven, withhold the number rather than print a misleading one.
  let basisBps: number | undefined;
  if (opts.onchainPrice && fairValue && !fxUnavailable) {
    basisBps = (opts.onchainPrice / fairValue - 1) * 10_000;
  }

  // An unverifiable basis is the riskiest state of all — it means we cannot
  // tell whether the pool is mispriced. It must score higher than a known
  // small basis, never zero.
  const basisUnverified = fxUnavailable;

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
    publishable: spec.admittedOn != null && !basisUnverified,
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
