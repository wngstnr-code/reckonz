/**
 * The admission test for a reference market.
 *
 * `ASSETS` in src/fairvalue.ts used to be hand-made, and D33 recorded the cost:
 * eight of thirty xStocks had a defensible fair value, and the other twenty-two
 * were withheld not because they were indefensible but because nobody had got
 * round to them. "Not yet mapped" and "cannot be defended" are different
 * statements, and printing the second when the first is true is the same class
 * of dishonesty this oracle exists to avoid.
 *
 * The fix is not to add wAAPLx → AAPL because it is obviously Apple. Naming a
 * candidate is the cheap half; the candidate has to *earn* the mapping. This
 * module is the test that admits it:
 *
 *   1. a candidate reference exists at all                     — NO_CANDIDATE
 *   2. the reference resolves and prints a price               — NO_QUOTE
 *   3. it quotes in USD, so a basis is computable at all       — FX_REQUIRED
 *   4. the wrapper has a live pool to compare against          — NO_VENUE
 *   5. the on-chain price reconciles with the reference        — BASIS
 *   6. enough aligned history to fit a carry-forward beta      — NO_HISTORY
 *
 * Step 5 is the one that matters. wSKHYx names a real, correct reference —
 * SK Hynix, 000660.KS — and still fails, because the listing quotes in KRW and
 * the raw basis comes out near −99%. That rejection is the proof the test has
 * teeth, and it is why the list this produces is *measured* rather than
 * asserted. An asset outside it is outside it for a reason we can print.
 *
 * What this test does NOT do is judge the quality of the resulting fair value.
 * A reference with a weak beta fit is admitted, then carries a wide band, a
 * high uncertainty term in gap risk, and gets refused at the guard on its own
 * merits. Rejecting it here would hide a measurable answer behind a missing one.
 */
import type { Address } from 'viem';
import { serial } from './chain';
import { alignedReturns, byDate, daily, intraday } from './marketdata';
import { regress } from './fairvalue';
import { loadVenues } from './planner';
import { addressBySymbol } from './pool';

/**
 * The identity threshold: how far the chain's price may sit from the reference
 * before we stop believing they are the same security.
 *
 * This is deliberately loose, and looseness is not sloppiness — it is the right
 * shape for the question. The test asks *"is this wrapper a claim on that
 * listing?"*, not *"is this wrapper fairly priced?"* The second question is
 * `checkExecution`'s, and its tolerance is 100bp plus the band. A wrapper that
 * really tracks its reference sits within a few percent of it; one that tracks
 * something else — or quotes in another currency — is out by an order of
 * magnitude. The measured distribution partitions the same way anywhere between
 * 5% and 50%, so the exact cut carries no weight. See `pnpm reconcile`.
 */
export const MAX_IDENTITY_BASIS_BPS = 2_000;

/**
 * `regress` needs 20 observations before it will return a slope at all. Sixty
 * aligned trading days is roughly a quarter — enough that the beta is a fit
 * rather than a coincidence, and still reachable for a listing that IPO'd
 * inside the last year.
 */
export const MIN_ALIGNED_DAYS = 60;

/**
 * The 24/7 instruments that can carry a US close forward. Every candidate is
 * fitted against all of them and the best R² wins, so signal choice is measured
 * rather than assigned by eye — the same discipline as the mapping itself.
 *
 * They are correlated with each other, which is exactly why only the winner is
 * kept: the fair-value engine sums univariate betas, so listing two overlapping
 * signals would count the same move twice.
 */
export const SIGNAL_CANDIDATES = ['NQ=F', 'ES=F', 'BTC-USD'] as const;

/**
 * The reference each wrapper claims to track, before any of it is believed.
 *
 * xStock tickers are `w<TICKER>x`, so the candidate is mechanical — and being
 * mechanical is the point: this table is a guess generator, not a source of
 * truth. Overrides exist only where the mechanical strip produces something
 * that is not a listing.
 */
const REFERENCE_OVERRIDES: Record<string, string | null> = {
  // Seoul listing, quoted in KRW. Named correctly and still fails the test —
  // see the FX_REQUIRED path, and D38.
  wSKHYx: '000660.KS',
  // SpaceX is private. There is no listing to reconcile against, and no amount
  // of engineering produces one.
  wSPCXx: null,
};

/** `wAAPLx` → `AAPL`. The naive guess, which then has to survive the test. */
export function candidateReference(symbol: string): string | null {
  if (symbol in REFERENCE_OVERRIDES) return REFERENCE_OVERRIDES[symbol]!;
  const m = /^w(.+)x$/.exec(symbol);
  return m ? m[1]! : null;
}

export type ReconcileVerdict = 'ADMIT' | 'REJECT';

export type ReconcileReason =
  | 'NO_CANDIDATE'
  | 'NO_QUOTE'
  | 'FX_REQUIRED'
  | 'NO_VENUE'
  | 'BASIS'
  | 'NO_HISTORY';

export interface SignalFit {
  symbol: string;
  beta: number;
  r2: number;
  alignedDays: number;
}

export interface ReconcileResult {
  symbol: string;
  address: Address;
  candidate: string | null;
  verdict: ReconcileVerdict;
  reason?: ReconcileReason;
  detail?: string;
  currency?: string;
  referencePrice?: number;
  onchainPrice?: number;
  /** on-chain price vs the reference's own last print, in bps */
  basisBps?: number;
  /** every signal that fitted, best R² first */
  fits: SignalFit[];
}

/**
 * Run the admission test for one wrapper.
 *
 * Every gate returns the *measured* reason it failed, so a rejection can be
 * quoted at a user. "No reference market" with nothing behind it is the answer
 * this module exists to stop producing.
 */
export async function reconcile(
  symbol: string,
  address: Address,
): Promise<ReconcileResult> {
  const base = { symbol, address, fits: [] as SignalFit[] };
  const candidate = candidateReference(symbol);

  if (!candidate) {
    return {
      ...base,
      candidate: null,
      verdict: 'REJECT',
      reason: 'NO_CANDIDATE',
      detail: 'no public listing to reconcile against',
    };
  }

  let refIntra;
  let refDaily;
  try {
    refIntra = await intraday(candidate);
    refDaily = await daily(candidate);
  } catch (e) {
    return {
      ...base,
      candidate,
      verdict: 'REJECT',
      reason: 'NO_QUOTE',
      detail: `${candidate} did not resolve: ${(e as Error).message}`,
    };
  }

  if (!(refIntra.last > 0)) {
    return {
      ...base,
      candidate,
      verdict: 'REJECT',
      reason: 'NO_QUOTE',
      detail: `${candidate} resolved but printed no price`,
    };
  }

  // Fit the carry-forward signals before the currency gate, so an asset blocked
  // on FX still reports how well it *would* model. That is what turns "blocked
  // on an FX leg" into a sized piece of work rather than a shrug.
  const refByDate = byDate(refDaily);
  const fits: SignalFit[] = [];
  for (const sig of SIGNAL_CANDIDATES) {
    const sigDaily = await daily(sig);
    const { ra, rb } = alignedReturns(refByDate, byDate(sigDaily));
    if (ra.length < MIN_ALIGNED_DAYS) continue;
    const { beta, r2 } = regress(ra, rb);
    fits.push({ symbol: sig, beta, r2, alignedDays: ra.length });
  }
  fits.sort((a, b) => b.r2 - a.r2);
  const withFits = { ...base, candidate, fits, currency: refIntra.currency, referencePrice: refIntra.last };

  if (refIntra.currency !== 'USD') {
    return {
      ...withFits,
      verdict: 'REJECT',
      reason: 'FX_REQUIRED',
      detail:
        `${candidate} quotes in ${refIntra.currency}; the basis against a USDG pool ` +
        'is not computable without an FX leg',
    };
  }

  const venues = await loadVenues(address);
  const onchainPrice = venues[0]?.spot;
  if (!onchainPrice || !(onchainPrice > 0)) {
    return {
      ...withFits,
      verdict: 'REJECT',
      reason: 'NO_VENUE',
      detail: 'no USDG pool with a readable spot price',
    };
  }

  const basisBps = (onchainPrice / refIntra.last - 1) * 10_000;
  if (Math.abs(basisBps) > MAX_IDENTITY_BASIS_BPS) {
    return {
      ...withFits,
      onchainPrice,
      basisBps,
      verdict: 'REJECT',
      reason: 'BASIS',
      detail:
        `chain quotes ${onchainPrice.toFixed(2)} against ${candidate} at ` +
        `${refIntra.last.toFixed(2)} — ${(basisBps / 100).toFixed(1)}%, too far apart ` +
        'to be the same security',
    };
  }

  if (fits.length === 0) {
    return {
      ...withFits,
      onchainPrice,
      basisBps,
      verdict: 'REJECT',
      reason: 'NO_HISTORY',
      detail: `fewer than ${MIN_ALIGNED_DAYS} aligned days against any signal — no beta to fit`,
    };
  }

  return { ...withFits, onchainPrice, basisBps, verdict: 'ADMIT' };
}

/** The whole X Layer universe, tested one at a time — the public RPC fans out badly. */
export async function reconcileUniverse(): Promise<ReconcileResult[]> {
  const index = await addressBySymbol();
  return serial([...index.entries()], ([symbol, address]) => reconcile(symbol, address));
}
