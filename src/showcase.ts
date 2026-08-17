/**
 * One real run, recorded, so a visitor with no wallet sees the argument in
 * numbers before they type anything.
 *
 * ## Why a recording rather than a live run
 *
 * `GET /api/run` spends an LLM quota and holds an RPC walker for half a minute,
 * which is why it carries the strictest gate in the app. Firing that on page
 * load would put the most expensive path in the app behind the cheapest
 * intention — looking. So the page renders a run that already happened.
 *
 * ## What makes it honest
 *
 * **It is a real run.** The compiler is live Gemini, the universe is read off
 * chain, the sizing walks real pool liquidity tick by tick, and the verdicts
 * come from the same guard the contract runs. Nothing here is composed. The
 * fixture provider exists and is deliberately *not* used: a canned thesis
 * presented as a run would be the exact claim this repo refuses to make.
 *
 * **It is dated, and it ages.** A plan is a measurement with a date exactly as
 * a capacity figure is (D84), and this repo has already watched one move — the
 * recorded $250k run read $6,627 executable and then $20,361 against the same
 * thesis, because the pools changed underneath it. So `recordedAt` is stamped
 * and the page judges it with the same `freshness` the board uses. A stale
 * recording says so rather than passing for today.
 *
 * **It keeps the refusal.** Every leg and every verdict is stored, including
 * the amount the plan would not place. A recording that kept only the flattering
 * half would be marketing wearing a measurement's clothes, and the unplaced
 * remainder is the product working, not a shortfall to bury.
 *
 *     GEMINI_API_KEY=… pnpm showcase ["thesis"] [notional]
 *
 * The recorder lives in `showcase-record.ts` and this does not import it. A page
 * that needs to *read* a recording must not drag the pipeline, the LLM provider
 * and an RPC client into its module graph to do it — the same separation
 * `board-store.ts` keeps from `board.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Alongside `board.json`, for the same reason: it is a measurement with a date. */
export const SHOWCASE_DIR = 'observations';
export const SHOWCASE_FILE = 'showcase.json';

export const showcasePath = () => join(process.cwd(), SHOWCASE_DIR, SHOWCASE_FILE);

export interface ShowcaseLine {
  symbol: string;
  /** What the thesis asked for, in basis points of the notional. */
  targetBps: number;
  /** What depth allowed, in the same units. The gap between them is the point. */
  plannedBps: number;
  notional: number;
  naiveImpactBps: number;
  plannedImpactBps: number;
  slices: number;
}

export interface ShowcaseVerdict {
  symbol: string;
  fillSizeUsdg: number;
  impactBps: number | null;
  ok: boolean;
  reason?: string;
}

export interface Showcase {
  /** Seconds, to match `Board.measuredAt` so one `freshness` serves both. */
  recordedAt: number;
  /** The words a person typed, kept verbatim so the claim can be checked. */
  thesis: string;
  /** What the compiler made of them. */
  claim: string;
  horizonDays: number;
  provider: string;
  /** False would mean the fixture, and the page must never render that as a run. */
  live: boolean;
  notionalUsdg: number;
  maxImpactBps: number;
  lines: ShowcaseLine[];
  verdicts: ShowcaseVerdict[];
  /** Named legs the chain has no token for. Zero is a fact worth storing. */
  invented: number;
  totals: {
    askedUsdg: number;
    /** What the plan would actually place. */
    placedUsdg: number;
    /** What it refused to force into the market. */
    unallocatedUsdg: number;
    /** Price impact of taking the whole size at once. */
    naiveCostUsdg: number;
    /** Price impact of the plan that respects depth. */
    plannedCostUsdg: number;
  };
}

/**
 * Rejects a document that cannot be rendered honestly, rather than rendering it.
 *
 * `live: false` is refused outright. Everything else here is a shape check; that
 * one is a claim check, and it is the only thing standing between a fixture and
 * a page that says a model produced this.
 */
export function parseShowcase(parsed: unknown): Showcase | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const s = parsed as Partial<Showcase>;
  if (typeof s.recordedAt !== 'number' || !Number.isFinite(s.recordedAt)) return null;
  if (typeof s.thesis !== 'string' || !s.thesis) return null;
  if (s.live !== true) return null;
  if (!Array.isArray(s.lines) || !Array.isArray(s.verdicts)) return null;
  if (!s.totals || typeof s.totals.askedUsdg !== 'number') return null;
  return s as Showcase;
}

export function writeShowcase(showcase: Showcase, path = showcasePath()): string {
  writeFileSync(path, `${JSON.stringify(showcase, null, 2)}\n`);
  return path;
}

/**
 * The recording, or nothing.
 *
 * Nothing is a normal state: a deployment that has never run `pnpm showcase`
 * has no run to show, and an absent section is honest where an invented one
 * would not be. Every failure lands here — missing file, unreadable JSON, a
 * document `parseShowcase` will not vouch for — because none of them is a
 * reason to render something.
 */
export function readShowcase(path = showcasePath()): Showcase | null {
  try {
    return parseShowcase(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}
