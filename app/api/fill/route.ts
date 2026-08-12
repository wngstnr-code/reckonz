import { isAddress, type Address, type Hex } from 'viem';
import { prepareFill } from '@/src/fill';

// Thousands of pool reads over a throttled RPC, plus a filesystem write for the
// evidence bundle. Neither belongs in a browser, and neither can be cached: a
// quote is a claim about pool state right now.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 300, matching `/api/run`: the quote is the same pool enumeration the planner
// does, over the same throttled RPC, and a timeout here reads as a broken app
// rather than as the slow read it is.
export const maxDuration = 300;

/** BigInt reaches the wire as a decimal string rather than throwing. */
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * `POST /api/fill` — everything a browser needs to place one fill, except the
 * three things that must happen in the user's own wallet.
 *
 * It quotes against live pool state, checks the pool the executor will actually
 * derive, reads the oracle, predicts the fill, asks `PolicyGuard.dryRun`, and
 * hashes the evidence — then returns it all, inert. **No key, no signature and
 * no transaction happens here.** The permit signature and the `execute` call are
 * produced by the wallet, which is what makes the non-custodial claim structural
 * rather than a promise (see `src/permit.ts`).
 *
 * A guard rejection comes back `200` with `verdict.allow === false` and the
 * reason. It is not an error: refusing is the product working, and the caller is
 * expected to render the reason rather than a failure.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'expected a JSON body' }, { status: 400 });
  }

  const asset = body.asset;
  const amountUsdg = body.amountUsdg;
  const mandateId = body.mandateId;
  const sender = body.sender;
  const thesisHash = body.thesisHash;

  if (typeof asset !== 'string' || !isAddress(asset)) {
    return Response.json({ error: 'asset must be an address' }, { status: 400 });
  }
  if (typeof sender !== 'string' || !isAddress(sender)) {
    return Response.json({ error: 'sender must be an address' }, { status: 400 });
  }
  if (typeof amountUsdg !== 'string' || !/^\d+(\.\d+)?$/.test(amountUsdg)) {
    return Response.json({ error: 'amountUsdg must be a decimal string' }, { status: 400 });
  }
  if (typeof mandateId !== 'string' || !/^\d+$/.test(mandateId)) {
    return Response.json({ error: 'mandateId must be an integer string' }, { status: 400 });
  }
  if (thesisHash !== undefined && (typeof thesisHash !== 'string' || !HEX32.test(thesisHash))) {
    return Response.json({ error: 'thesisHash must be 32 bytes of hex' }, { status: 400 });
  }

  try {
    const plan = await prepareFill({
      asset: asset as Address,
      amountUsdg,
      mandateId: BigInt(mandateId),
      sender: sender as Address,
      thesisHash: thesisHash as Hex | undefined,
    });

    return new Response(JSON.stringify(plan, replacer), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    // Everything `prepareFill` throws is a sentence about why this fill cannot
    // honestly be planned — no pool, a quote past its tick window, a mandate
    // this wallet cannot execute against. Pass it through verbatim; a generic
    // message here would throw away the only useful part.
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
