import type { BoardAsset } from '@/src/board';

/**
 * The words and numbers both board surfaces share.
 *
 * Extracted the moment there were two of them — the table and the card grid —
 * and not before. A refusal that reads one way in a row and another in a card
 * is two different claims about the same measurement, and nobody would notice
 * until someone compared them.
 */

export const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const pct = (bps: number | null | undefined) =>
  bps == null || !Number.isFinite(bps) ? '—' : `${(bps / 100).toFixed(2)}%`;

/**
 * The guard's codes, in words a first-time reader can act on.
 *
 * The code is kept beside them rather than replaced: `REJECT` alone is an error
 * message, and a sentence alone cannot be matched against what the chain will
 * say. Both, sentence first.
 */
export const REFUSAL: Record<string, string> = {
  NO_REFERENCE: 'nothing to check it against',
  PRICE_IMPACT: 'too big for this market',
  GAP_RISK: 'too risky while the market is shut',
  STALE: 'our price is too old',
  OFF_FAIR_VALUE: 'price here is too far from fair',
  NO_DATA: 'we have no price for this yet',
};

export interface Verdict {
  ok: boolean;
  /** `tradable` separates a market that refused from one that is not there. */
  kind: 'allowed' | 'refused' | 'dry' | 'unreadable';
  text: string;
  code?: string;
}

/**
 * Depth is asked before the verdict, and the order matters.
 *
 * A dry pool comes back from the ladder as `NO_DATA`, which read straight
 * through the table above would render as "we have no price for this yet" — and
 * the price is the one thing we do have. What is missing is the liquidity.
 */
export function verdictOf(asset: BoardAsset, sizeUsdg: number): Verdict {
  if (asset.depth === 'unreadable') {
    return { ok: false, kind: 'unreadable', text: 'we could not read this' };
  }
  if (asset.depth === 'no-pool') {
    return { ok: false, kind: 'dry', text: 'no pool for this token' };
  }
  if (asset.depth === 'no-liquidity') {
    return { ok: false, kind: 'dry', text: 'no depth right now' };
  }

  // Exact rung or nothing. Falling back to the smallest measured size would
  // answer a question about $50,000 with a decision made about $250, and the
  // answer would read "allowed" — the one direction a wrong verdict must never
  // fail in. Every size the page can ask for is a rung the board measured.
  const rung = asset.ladder.find((r) => r.sizeUsdg === sizeUsdg);
  if (!rung) return { ok: false, kind: 'refused', text: 'not measured at this size' };
  if (rung.decision.ok) return { ok: true, kind: 'allowed', text: 'allowed' };

  const code = rung.decision.reason;
  return {
    ok: false,
    kind: 'refused',
    text: (code && REFUSAL[code]) ?? 'refused',
    code,
  };
}

/**
 * How much of this board carries a price, and whether any of it does.
 *
 * These are two different failures wearing one face. A board always has depth:
 * the walk is `eth_call` against pools that either hold liquidity or do not, and
 * it succeeds even when nothing else does. A board only has *values* if the
 * issuer answered, and on 2026-08-17 both issuer hosts returned 502 for an hour
 * — `computeFairValue` correctly withheld all thirty, the walk still reported
 * nineteen markets with real depth, and every one of them refused for
 * `NO_REFERENCE`.
 *
 * Rendered without this distinction that board reads as nineteen broken
 * markets. It is nineteen working markets and one broken feed, and the whole
 * point of an oracle that withholds is undone if the page cannot say which.
 */
export function pricing(board: { assets: BoardAsset[] }) {
  const total = board.assets.length;
  const priced = board.assets.filter((a) => a.publishable && a.fairValue !== null).length;
  return { total, priced, unpriced: total - priced, blind: total > 0 && priced === 0 };
}

/**
 * How old is too old, and what to say about it.
 *
 * A board is a transcript of one instant, and the instant it describes has been
 * proven to move: nine pools that `pnpm capacity` priced were empty hours
 * later. D84's rule is that a capacity figure is a measurement with a date, so
 * this turns the date into a judgement rather than leaving the reader to make
 * one from a timestamp.
 *
 * The worker measures hourly, so anything under two hours is simply current.
 * Past half a day the numbers have outlived the thing they describe, and saying
 * so is cheaper than being quietly wrong.
 */
export function freshness(measuredAt: number, now = Date.now()) {
  const seconds = Math.max(0, Math.floor(now / 1000) - measuredAt);
  const minutes = Math.round(seconds / 60);

  const label =
    minutes < 60
      ? `${minutes} min ago`
      : minutes < 60 * 48
        ? `${Math.round(minutes / 60)} h ago`
        : `${Math.round(minutes / 1440)} days ago`;

  const level: 'current' | 'ageing' | 'stale' =
    seconds < 2 * 3600 ? 'current' : seconds < 12 * 3600 ? 'ageing' : 'stale';

  return {
    seconds,
    label,
    level,
    warning:
      level === 'stale'
        ? 'Depth moves within hours, so these numbers may no longer hold.'
        : null,
  };
}

/** Mint for a yes, caution for a no, grey for a market that is not there. */
export const TONE: Record<Verdict['kind'], { text: string; tint: string; curve: string }> = {
  allowed: { text: 'text-signal', tint: 'bg-signal/6', curve: 'text-signal' },
  refused: { text: 'text-caution', tint: 'bg-caution/6', curve: 'text-caution' },
  dry: { text: 'text-faint', tint: 'bg-raised', curve: 'text-faint' },
  unreadable: { text: 'text-refuse', tint: 'bg-refuse/6', curve: 'text-refuse' },
};
