/**
 * A ceiling on what a stranger can make this deployment spend.
 *
 * `GET /api/run` calls Gemini and then walks the throttled public RPC for tens
 * of seconds, with `maxDuration = 300`. `POST /api/fill` and `POST /api/exit`
 * simulate every fee tier and write a file. None of them had a limit of any
 * kind, and the URL is about to be handed to judges — a public endpoint that
 * spends an API quota and a rate-limited RPC per anonymous request is a bill and
 * an outage waiting for whoever finds it first.
 *
 * ## What this is, and what it is not
 *
 * A token bucket plus an in-flight cap, **per process**. Vercel's Fluid Compute
 * reuses instances, so a bucket survives across requests and this genuinely
 * bounds a single caller against a single instance. It does **not** coordinate
 * across instances, so the global ceiling is this limit times however many
 * instances are warm.
 *
 * That is worth stating rather than dressing up. The honest description is *a
 * cost ceiling per instance*, not *a guarantee per caller*. What this does buy
 * is the whole of the accidental case (a page in a reload loop, a crawler, a
 * demo left open) and a large share of the casual one.
 *
 * The wider ceiling belongs one layer out, in a Vercel WAF rate-limit rule —
 * configuration rather than a dependency, and so never really what this file was
 * weighed against. One is live as of 2026-08-15 on `/api/run`, 30 per 60s keyed
 * on the client IP at the edge, and measured rather than assumed. The plan
 * allows a single such rule, so every other route below still has only this.
 *
 * Two reasons that does not retire anything here: the WAF bounds arrival, not
 * concurrency, so `maxInFlight` is untouched by it; and its counters are per
 * region. See the D78 amendment.
 *
 * ## The key
 *
 * `x-forwarded-for`'s first entry, which is what Vercel's proxy puts the client
 * IP in. It is trivially spoofable by anyone talking to the origin directly, so
 * this is a limit on the honest and the careless, not on an attacker. Again:
 * said, not hidden — and not fixable here at any effort. The header is already
 * present when a function receives it, so nothing at this layer can tell a
 * forged one from a real one. Only the edge, which sets it, can.
 *
 * Deliberately no dependency: `package.json` is shared with FE and the rule is
 * one dependency per commit (08-parallel.md). A bucket is twenty lines.
 */

export interface GateLimit {
  /** Requests available at once after an idle period. */
  burst: number;
  /** Sustained rate, in requests per minute. */
  perMinute: number;
  /**
   * How many of these may be running at the same time from all callers.
   *
   * The bucket bounds arrival; this bounds concurrency, which is the one that
   * matters for a 300-second route: ten simultaneous pipeline runs is ten
   * concurrent Gemini calls and ten walkers on an RPC that throttles at about
   * twelve reads a batch.
   */
  maxInFlight: number;
}

export interface Pass {
  ok: true;
  /** Must be called when the work finishes — including on the error path. */
  release: () => void;
}

export interface Refusal {
  ok: false;
  reason: 'rate' | 'busy';
  /** Whole seconds a caller should wait, for the `Retry-After` header. */
  retryAfterSeconds: number;
  message: string;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** Buckets idle for this long are dropped, so the map cannot grow forever. */
const EVICT_AFTER_MS = 10 * 60_000;

export interface Gate {
  enter: (key: string, now?: number) => Pass | Refusal;
  /** For tests and for a health line: what the gate is currently holding. */
  inspect: () => { inFlight: number; keys: number };
}

export function createGate(name: string, limit: GateLimit): Gate {
  const buckets = new Map<string, Bucket>();
  let inFlight = 0;

  const perMs = limit.perMinute / 60_000;

  function sweep(now: number) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.updatedAt > EVICT_AFTER_MS) buckets.delete(key);
    }
  }

  return {
    enter(key: string, now = Date.now()): Pass | Refusal {
      sweep(now);

      const bucket = buckets.get(key) ?? { tokens: limit.burst, updatedAt: now };
      // Refill for the time that passed, capped at the burst. Fractional tokens
      // are kept: rounding them away would make a one-per-minute limit refill
      // either never or instantly, depending on which way it rounded.
      const refilled = Math.min(limit.burst, bucket.tokens + (now - bucket.updatedAt) * perMs);

      if (refilled < 1) {
        // Store the refill even on a refusal, or a caller who retries in a loop
        // would keep resetting `updatedAt` and never accumulate a token.
        buckets.set(key, { tokens: refilled, updatedAt: now });
        const waitMs = (1 - refilled) / perMs;
        return {
          ok: false,
          reason: 'rate',
          retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
          message: `too many ${name} requests from this address — ${limit.perMinute} per minute, ${limit.burst} at once`,
        };
      }

      // Checked after the bucket, and the bucket is not charged when this
      // refuses: being turned away because the instance is busy is not the
      // caller's fault, and spending their token for it would punish them for
      // someone else's traffic.
      if (inFlight >= limit.maxInFlight) {
        buckets.set(key, { tokens: refilled, updatedAt: now });
        return {
          ok: false,
          reason: 'busy',
          retryAfterSeconds: 15,
          message: `${name} is at its concurrency limit (${limit.maxInFlight}) — try again shortly`,
        };
      }

      buckets.set(key, { tokens: refilled - 1, updatedAt: now });
      inFlight++;

      // Guarded against a double release: a stream that both errors and closes
      // would otherwise decrement twice and hand out a permanent extra slot.
      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          inFlight--;
        },
      };
    },

    inspect: () => ({ inFlight, keys: buckets.size }),
  };
}

/**
 * Who is asking, as far as anything here can tell.
 *
 * Falls back to a single shared key rather than to something unique-looking. An
 * unidentifiable caller sharing one bucket with every other unidentifiable
 * caller is the safe direction; inventing a per-request key would mean no limit
 * at all for exactly the requests we know least about.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** The 429, with the reason a caller can act on. */
export function tooMany(refusal: Refusal): Response {
  return Response.json(
    { error: refusal.message, reason: refusal.reason },
    { status: 429, headers: { 'retry-after': String(refusal.retryAfterSeconds) } },
  );
}
