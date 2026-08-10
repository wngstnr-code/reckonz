import { runPipeline } from '@/src/pipeline';

// The pipeline talks to the X Layer RPC and an LLM over the Node runtime, and
// a run outlives any static rendering window.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** BigInt reaches the wire as a decimal string rather than throwing. */
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const thesis = url.searchParams.get('thesis')?.trim();
  if (!thesis) {
    return Response.json({ error: 'thesis required' }, { status: 400 });
  }
  const notional = Number(url.searchParams.get('notional') ?? 250_000);
  const maxImpactBps = Number(url.searchParams.get('maxImpactBps') ?? 50);

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
