import { loadRegistry } from '@/src/track-record';

// Reads the X Layer RPC over the Node runtime. The registries are append-only,
// so a stale response is wrong in exactly one direction — it can miss a new
// thesis, never invent one — but a track record is the thing a user is deciding
// on, so it is fetched fresh rather than served from a build.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** BigInt reaches the wire as a decimal string rather than throwing. */
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

/**
 * `GET /api/theses`          — every published thesis with its on-chain record.
 * `GET /api/theses?id=0`     — one thesis, 404 when it does not exist.
 *
 * The response carries `unattributed` and `orphanedHashes` alongside the
 * theses. They are not decoration: a page that renders only the attributed
 * fills claims more discipline than the chain shows.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('id');

  try {
    const snapshot = await loadRegistry();

    if (raw !== null) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id < 0) {
        return Response.json({ error: 'id must be a non-negative integer' }, { status: 400 });
      }
      const thesis = snapshot.theses.find((t) => t.id === id);
      if (!thesis) {
        return Response.json({ error: `no thesis #${id}` }, { status: 404 });
      }
      return new Response(JSON.stringify({ chainId: snapshot.chainId, thesis }, replacer), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(snapshot, replacer), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    // The public RPC throttles, and a throttled read is not an empty registry.
    // Saying so is the difference between "no theses yet" and "we could not
    // look" — and only one of those is safe to render as a track record.
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
