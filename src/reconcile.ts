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
 *   3. a USD rate exists for the currency it quotes in         — FX_REQUIRED
 *   1. the issuer carries a token at this address             — NOT_CARRIED
 *   2. the issuer publishes a price for it                     — NO_QUOTE
 *   3. the issuer has not halted it                            — HALTED
 *   4. the wrapper has a live pool to compare against          — NO_VENUE
 *   5. the chain agrees with the issuer's mark                 — BASIS
 *
 * **The reference is the issuer's mark, not an exchange listing** (D62), and
 * wSKHYx is why that matters rather than being a licence convenience. The old
 * test rejected it at −86% against `000660.KS` and concluded the pool was not
 * pricing a claim on an SK Hynix share. The rejection was right; the reason was
 * wrong. The issuer's `underlyingIsin` is `US78392B2060` — a US depositary
 * receipt, not the Seoul ordinary share — and a DR ratio is what a ~7× gap looks
 * like. No amount of care with the exchange reference would have found that,
 * because the exchange reference was the thing that was wrong.
 *
 * Step 5 is still the one that matters, and it is now like-for-like: the
 * issuer's mid times shares per token, against the chain. Comparing a token
 * against one share was measuring the dividend history and calling it basis.
 *
 * What this test does NOT do is judge the quality of the resulting fair value.
 * An asset with no recorded gap statistics is admitted, then carries the
 * maximum open-gap term and a note saying it is unmeasured. Rejecting it here
 * would hide a measurable answer behind a missing one.
 */
import type { Address } from 'viem';
import { serial } from './chain';
import { issuerBook, issuerFor, multiplierFor } from './issuer';
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

export type ReconcileVerdict = 'ADMIT' | 'REJECT';

export type ReconcileReason =
  /** the issuer has no token at this address */
  | 'NOT_CARRIED'
  /** carried, but the issuer publishes no price */
  | 'NO_QUOTE'
  /** the issuer has stopped trading it */
  | 'HALTED'
  /** no USDG pool on X Layer to compare against */
  | 'NO_VENUE'
  /** the chain and the issuer disagree by too much to be the same security */
  | 'BASIS';

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
  /** the currency the reference venue quotes in, before conversion */
  currency?: string;
  /** units of `currency` per USD used to convert, when one was needed */
  fxRate?: number;
  /** the reference's last print, in USD */
  referencePrice?: number;
  onchainPrice?: number;
  /** on-chain price vs the reference's own last print, in bps */
  basisBps?: number;
  /** every signal that fitted, best R² first */
  fits: SignalFit[];
  /**
   * What the issuer says, observed alongside the reference and **used for
   * nothing**. No verdict below depends on any of these fields.
   *
   * They are here to answer one question with measurements instead of opinion:
   * could Backed replace Yahoo as the reference leg? A third opinion on the same
   * quantity is also worth having on its own merits — two sources that agree are
   * a much stronger claim than one source nobody can check. See D62.
   */
  issuer?: IssuerObservation;
}

export interface IssuerObservation {
  /** the issuer's symbol, resolved by wrapper address where possible */
  symbol: string;
  /** midpoint of the issuer's two-sided quote for the token */
  mid?: number;
  /** the issuer's own spread for the session it is currently in */
  spreadBps?: number;
  period?: string;
  halted?: boolean;
  /** shares per token — 1.0 until a dividend or split moves it */
  multiplier?: number;
  /** on-chain price vs the issuer's mid, in bps */
  basisBps?: number;
  /**
   * The multiplier direction, decided by measurement rather than by reading the
   * documentation. Both adjustments are computed against the same on-chain
   * price; whichever lands closer to zero is the one the chain agrees with.
   */
  multiplied?: number;
  divided?: number;
  /** `'x'`, `'/'`, or `'—'` when the multiplier is 1 and the question is moot */
  closer?: 'x' | '/' | '—';
}

/**
 * Run the admission test for one wrapper.
 *
 * Every gate returns the *measured* reason it failed, so a rejection can be
 * quoted at a user. "No reference market" with nothing behind it is the answer
 * this module exists to stop producing.
 */
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

  // Resolved by the wrapper address the issuer publishes, not by stripping the
  // leading `w`. The strip is a naming convention and this file exists because
  // a naming convention is a claim rather than evidence.
  const asset = await issuerFor(symbol, address);
  if (!asset) {
    return {
      ...base,
      candidate: null,
      verdict: 'REJECT',
      reason: 'NOT_CARRIED',
      detail: 'the issuer does not carry a token at this address',
    };
  }

  const book = await issuerBook();
  const quote = book.get(asset.symbol);
  const mult = await multiplierFor(asset.symbol);
  const issuer: IssuerObservation = {
    symbol: asset.symbol,
    mid: quote?.mid,
    spreadBps: quote?.spreadBps,
    period: quote?.period ?? asset.period ?? undefined,
    halted: quote?.halted ?? asset.halted,
    multiplier: mult?.current,
  };
  const withIssuer = { ...base, candidate: asset.underlying, issuer, currency: 'USD' };

  if (!quote || !(quote.mid > 0)) {
    return {
      ...withIssuer,
      verdict: 'REJECT',
      reason: 'NO_QUOTE',
      detail: `${asset.symbol} is carried but the issuer publishes no price for it`,
    };
  }
  if (quote.halted) {
    return {
      ...withIssuer,
      referencePrice: quote.mid,
      verdict: 'REJECT',
      reason: 'HALTED',
      detail: `the issuer has halted trading in ${asset.symbol}`,
    };
  }

  // Shares per token, applied here for the same reason it is applied in the
  // fair value: the issuer quotes one share and the chain prices one token.
  // Comparing them without it measures the dividend history and calls it basis.
  const sharesPerToken = mult?.current ?? 1;
  const referencePrice = quote.mid * sharesPerToken;
  const withPrice = { ...withIssuer, referencePrice };

  const venues = await loadVenues(address);
  const onchainPrice = venues[0]?.spot;
  if (!onchainPrice || !(onchainPrice > 0)) {
    return {
      ...withPrice,
      verdict: 'REJECT',
      reason: 'NO_VENUE',
      detail: 'no USDG pool with a readable spot price',
    };
  }

  const basisBps = (onchainPrice / referencePrice - 1) * 10_000;
  issuer.basisBps = basisBps;
  if (Math.abs(basisBps) > MAX_IDENTITY_BASIS_BPS) {
    return {
      ...withPrice,
      onchainPrice,
      basisBps,
      verdict: 'REJECT',
      reason: 'BASIS',
      detail:
        `chain quotes ${onchainPrice.toFixed(2)} USD against the issuer's ` +
        `${quote.mid.toFixed(2)} × ${sharesPerToken.toFixed(6)} shares = ` +
        `${referencePrice.toFixed(2)} USD — ${(basisBps / 100).toFixed(1)}%, too far apart ` +
        'to be the same security',
    };
  }

  return { ...withPrice, onchainPrice, basisBps, verdict: 'ADMIT' };
}

/** The whole X Layer universe, tested one at a time — the public RPC fans out badly. */
export async function reconcileUniverse(): Promise<ReconcileResult[]> {
  const index = await addressBySymbol();
  return serial([...index.entries()], ([symbol, address]) => reconcile(symbol, address));
}
