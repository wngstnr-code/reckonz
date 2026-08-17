import { fetchBoard } from '@/src/board-store';
import { clientKey, createGate, tooMany } from '@/src/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Generous, because this route does almost nothing: one HTTP read from the
 * archive, or one read from a file that ships with the deployment. It is gated
 * anyway — every public route takes a bucket before it does any work (D78), and
 * a route that skips the rule because it is cheap today is a route nobody
 * remembers to gate when it stops being cheap.
 */
const gate = createGate('board', { burst: 20, perMinute: 60, maxInFlight: 4 });

/**
 * Cached for a minute.
 *
 * The board behind it is measured hourly, so a minute of staleness on top is
 * invisible — and it means a page opened by ten people costs one archive read
 * rather than ten.
 */
let cached: { at: number; body: string; status: number } | null = null;
const TTL_MS = 60_000;

/**
 * `GET /api/board` — what the guard would say about every xStock, as measured.
 *
 * **This route computes nothing.** It cannot: the walk behind it takes about
 * two minutes of throttled RPC, which is why `src/board.ts` runs on the worker
 * and this reads what it left behind. A request that tried to measure would
 * time out and would spend the RPC budget of whoever happened to arrive first.
 *
 * So the honest thing this owes its caller is not just the numbers but **their
 * age and their provenance**. `ageSeconds` because D84's rule is that a
 * capacity figure is a measurement with a date, and this is the only place the
 * date can come from. `source` because `blob` means the worker is running and
 * `file` means the page is showing whatever shipped with the deployment — a
 * difference the reader deserves and the page will want to render.
 *
 * A board that has never been measured is a **503 with a sentence**, not a 200
 * carrying null. The distinction matters: an empty board and an unavailable one
 * look identical to a component that has to choose what to draw, and only one
 * of them should read as "no market".
 */
export async function GET(request: Request) {
  const pass = gate.enter(clientKey(request));
  if (!pass.ok) return tooMany(pass);

  try {
    if (cached && Date.now() - cached.at < TTL_MS) {
      return new Response(cached.body, {
        status: cached.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-cache': 'hit' },
      });
    }

    const found = await fetchBoard();

    const { body, status } = found
      ? {
          body: JSON.stringify({
            board: found.board,
            source: found.from,
            ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - found.board.measuredAt),
          }),
          status: 200,
        }
      : {
          body: JSON.stringify({
            error:
              'No board has been measured yet. Run `pnpm board` and commit the result, or bring the publish worker up.',
          }),
          status: 503,
        };

    cached = { at: Date.now(), body, status };

    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-cache': 'miss' },
    });
  } finally {
    pass.release();
  }
}

