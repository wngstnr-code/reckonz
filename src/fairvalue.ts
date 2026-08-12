/**
 * FairValueOracle — the off-chain engine.
 *
 * It does NOT predict prices. It reads the mark the issuer of the token is
 * making, adjusts for how many shares that token is a claim on, and states how
 * wide the uncertainty is. Everything it publishes is a risk signal and an
 * execution guard, never a claim about the true price. That distinction is the
 * whole defensibility argument.
 *
 *     FV = issuer mid × shares/token
 *
 * **This used to predict, and stopping is the change made in D62.** The old
 * model took the last New York close from an undocumented Yahoo endpoint and
 * carried it forward with betas against index futures. It had two problems, and
 * only one of them was the licence.
 *
 * The other was that the prediction was unnecessary. Backed quotes these tokens
 * live through the night — a two-sided market they will transact in, minimum
 * $1,000, up to $20M overnight — and sampled 91 seconds apart, four of eight
 * names had moved more than a basis point. Regressing index futures onto a
 * stale close was re-deriving, badly, something a dealer was already publishing
 * with money behind it.
 *
 * The multiplier is the term that is easy to miss. A token is not one share:
 * xStock dividends are reinvested rather than paid out, so the claim grows, and
 * the issuer publishes the ratio. Measured across all thirty assets, a
 * regression of (chain vs issuer mid) on (multiplier − 1) gives slope 1.09,
 * R² 0.82 — the issuer quotes the share, the chain prices the token, and this is
 * the difference.
 *
 * Two quantities that used to be one, now separated:
 *
 *   - **the band** is uncertainty about the value *now*. While the issuer is
 *     quoting, it is that market's own spread. When nobody is quoting, it is
 *     the security's realised close-to-open jump distribution, recorded in
 *     `MEASURED`.
 *   - **gap risk** is what the position is exposed to, and keeps the jump
 *     distribution in it even while the mark is live — buying at 3am really
 *     does carry the open, however good the price is.
 *
 * Where the issuer will not quote — halted, or a token it does not carry — the
 * value is withheld rather than invented.
 */
import { issuerBook, type IssuerQuote } from './issuer';

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
   * The date the admission test in src/reconcile.ts admitted this mapping.
   *
   * Its presence — not membership of `ASSETS` — is what makes a fair value
   * publishable. Naming a reference is a claim; passing the test is evidence,
   * and only evidence gets published. `pnpm reconcile` re-runs the test against
   * live data and fails if an admitted mapping stops reconciling.
   */
  admittedOn?: string;
  /**
   * **Shares per token.** An xStock dividend is not paid to holders in cash — it
   * is reinvested by the custodian, so each token becomes a claim on slightly
   * more stock, and the issuer tracks that as a multiplier. One token stopped
   * being one share the first time the underlying paid a dividend.
   *
   * Recorded here rather than fetched at publish time, deliberately, for the
   * same reason `admittedOn` is: it is a slow-moving fact that should be
   * auditable in the repo with a date, and the oracle must not acquire a
   * new runtime dependency on somebody else's uptime to price anything. The
   * measurement run for these values had three transient failures out of thirty,
   * which is exactly the argument.
   *
   * `pnpm reconcile` re-reads the live value and reports drift, the same way it
   * reports a signal that now fits better elsewhere. Absent means never
   * measured — which is not the same statement as 1.0, and is treated as 1.0
   * only because there is nothing better to do with an unmeasured field.
   *
   * Direction was measured, not read: across the 16 assets whose multiplier is
   * not 1.0, mean |basis| against the chain is 1.10% untreated, 0.73% multiplied
   * and 1.55% divided. See D62.
   */
  multiplier?: number;
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
 *
 * **`multiplier` measured 2026-08-12** against the issuer, all thirty, rounded to
 * 1e-6 — 0.01bp on a $300 share, which is below anything this system can act on.
 * Fourteen assets sit at exactly 1.0 and that is recorded rather than omitted,
 * because "measured and unchanged" and "never measured" must not look the same.
 */
export const MULTIPLIERS_MEASURED_ON = '2026-08-12';
export const ASSETS: AssetSpec[] = [
  { symbol: 'wAAPLx', reference: 'AAPL', multiplier: 1.003269, admittedOn: '2026-08-11' },
  { symbol: 'wAMDx', reference: 'AMD', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wAMZNx', reference: 'AMZN', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wASMLx', reference: 'ASML', multiplier: 1.002866, admittedOn: '2026-08-11' },
  { symbol: 'wAVGOx', reference: 'AVGO', multiplier: 1.004884, admittedOn: '2026-08-11' },
  // The crypto-linked names fit BTC-USD better than either equity index, which
  // is the test choosing the signal rather than a human deciding Coinbase is a
  // crypto stock. wCRCLx used to carry NQ=F *and* BTC-USD; the engine sums
  // univariate betas, so two correlated signals counted the same move twice.
  { symbol: 'wCOINx', reference: 'COIN', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wCRCLx', reference: 'CRCL', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wDELLx', reference: 'DELL', multiplier: 1.003317, admittedOn: '2026-08-11' },
  { symbol: 'wEWYx', reference: 'EWY', multiplier: 1, admittedOn: '2026-08-11' },
  // Gold against a tech index is a poor fit by construction (R² 0.10). Admitted
  // anyway: the mapping is sound, and the weak carry-forward shows up honestly
  // as a wide band instead of as a missing asset.
  { symbol: 'wGLDx', reference: 'GLD', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wGOOGLx', reference: 'GOOGL', multiplier: 1.001927, admittedOn: '2026-08-11' },
  { symbol: 'wHOODx', reference: 'HOOD', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wIBMx', reference: 'IBM', multiplier: 1.020403, admittedOn: '2026-08-11' },
  { symbol: 'wINTCx', reference: 'INTC', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wIWMx', reference: 'IWM', multiplier: 1.0029, admittedOn: '2026-08-11' },
  { symbol: 'wMETAx', reference: 'META', multiplier: 1.002298, admittedOn: '2026-08-11' },
  { symbol: 'wMRVLx', reference: 'MRVL', multiplier: 1.001665, admittedOn: '2026-08-11' },
  { symbol: 'wMSFTx', reference: 'MSFT', multiplier: 1.004582, admittedOn: '2026-08-11' },
  { symbol: 'wMSTRx', reference: 'MSTR', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wMUx', reference: 'MU', multiplier: 1.000402, admittedOn: '2026-08-11' },
  { symbol: 'wNVDAx', reference: 'NVDA', multiplier: 1.000918, admittedOn: '2026-08-11' },
  { symbol: 'wORCLx', reference: 'ORCL', multiplier: 1.009319, admittedOn: '2026-08-11' },
  { symbol: 'wPLTRx', reference: 'PLTR', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wQQQx', reference: 'QQQ', multiplier: 1.002725, admittedOn: '2026-08-11' },
  // **`SKHY`, not `000660.KS`.** Withheld from D39 until 2026-08-12 because the
  // pool quoted ~86% below the Seoul share even after a live KRW leg, and the
  // conclusion drawn was "whatever that pool is pricing, it is not a claim on an
  // SK Hynix share". The rejection was right and the reason was wrong.
  //
  // The issuer's own metadata gives `underlyingIsin: US78392B2060` — a **US**
  // ISIN. The token references the US-listed depositary receipt, not the Seoul
  // ordinary share, and a DR ratio is exactly what a ~7× price difference looks
  // like. The answer sat in a field called `underlyingIsin` for the whole day we
  // spent calling this asset unpriceable.
  //
  // That is the argument for referencing the issuer in one line: the mapping was
  // never something to infer from a ticker. See D62.
  { symbol: 'wSKHYx', reference: 'SKHY', multiplier: 1, admittedOn: '2026-08-12' },
  { symbol: 'wSNDKx', reference: 'SNDK', multiplier: 1, admittedOn: '2026-08-11' },
  // SpaceX is private. There is no close to carry forward, and no engineering
  // produces one.
  // SpaceX is private and there is no listing, which is why this was withheld
  // from the beginning. It is the clearest case for referencing the issuer: no
  // exchange can price it, and the party that mints the token marks it anyway.
  // Chain agrees to ~30bp. See D62.
  { symbol: 'wSPCXx', reference: 'SPCX', multiplier: 1, admittedOn: '2026-08-12' },
  { symbol: 'wSPYx', reference: 'SPY', multiplier: 1.005715, admittedOn: '2026-08-11' },
  { symbol: 'wTSLAx', reference: 'TSLA', multiplier: 1, admittedOn: '2026-08-11' },
  { symbol: 'wTSMx', reference: 'TSM', multiplier: 1.004065, admittedOn: '2026-08-11' },
];

/** The security's own realised close-to-open jumps, measured once and recorded. */
export interface RecordedGaps {
  overnightSd: number;
  nOvernight: number;
  longSd: number;
  nLong: number;
}

export interface Measured {
  gaps: RecordedGaps;
}

/**
 * The statistics behind every fair value, **measured once and written down**.
 *
 * This used to hold betas too. They priced nothing after the carry-forward was
 * retired, and a recorded number that nothing reads is a number nobody checks,
 * so they are gone — D59's lesson applied to data instead of code.
 *
 * What remains is the close-to-open jump distribution, which the band falls back
 * to when nobody is quoting. It was measured from Yahoo once and is now
 * re-derived by `pnpm measure` from `observations/`, the store `pnpm sample`
 * builds out of the issuer's own marks. Borrowing history was the last tie to a
 * source with no licence; building it is the fix.
 *
 * The cost, stated rather than hidden: **these go stale, slowly.** The date is
 * beside them so anyone can see how old they are, and `pnpm reconcile` re-fits
 * against live data and reports the drift. That is the same contract as
 * `admittedOn` and `multiplier`: a recorded fact with a date and a check,
 * rather than a computed one with a dependency.
 *
 * Kept beside `ASSETS` rather than inside it on purpose. `ASSETS` is a table a
 * human scans — which wrapper, which reference, which signal — and burying four
 * statistics per line would destroy that. `pnpm reconcile` checks the two stay
 * in step, so the split cannot rot quietly.
 */
export const MEASURED_ON = '2026-08-12';

/**
 * The widest open-gap band recorded across admitted assets — wSNDKx at 853bp,
 * against a median of 447 and a narrowest of 98 (wSPYx). Used to normalise the
 * open-gap term in gap risk so the term spans the range it actually has.
 *
 * Re-derive it, do not adjust it by feel: it is `max(overnightSd × 1.96)` over
 * the admitted set, and `pnpm reconcile` re-measures every σ behind it.
 */
export const WIDEST_RECORDED_BAND_BPS = 853;

export const MEASURED: Record<string, Measured> = {
  wAAPLx: {
    gaps: { overnightSd: 0.00925, nOvernight: 198, longSd: 0.00843, nLong: 52 },
  },
  wAMDx: {
    gaps: { overnightSd: 0.02974, nOvernight: 198, longSd: 0.04839, nLong: 52 },
  },
  wAMZNx: {
    gaps: { overnightSd: 0.01708, nOvernight: 198, longSd: 0.0127, nLong: 52 },
  },
  wASMLx: {
    gaps: { overnightSd: 0.02279, nOvernight: 198, longSd: 0.01839, nLong: 52 },
  },
  wAVGOx: {
    gaps: { overnightSd: 0.02319, nOvernight: 198, longSd: 0.0203, nLong: 52 },
  },
  wCOINx: {
    gaps: { overnightSd: 0.02322, nOvernight: 198, longSd: 0.02533, nLong: 52 },
  },
  wCRCLx: {
    gaps: { overnightSd: 0.02787, nOvernight: 198, longSd: 0.02982, nLong: 52 },
  },
  wDELLx: {
    gaps: { overnightSd: 0.02945, nOvernight: 198, longSd: 0.01853, nLong: 52 },
  },
  wEWYx: {
    gaps: { overnightSd: 0.02814, nOvernight: 198, longSd: 0.02701, nLong: 52 },
  },
  wGLDx: {
    gaps: { overnightSd: 0.01393, nOvernight: 198, longSd: 0.01414, nLong: 52 },
  },
  wGOOGLx: {
    gaps: { overnightSd: 0.01453, nOvernight: 198, longSd: 0.01405, nLong: 52 },
  },
  wHOODx: {
    gaps: { overnightSd: 0.02444, nOvernight: 198, longSd: 0.02572, nLong: 52 },
  },
  wIBMx: {
    gaps: { overnightSd: 0.02331, nOvernight: 198, longSd: 0.0139, nLong: 52 },
  },
  wINTCx: {
    gaps: { overnightSd: 0.03579, nOvernight: 198, longSd: 0.02769, nLong: 52 },
  },
  wIWMx: {
    gaps: { overnightSd: 0.00728, nOvernight: 198, longSd: 0.00828, nLong: 52 },
  },
  wMETAx: {
    gaps: { overnightSd: 0.01886, nOvernight: 198, longSd: 0.01149, nLong: 52 },
  },
  wMRVLx: {
    gaps: { overnightSd: 0.03392, nOvernight: 198, longSd: 0.03052, nLong: 52 },
  },
  wMSFTx: {
    gaps: { overnightSd: 0.01433, nOvernight: 198, longSd: 0.00999, nLong: 52 },
  },
  wMSTRx: {
    gaps: { overnightSd: 0.02518, nOvernight: 198, longSd: 0.0326, nLong: 52 },
  },
  wMUx: {
    gaps: { overnightSd: 0.03439, nOvernight: 198, longSd: 0.03153, nLong: 52 },
  },
  wNVDAx: {
    gaps: { overnightSd: 0.01327, nOvernight: 198, longSd: 0.0146, nLong: 52 },
  },
  wORCLx: {
    gaps: { overnightSd: 0.03148, nOvernight: 198, longSd: 0.01841, nLong: 52 },
  },
  wPLTRx: {
    gaps: { overnightSd: 0.02029, nOvernight: 198, longSd: 0.01853, nLong: 52 },
  },
  wQQQx: {
    gaps: { overnightSd: 0.00786, nOvernight: 198, longSd: 0.00884, nLong: 52 },
  },
  wSKHYx: {
    gaps: { overnightSd: 0.04311, nOvernight: 189, longSd: 0.04375, nLong: 53 },
  },
  wSNDKx: {
    gaps: { overnightSd: 0.04354, nOvernight: 198, longSd: 0.03233, nLong: 52 },
  },
  wSPYx: {
    gaps: { overnightSd: 0.005, nOvernight: 198, longSd: 0.00626, nLong: 52 },
  },
  wTSLAx: {
    gaps: { overnightSd: 0.01444, nOvernight: 198, longSd: 0.01692, nLong: 52 },
  },
  wTSMx: {
    gaps: { overnightSd: 0.01889, nOvernight: 198, longSd: 0.0163, nLong: 52 },
  },
};


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
  /** last official regular-session print — of **one share**, not of the token */
  anchorPrice: number | null;
  anchorAt: number | null;
  stalenessHours: number;
  /**
   * Shares per token, from the issuer's corporate-action multiplier. `fairValue`
   * already has it applied; it is reported so the difference between "the share
   * moved" and "the token holds more shares" stays visible to a reader.
   */
  sharesPerToken: number;
  fairValue: number | null;
  /** half-width of the 95% band, in bps */
  confidenceBps: number | null;
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

// -------------------------------------------------------------- fair value

/**
 * `wAAPLx` → the issuer's `AAPLx`.
 *
 * `pnpm reconcile` resolves this against the wrapper address the issuer
 * publishes, which is evidence; here it is the mechanical strip, which is a
 * guess. It resolved 30 of 30 when checked both ways, and the address lookup
 * costs eight extra requests on a path that runs per asset — so the guess is
 * used here and the address check stays where it belongs, in the test that
 * exists to catch exactly this kind of assumption.
 */
export const issuerSymbolFor = (onchainSymbol: string) =>
  onchainSymbol.replace(/^w/, '');

/**
 * The issuer's quote, or `null` — **never a throw**.
 *
 * This module has exactly two ways to answer: a value it can defend, or a
 * withheld one. An exception is a third, and it is the worst of the three,
 * because it propagates out of the per-asset loop in `publish.ts` and takes the
 * whole run down — including the assets whose data had already arrived.
 *
 * Found by pointing `fetch` at a dead host and watching `computeFairValue`
 * throw `simulated outage` instead of returning a withheld report. An outage at
 * the source must look exactly like an asset the issuer does not carry: no
 * value, maximum risk, and a note saying so.
 */
async function issuerQuoteFor(onchainSymbol: string): Promise<IssuerQuote | null> {
  try {
    const book = await issuerBook();
    return book.get(issuerSymbolFor(onchainSymbol)) ?? null;
  } catch {
    return null;
  }
}

/**
 * The issuer's session vocabulary, mapped onto ours.
 *
 * `extended` is its own state rather than being forced into `PRE` or `POST`:
 * the issuer does not say which side of the session it is on, and picking one
 * would be wrong half the time. `PRE` and `POST` survive as types because the
 * FE renders whatever it is given and nothing switches exhaustively on them.
 */
const newYorkHour = () =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );

function stateFromIssuer(q: IssuerQuote): MarketState {
  if (q.halted) return 'NO_REFERENCE';
  switch (q.period) {
    case 'market':
      return 'OPEN';
    case 'extended':
      // The issuer says 'extended' without saying which side of the day. The
      // contract's enum has six members and src/guard.ts mirrors it line for
      // line, so inventing a seventh would move the whole stack — oracle is
      // immutable in both PolicyGuard and Executor. The side is recoverable
      // from the clock instead: an extended session never straddles noon in
      // New York, and what hour it is there is not licensed data.
      return newYorkHour() < 12 ? 'PRE' : 'POST';
    case 'overnight':
      return 'CLOSED_OVERNIGHT';
    default:
      return 'CLOSED_WEEKEND';
  }
}

export async function computeFairValue(
  spec: AssetSpec,
  opts: { now?: number; onchainPrice?: number } = {},
): Promise<FairValueReport> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const notes: string[] = [];

  // The issuer's live two-sided mark for this token. Measured, not assumed: a
  // regression of (chain vs issuer mid) on (multiplier − 1) across all thirty
  // assets gives slope 1.09, R² 0.82, intercept −4bp — so the issuer quotes
  // **one share** and the chain prices **one token**, and the multiplier below
  // is the difference rather than a double count. See D62.
  const quote = await issuerQuoteFor(spec.symbol);
  if (!quote) {
    return {
      symbol: spec.symbol,
      state: 'NO_REFERENCE',
      reference: spec.reference,
      anchorPrice: null,
      anchorAt: null,
      stalenessHours: Infinity,
      sharesPerToken: spec.multiplier ?? 1,
      fairValue: null,
      confidenceBps: null,
      onchainPrice: opts.onchainPrice,
      publishable: false,
      gapRisk: 100,
      gapRiskParts: { staleness: 1, displacement: 0, uncertainty: 1, basis: 0 },
      notes: [
        'no quote from the issuer — either it does not carry this token or the ' +
          'source is unreachable. Both mean the same thing here: no value, and the ' +
          'guard treats it exactly like missing data.',
      ],
    };
  }

  const state = stateFromIssuer(quote);
  const quoting = quote.canQuote && !quote.halted && quote.period !== 'closed';
  const anchorAt = quote.observedAt;
  const anchorPrice = quote.mid;
  const stalenessHours = Math.max(0, (now - anchorAt) / 3600);

  if (quote.halted) notes.push('the issuer has halted trading in this token');
  else if (!quoting) notes.push(`the issuer is not quoting — session ${quote.period}`);

  // Shares per token. The issuer prices *one share*; the token is a claim on
  // `sharesPerToken` of them, and the two stopped being the same number the
  // first time the underlying paid a dividend.
  const sharesPerToken = spec.multiplier ?? 1;
  const fairValue = anchorPrice * sharesPerToken;

  if (sharesPerToken !== 1) {
    notes.push(
      `token holds ${sharesPerToken.toFixed(6)} shares — ` +
        `${((sharesPerToken - 1) * 10_000).toFixed(1)}bp of reinvested dividends, ` +
        `measured ${MULTIPLIERS_MEASURED_ON}`,
    );
  }

  const measured = MEASURED[spec.symbol];
  const fxUnavailable = false;

  // The band is the empirical distribution of close-to-open jumps for this very
  // security, using the weekend sample when the gap spans a weekend, shrunk by
  // however much of that jump the signals actually explain. No scaling of daily
  // volatility across calendar time — an asset sits still over a weekend, and
  // pretending otherwise is what produced ±19% bands.
  //
  // **The band and the gap risk stopped being the same measurement here**, and
  // separating them is the point of this version.
  //
  // The band is uncertainty about the fair value *right now*. While the issuer
  // is quoting a two-sided market it will actually transact in — minimum
  // $1,000, up to $20M overnight — the honest width is that market's own
  // spread. Anything inside it is a price the issuer itself treats as fair.
  //
  // The open-gap distribution does not belong there. How far this security has
  // historically jumped between one session's close and the next session's open
  // says nothing about whether the current mark is right; it says what the
  // *position* is exposed to. So it moves to `gapRiskParts.displacement` below,
  // where a mandate can refuse on it, instead of inflating a band the guard
  // compares a live price against.
  //
  // When nobody is quoting there is no spread to use, and the jump distribution
  // becomes the only thing left — so it is the band, unshrunk. There is no
  // carry-forward to explain any part of it away any more.
  const gaps = measured?.gaps;
  const isWeekend = state === 'CLOSED_WEEKEND';
  const sample = gaps ? (isWeekend && gaps.nLong >= 5 ? gaps.longSd : gaps.overnightSd) : 0;

  // **Unmeasured must not read as zero.** An asset with no recorded gap
  // statistics — wSPCXx, whose underlying has never had a listing to measure —
  // briefly scored 2 out of 100 and came out the safest thing in the universe,
  // because a missing σ multiplied out to a zero open-gap term. Missing data is
  // the least safe state, not the most.
  const gapKnown = gaps != null && sample > 0;
  const gapBandBps = gapKnown ? sample * 1.96 * 10_000 : NaN;
  if (!gapKnown) {
    notes.push(
      'no recorded open-gap statistics for this asset — the jump it carries to the ' +
        'open is unmeasured, and scored as if it were the worst in the universe',
    );
  }

  // With nothing quoting and no gap distribution, there is nothing left to build
  // a width from, and a zero band would be a lie the guard acts on.
  const confidenceBps = quoting ? quote.spreadBps : gapKnown ? gapBandBps : null;

  if (quoting) {
    notes.push(
      `band is the issuer's own ${quote.spreadBps}bp spread for the ${quote.period} session`,
    );
  } else if (gaps) {
    notes.push(
      `nobody is quoting — band from ${isWeekend && gaps.nLong >= 5 ? `${gaps.nLong} weekend` : `${gaps.nOvernight} overnight`} gaps` +
        `, σ=${(sample * 100).toFixed(2)}%, recorded ${MEASURED_ON}`,
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

  // A basis is only meaningful when the reference genuinely corresponds to the
  // wrapped security. The FX leg that used to make this conditional is gone —
  // the issuer quotes every token in USD, including the Seoul listing that
  // needed a KRW conversion before.
  let basisBps: number | undefined;
  if (opts.onchainPrice && fairValue && !fxUnavailable) {
    basisBps = (opts.onchainPrice / fairValue - 1) * 10_000;
  }

  const parts: GapRiskBreakdown = {
    // Is anyone making a market at all? Binary on purpose: a token nobody will
    // quote is not a little bit risky, it is a different situation. This
    // replaces "hours since the last print", which measured the wrong thing
    // once the mark became live — the old model scored 0.16 here at 3am purely
    // because New York had shut eleven hours earlier, while a dealer was
    // quoting the token the whole time.
    staleness: quoting ? 0 : 1,
    // What the *position* is exposed to: how far this security has historically
    // jumped from one session's close to the next open. It stays in the score
    // while the issuer is quoting, because taking the position at 3am really
    // does carry the open, even when the mark is perfect.
    //
    // Normalised at the widest band actually recorded across admitted assets
    // (wSNDKx, 853bp) rather than at a round number, so the term spans its own
    // measured range instead of saturating. At the 300bp the carry-forward
    // displacement used, half the universe pinned at maximum and the score
    // stopped distinguishing wQQQx from wSNDKx — 98bp against 853bp.
    displacement: gapKnown ? clamp01(gapBandBps / WIDEST_RECORDED_BAND_BPS) : 1,
    uncertainty: confidenceBps == null ? 1 : clamp01(confidenceBps / 400),
    basis:
      basisBps === undefined ? 0 : clamp01(Math.abs(basisBps) / 500),
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
    sharesPerToken,
    fairValue,
    confidenceBps,
    onchainPrice: opts.onchainPrice,
    basisBps,
    publishable: spec.admittedOn != null && !quote.halted && confidenceBps != null,
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
