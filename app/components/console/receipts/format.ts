import { formatUnits } from 'viem';
import { shortfallMeasured } from '@/src/abi';
import type { ViewReceipt, WireFill } from '@/src/receipts-view';
import { hasEvidence } from '@/src/receipts-view';

/** UTC to the minute, formatted identically on the server and in the browser. */
export const when = (unix: number) =>
  new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';

/** USDG at 6 decimals, from the decimal string the wire carries. */
export const usdg = (raw: string) => formatUnits(BigInt(raw), 6);

/** A price the contract records at 8 decimals. */
export const e8 = (raw: string) => (Number(BigInt(raw)) / 1e8).toFixed(4);

export const short = (hex: string) => `${hex.slice(0, 10)}…${hex.slice(-6)}`;

/**
 * How a receipt should read, and it is about the evidence rather than the money.
 *
 * `AssetCard` chose capacity over price because price is on every exchange and
 * capacity is the number nobody else measured. The same argument lands here on
 * the shortfall: an explorer can already show what this trade cost. What it
 * cannot show is how far that sat from the value the oracle was willing to
 * defend at that second, and whether anything measured it at all.
 *
 * So the tone follows the quality of the record, never profit and loss:
 *
 * - `clean`   — shortfall measured, and inside the policy the guard enforced.
 * - `wide`    — measured, and further out than the mandate's own limit.
 * - `unmeasured` — the oracle had nothing to compare against (D77). This is the
 *   one that must never read as a good number, because its slippage field is
 *   literally zero.
 * - `unaudited`  — no evidence hash, so nothing about it can ever be checked.
 */
export type Tone = 'clean' | 'wide' | 'unmeasured' | 'unaudited';

/** The mandate's own slippage limit, in bps. Beyond it a fill is worth a second look. */
const WIDE_BPS = 50;

export function toneOf(receipt: ViewReceipt): Tone {
  if (!hasEvidence(receipt)) return 'unaudited';
  if (receipt.fills.some((f) => !shortfallMeasured(f))) return 'unmeasured';
  if (receipt.fills.some((f) => f.slippageBps > WIDE_BPS)) return 'wide';
  return 'clean';
}

/**
 * The tint, the supporting text colour, and the mark, per tone.
 *
 * Mirrors `TONE` in `board-format.ts` deliberately: a reader who has been on
 * `/assets` has already learned that a tinted block means a verdict and that
 * green is not "up".
 */
export const TONE: Record<Tone, { tint: string; text: string }> = {
  clean: { tint: 'bg-signal/6', text: 'text-signal' },
  wide: { tint: 'bg-caution/6', text: 'text-caution' },
  unmeasured: { tint: 'bg-caution/6', text: 'text-caution' },
  // The note describes the shortfall, and on an unaudited receipt the shortfall
  // is not what is wrong with it. Painting "against fair value" red said the
  // number was bad when the number is fine and the record of it is missing --
  // the red belongs on "no evidence" alone, which is where it now is.
  unaudited: { tint: 'bg-refuse/6', text: 'text-dim' },
};

/**
 * The headline of a receipt card: its shortfall, or the reason there is none.
 *
 * Returns the number and the line under it as one, because the two are never
 * chosen independently. A card showing `0 bps` above `below fair value` when
 * nothing priced the trade is the failure D77 names.
 */
export function headline(receipt: ViewReceipt): { value: string; note: string } {
  const fills = receipt.fills;
  if (fills.length === 0) return { value: 'no fills', note: 'a receipt with nothing in it' };

  if (fills.some((f) => !shortfallMeasured(f))) {
    return { value: 'unmeasured', note: 'the oracle had no value to compare against' };
  }

  const worst = Math.max(...fills.map((f) => f.slippageBps));
  return {
    value: `${worst} bps`,
    note: fills.length > 1 ? 'worst leg, against fair value' : 'against fair value',
  };
}

/** One line naming what moved, for a card header or a table cell. */
export function direction(fills: WireFill[]): string {
  if (fills.length === 0) return '—';
  const exits = fills.filter((f) => f.isExit).length;
  if (exits === 0) return fills.length === 1 ? 'entry' : `${fills.length} entries`;
  if (exits === fills.length) return fills.length === 1 ? 'exit' : `${fills.length} exits`;
  return `${fills.length - exits} in · ${exits} out`;
}

/** Total USDG the receipt moved, across every leg. */
export const notionalOf = (receipt: ViewReceipt) =>
  receipt.fills.reduce((sum, f) => sum + BigInt(f.amountInUsdg), 0n).toString();
