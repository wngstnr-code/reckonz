import { isAddress, type Address, type Hex } from 'viem';
import { prepareExit } from '@/src/exit-plan';
import { clientKey, createGate, tooMany } from '@/src/ratelimit';

// Every fee tier simulated over a throttled RPC, plus a filesystem write for the
// evidence bundle. Neither belongs in a browser, and neither can be cached: a
// quote is a claim about pool state right now.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 300, matching `/api/fill`: the same pool enumeration over the same throttled
// RPC, and a timeout here reads as a broken app rather than as the slow read it
// is.
export const maxDuration = 300;

/**
 * Cheaper than a pipeline run — no LLM — but it enumerates pools over the
 * throttled RPC and writes an evidence bundle, and it is reachable by anyone.
 */
const gate = createGate('exit quote', { burst: 6, perMinute: 20, maxInFlight: 3 });

/** BigInt reaches the wire as a decimal string rather than throwing. */
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * `POST /api/exit` — everything a browser needs to sell a position back to USDG,
 * except the three things that must happen in the user's own wallet.
 *
 * The mirror of `/api/fill`, and it closes the gap that made the product
 * lopsided: entering was a page and leaving was a terminal. It simulates every
 * fee tier in the sell direction, checks the pool the executor will actually
 * derive, reads the oracle, predicts the sale, asks `PolicyGuard.dryRun` and
 * hashes the evidence — then returns it all, inert. **No key, no signature and
 * no transaction happens here.**
 *
 * A guard rejection comes back `200` with `verdict.allow === false` and the
 * reason. It is not an error: refusing is the product working.
 *
 * So does **our own** refusal: when the oracle has lapsed, nothing can measure
 * the shortfall, `maxSlippageBps` cannot bound the sale, and the plan comes back
 * `signable.ok === false` with `predicted.shortfallBps === null`. The caller
 * sees the whole quote and may repeat the request with
 * `acknowledgeUnmeasured: true`; until then no evidence bundle is written and
 * the plan is not meant to reach a wallet. See D77.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'expected a JSON body' }, { status: 400 });
  }

  const asset = body.asset;
  const units = body.units;
  const mandateId = body.mandateId;
  const sender = body.sender;
  const thesisHash = body.thesisHash;
  const acknowledgeUnmeasured = body.acknowledgeUnmeasured;

  if (typeof asset !== 'string' || !isAddress(asset)) {
    return Response.json({ error: 'asset must be an address' }, { status: 400 });
  }
  if (typeof sender !== 'string' || !isAddress(sender)) {
    return Response.json({ error: 'sender must be an address' }, { status: 400 });
  }
  // Units of the asset being sold, not a dollar target — see `prepareExit`.
  if (typeof units !== 'string' || !/^\d+(\.\d+)?$/.test(units)) {
    return Response.json({ error: 'units must be a decimal string' }, { status: 400 });
  }
  if (typeof mandateId !== 'string' || !/^\d+$/.test(mandateId)) {
    return Response.json({ error: 'mandateId must be an integer string' }, { status: 400 });
  }
  if (thesisHash !== undefined && (typeof thesisHash !== 'string' || !HEX32.test(thesisHash))) {
    return Response.json({ error: 'thesisHash must be 32 bytes of hex' }, { status: 400 });
  }
  // Must be a real boolean rather than anything truthy: this is the field that
  // decides whether a sale with no slippage protection may be signed, and
  // accepting `"false"` or `1` for it would be a consent nobody gave (D77).
  if (acknowledgeUnmeasured !== undefined && typeof acknowledgeUnmeasured !== 'boolean') {
    return Response.json({ error: 'acknowledgeUnmeasured must be a boolean' }, { status: 400 });
  }

  const pass = gate.enter(clientKey(request));
  if (!pass.ok) return tooMany(pass);

  try {
    const plan = await prepareExit({
      asset: asset as Address,
      units,
      mandateId: BigInt(mandateId),
      sender: sender as Address,
      thesisHash: thesisHash as Hex | undefined,
      acknowledgeUnmeasured: acknowledgeUnmeasured as boolean | undefined,
    });

    return new Response(JSON.stringify(plan, replacer), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    // Everything `prepareExit` throws is a sentence about why this exit cannot
    // honestly be planned — units the wallet does not hold, no pool deep enough,
    // a mandate this wallet cannot act on. Pass it through verbatim; a generic
    // message would throw away the only useful part.
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  } finally {
    pass.release();
  }
}
