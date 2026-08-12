/**
 * Our own price history, sampled from the issuer.
 *
 * ## Why this exists
 *
 * The band the oracle publishes when nobody is quoting comes from one number
 * per asset: the standard deviation of that security's close-to-open jumps.
 * Until now that number was measured from Yahoo — an undocumented endpoint with
 * no licence to point at — because the issuer publishes a live mark and no
 * history at all.
 *
 * Borrowing history was the last thing tying this project to a source it has no
 * right to use. The fix is not a better borrow. It is to stop needing one: the
 * issuer marks these tokens every few seconds, so a process that writes those
 * marks down accumulates, in one session, exactly the series nobody will sell
 * us. See D62.
 *
 * ## What it records, and what it deliberately does not
 *
 * One line per asset per sample, append-only, newline-delimited JSON. No
 * database: the whole point is that this survives being read by a human with
 * `tail`, and a file that can be diffed is a file whose gaps are visible.
 *
 * It records the **mid, the session and the spread** — not the bid and ask
 * separately, because the quantity being measured is where the price went, not
 * how the dealer was leaning. It records `observedAt` as *our* receipt time and
 * says so, because the issuer publishes no timestamp and pretending otherwise
 * would launder a weak fact into a strong one.
 *
 * ## What it cannot do yet
 *
 * A close-to-open jump needs a close and an open. Sampling produces those only
 * after the store has watched real session boundaries go by — a weekend gives
 * one, a weeknight gives one. So this does not replace the recorded σ today; it
 * starts earning the right to, and `pnpm measure` reports how far along it is
 * rather than guessing from a short series.
 *
 *   TARGET=mainnet pnpm sample            # one pass over the universe
 *   TARGET=mainnet pnpm sample --loop     # keep going, alongside the publisher
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ASSETS, issuerSymbolFor } from './fairvalue';
import { issuerBook } from './issuer';

/**
 * Where the marks are written.
 *
 * `OBSERVATIONS_PATH` exists for one case: the publish worker samples every
 * cycle, and a Railway container's filesystem is wiped on redeploy, so the
 * history D62 exists to accumulate would evaporate. A mounted volume fixes
 * that — but mounting it **over** `observations/` would shadow the copy that
 * ships in the image and make the 30 committed marks look lost. So the volume
 * goes somewhere else (`/data`) and this points at it.
 *
 * Node-only, like the rest of this module. Merging what the volume collected
 * back into the repo is a deliberate act: `pnpm sample --merge <path>`.
 */
export const STORE = process.env.OBSERVATIONS_PATH ?? 'observations/issuer-marks.jsonl';

export interface Sample {
  /** on-chain symbol, so the store joins to `ASSETS` without a lookup */
  symbol: string;
  /** the issuer's mid, in USD, for one share */
  mid: number;
  /** the issuer's own spread for the session it was in, basis points */
  spreadBps: number;
  /** `market` | `extended` | `overnight` | `closed` */
  period: string;
  halted: boolean;
  /**
   * When **we** received it. The issuer sends no timestamp; this is the time of
   * receipt and is named so that nothing downstream can mistake it for a print
   * time. A sampler that lies about this would poison every σ derived from it.
   */
  observedAt: number;
}

/** Take one sample of every asset the oracle prices. */
export async function sampleOnce(): Promise<Sample[]> {
  const book = await issuerBook();
  const out: Sample[] = [];
  for (const spec of ASSETS) {
    const q = book.get(issuerSymbolFor(spec.symbol));
    if (!q || !(q.mid > 0)) continue;
    out.push({
      symbol: spec.symbol,
      mid: q.mid,
      spreadBps: q.spreadBps,
      period: q.period,
      halted: q.halted,
      observedAt: q.observedAt,
    });
  }
  return out;
}

/** Append, never rewrite. A store you can only add to is a store you can trust. */
export function append(samples: readonly Sample[], path = STORE): void {
  if (!samples.length) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, samples.map((s) => JSON.stringify(s)).join('\n') + '\n');
}

/**
 * Fold a second store into this one, keeping every distinct mark.
 *
 * The identity of a mark is `symbol` + `observedAt`: the same asset cannot be
 * received twice at the same instant, and two runs that overlap produce exactly
 * that collision. Deduplicating on it means a merge can be run twice with no
 * effect the second time — which matters, because this is a manual step and the
 * hand that runs it is the one most likely to run it again.
 *
 * The result is sorted by time and **rewritten**, not appended: a merge is the
 * one operation on this store that cannot be expressed as an append, and
 * pretending otherwise would leave the file out of order and the duplicates in.
 */
export function merge(into: readonly Sample[], from: readonly Sample[]): Sample[] {
  const seen = new Map<string, Sample>();
  for (const s of [...into, ...from]) seen.set(`${s.symbol}@${s.observedAt}`, s);
  return [...seen.values()].sort(
    (a, b) => a.observedAt - b.observedAt || a.symbol.localeCompare(b.symbol),
  );
}

export function readAll(path = STORE): Sample[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Sample);
}

export interface Coverage {
  symbol: string;
  samples: number;
  firstAt: number;
  lastAt: number;
  /** session boundaries crossed — each one is a usable close-to-open jump */
  boundaries: number;
}

/**
 * How much of a history the store actually holds.
 *
 * The useful unit is not "how many samples" but "how many session boundaries
 * were watched", because that is what a gap statistic is made of. A million
 * samples taken inside one overnight session contain exactly zero jumps.
 */
export function coverage(samples: readonly Sample[]): Coverage[] {
  const bySymbol = new Map<string, Sample[]>();
  for (const s of samples) {
    const list = bySymbol.get(s.symbol) ?? [];
    list.push(s);
    bySymbol.set(s.symbol, list);
  }
  const out: Coverage[] = [];
  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.observedAt - b.observedAt);
    let boundaries = 0;
    for (let i = 1; i < list.length; i++) {
      // A boundary is a transition *into* the regular session: that is the
      // moment a close-to-open jump is realised and becomes measurable.
      if (list[i - 1]!.period !== 'market' && list[i]!.period === 'market') boundaries += 1;
    }
    out.push({
      symbol,
      samples: list.length,
      firstAt: list[0]!.observedAt,
      lastAt: list.at(-1)!.observedAt,
      boundaries,
    });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * The realised close-to-open jumps in the store, as log returns.
 *
 * Built the same way `gapStats` built them from daily bars — the last mark
 * before the session opens against the first mark after — so a σ derived here
 * is comparable with the recorded one rather than a differently-shaped number
 * wearing the same name.
 */
export function jumps(samples: readonly Sample[], symbol: string): number[] {
  const list = samples.filter((s) => s.symbol === symbol).sort((a, b) => a.observedAt - b.observedAt);
  const out: number[] = [];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]!;
    const cur = list[i]!;
    if (prev.period === 'market' || cur.period !== 'market') continue;
    if (!(prev.mid > 0) || !(cur.mid > 0)) continue;
    out.push(Math.log(cur.mid / prev.mid));
  }
  return out;
}
