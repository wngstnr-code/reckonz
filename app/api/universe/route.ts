import { universe } from '@/src/pipeline';

// Thirty tokens, three reads each, over an RPC that throttles — slow enough to
// be worth caching and static enough to make caching safe. `XSTOCKS` only
// changes when someone edits `src/chain.ts`, and a deploy invalidates this
// anyway.
export const runtime = 'nodejs';
export const revalidate = 3600;
export const maxDuration = 60;

/**
 * `GET /api/universe` — the investable xStock universe, symbols read from the
 * chain rather than from a table (see `XSTOCKS` in chain.ts).
 *
 * This is deliberately not the same list as the oracle's `ASSETS`: it is what
 * the chain will let you trade, not what a fair value can be defended for. A
 * mandate may allow an asset the oracle cannot price — the guard is what
 * refuses the fill, and it refuses for the true reason. See D33.
 */
export async function GET() {
  try {
    return Response.json(await universe());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
