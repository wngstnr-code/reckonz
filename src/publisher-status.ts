/**
 * What the publisher says about its own last cycle.
 *
 * ## Why this exists
 *
 * On 2026-08-22 `GET /api/health` answered 503 with *"the publisher has almost
 * certainly stopped"*. The publisher had not stopped. It was running, on time,
 * and doing exactly the right thing: the issuer quotes nothing for a
 * `TwentyFourFive` asset over a weekend, so `bid`, `ask` and `mid` all came back
 * null, the cross-check refused every value as incoherent (D79), and `publish.ts`
 * spent no gas saying so. The observations then aged past `maxAge` on their own
 * and the health rule read that as a dead worker.
 *
 * The rule was not wrong so much as **starved**. `classifyHealth` had exactly one
 * fact — how old the newest observation is — and two very different states
 * produce that same fact:
 *
 *   - the publisher died, and nothing is being written;
 *   - the publisher is alive and *refusing to write*, because the only honest
 *     value available is no value.
 *
 * No amount of reasoning over staleness separates those, because staleness does
 * not contain the difference. The second fact has to come from the publisher
 * itself, which is the one process that knows.
 *
 * ## Why a blob and not the chain
 *
 * The tempting fix is to publish the withheld values on chain: a fresh timestamp
 * with `hasValue` false says "alive, and refusing" in the oracle's own
 * vocabulary. It is also ~900k gas every ten minutes to broadcast that nothing
 * happened, through a weekend, out of a runway measured in days. Liveness is a
 * monitoring fact, not a consensus fact, and paying for blockspace to carry it
 * would be the tail wagging the dog.
 *
 * So the publisher writes one small JSON object to the store it already has a
 * token for, and health reads it. No new dependency, no new credential.
 *
 * ## What it is not
 *
 * It is **not** authority over whether a fill can happen — the chain is. A fresh
 * heartbeat saying "all good" while every observation is stale does not make the
 * system healthy, and `classifyHealth` treats it that way: the heartbeat only
 * ever explains a `down`, it never argues one away.
 */
import { EVIDENCE_BLOB_BASE, hasBlobCredentials } from './evidence-store';

/**
 * What the issuer was doing when the publisher last looked.
 *
 *   `quoting`     — it would quote at least one allowed asset.
 *   `closed`      — it answered, and quotes nothing: `canQuote` false across the
 *                   board, which over a weekend is the market being shut.
 *   `unreachable` — it did not answer at all.
 *
 * The last two were one sentence in `publish.ts` for weeks — *"the issuer is
 * unreachable or carrying nothing"* — and that `or` is the whole ambiguity this
 * module exists to remove. The API states both facts explicitly (`canQuote`,
 * `limitsPerPeriod.currentPeriod`); nothing was reading them.
 */
export type IssuerState = 'quoting' | 'closed' | 'unreachable';

export interface PublisherHeartbeat {
  /** Unix seconds, stamped when the cycle finished — not when it started. */
  at: number;
  /** `mainnet` or `testnet`, so a testnet worker cannot vouch for production. */
  target: string;
  /**
   *   `published` — a transaction landed.
   *   `withheld`  — nothing was publishable, and nothing was published.
   *   `failed`    — the cycle could not complete.
   */
  cycle: 'published' | 'withheld' | 'failed';
  /** Assets the cycle tried to price. */
  considered: number;
  /** Of those, how many reached the chain carrying a value. */
  published: number;
  issuer: IssuerState;
  /** How many considered assets the issuer would have quoted. */
  quotable: number;
  /** The issuer's own word for the session: `market`, `extended`, `closed`, … */
  period: string | null;
}

/** One fixed key. There is one publisher, and only its latest word matters. */
export const HEARTBEAT_KEY = 'publisher/heartbeat.json';

export const heartbeatUrl = (base = EVIDENCE_BLOB_BASE) => `${base}/${HEARTBEAT_KEY}`;

/**
 * The read, in the three shapes it actually comes in.
 *
 * `missing` and `unreadable` are deliberately **not** collapsed into `null`.
 * "The publisher has never written a heartbeat" and "the publisher wrote one an
 * hour ago" are opposite conclusions, and a health rule that cannot tell them
 * apart is the defect this module was written for, one level up. A store that
 * 404s during a rollout must never be reported as a dead worker.
 */
export type HeartbeatRead =
  | { kind: 'ok'; heartbeat: PublisherHeartbeat }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

/**
 * Publish the heartbeat. Never throws.
 *
 * Same rule as `persistBundle`: the job is publishing an oracle, and a
 * monitoring write that fails must not take a cycle down with it. A heartbeat
 * that does not land goes stale, and stale is already a state health reads
 * correctly — it degrades into the old behaviour rather than into a lie.
 */
export async function writeHeartbeat(beat: PublisherHeartbeat): Promise<'blob' | 'none'> {
  if (!hasBlobCredentials()) return 'none';
  try {
    const { put } = await import('@vercel/blob');
    await put(HEARTBEAT_KEY, `${JSON.stringify(beat, null, 2)}\n`, {
      access: 'public',
      contentType: 'application/json',
      // One key, overwritten every cycle. A random suffix would make the latest
      // heartbeat unfindable, which is the only thing anyone wants from it.
      addRandomSuffix: false,
      allowOverwrite: true,
      // **Not optional.** A public blob defaults to a one-month cache, and a
      // liveness signal served from a month-old cache is worse than none: it
      // would report a dead publisher as alive for weeks. Sixty seconds is well
      // inside `HEARTBEAT_MAX_AGE_SEC` and still shares a fetch between the
      // monitor and anyone refreshing the page.
      cacheControlMaxAge: 60,
    });
    return 'blob';
  } catch {
    return 'none';
  }
}

/** Read the heartbeat. Never throws; every failure is a shape above. */
export async function readHeartbeat(url = heartbeatUrl()): Promise<HeartbeatRead> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return { kind: 'missing' };
    if (!res.ok) return { kind: 'unreadable', reason: `HTTP ${res.status}` };
    const parsed = parseHeartbeat(await res.json());
    return parsed
      ? { kind: 'ok', heartbeat: parsed }
      : { kind: 'unreadable', reason: 'the heartbeat is not in the shape this reader knows' };
  } catch (e) {
    return { kind: 'unreadable', reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Validate before trusting.
 *
 * A malformed heartbeat has to read as `unreadable`, never as a fresh one: the
 * failure mode of a half-written or half-deployed object is a missing `at`, and
 * `undefined` compared against a threshold is not the answer anyone wants from a
 * liveness check.
 */
export function parseHeartbeat(value: unknown): PublisherHeartbeat | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const at = num(v.at);
  if (at === null || at <= 0) return null;
  if (v.issuer !== 'quoting' && v.issuer !== 'closed' && v.issuer !== 'unreachable') return null;
  if (v.cycle !== 'published' && v.cycle !== 'withheld' && v.cycle !== 'failed') return null;
  return {
    at,
    target: typeof v.target === 'string' ? v.target : 'unknown',
    cycle: v.cycle,
    considered: num(v.considered) ?? 0,
    published: num(v.published) ?? 0,
    issuer: v.issuer,
    quotable: num(v.quotable) ?? 0,
    period: typeof v.period === 'string' ? v.period : null,
  };
}
