import { runPipeline } from '@/src/pipeline';
import { clientKey, createGate, tooMany } from '@/src/ratelimit';

// The pipeline talks to the X Layer RPC and an LLM over the Node runtime, and
// a run outlives any static rendering window.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The strictest gate in the app, because this is the only route that spends an
 * LLM quota, and it holds an RPC walker for tens of seconds while it does.
 * Two concurrent runs per instance is roughly what the public RPC tolerates
 * before `serial()` starts backing off against itself.
 */
const gate = createGate('pipeline run', { burst: 3, perMinute: 6, maxInFlight: 2 });

/** Long enough for a real thesis, short enough not to be a free LLM prompt. */
const MAX_THESIS_CHARS = 2_000;

/** BigInt reaches the wire as a decimal string rather than throwing. */
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const thesis = url.searchParams.get('thesis')?.trim();
  if (!thesis) {
    return Response.json({ error: 'thesis required' }, { status: 400 });
  }
  if (thesis.length > MAX_THESIS_CHARS) {
    return Response.json(
      { error: `thesis is ${thesis.length} characters; the limit is ${MAX_THESIS_CHARS}` },
      { status: 413 },
    );
  }

  // `Number('')` is 0 and `Number('abc')` is NaN, and both used to reach the
  // planner — NaN then propagates through the sizing arithmetic and comes out
  // as a plan full of nulls rather than as an error anyone can act on.
  const notional = Number(url.searchParams.get('notional') ?? 250_000);
  const maxImpactBps = Number(url.searchParams.get('maxImpactBps') ?? 50);
  if (!Number.isFinite(notional) || notional <= 0 || notional > 100_000_000) {
    return Response.json({ error: 'notional must be between 1 and 100,000,000' }, { status: 400 });
  }
  if (!Number.isFinite(maxImpactBps) || maxImpactBps <= 0 || maxImpactBps > 10_000) {
    return Response.json({ error: 'maxImpactBps must be between 1 and 10,000' }, { status: 400 });
  }

  const pass = gate.enter(clientKey(request));
  if (!pass.ok) return tooMany(pass);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event, replacer)}\n\n`));
      };
      try {
        for await (const event of runPipeline(thesis, notional, maxImpactBps)) {
          if (request.signal.aborted) break;
          send(event);
        }
        send({ done: true });
      } catch (e) {
        // A live pipeline's failure is the interesting part — report it rather
        // than dropping the connection and leaving the page guessing.
        send({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        // Released here rather than after `start` returns: the generator runs
        // for the whole life of the stream, and a slot freed when the function
        // returns would be freed immediately and bound nothing.
        pass.release();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
