import type { NextConfig } from 'next';

const config: NextConfig = {
  // Pin the workspace root: a stray lockfile in a parent directory otherwise
  // makes Turbopack infer the wrong one.
  turbopack: { root: import.meta.dirname },
  // The engine in src/ is plain TypeScript ESM shared with the CLI demos; it
  // is imported directly by the route handlers rather than duplicated.
  typedRoutes: true,
  // `src/indexer.ts` reads its store by a path built at runtime, which the file
  // tracer cannot follow — so without this the index is committed, works
  // locally, and is simply absent in production. It would degrade correctly
  // (the chain still decides what exists) and silently cost every request the
  // enumeration it was built to avoid, which is the worst kind of regression:
  // one that only shows up as latency.
  //
  // `src/board-store.ts` has the same shape and a harder failure: the assets
  // board cannot be recomputed on request at all — it takes a minute or two of
  // throttled RPC — so without the file the route has nothing to fall back to
  // and the page is empty rather than merely slow.
  outputFileTracingIncludes: {
    '/api/theses': ['./observations/registry.jsonl'],
    '/api/board': ['./observations/board.json'],
    // `/assets` reads the store directly rather than asking our own route over
    // HTTP, so it needs the file traced under its own path. Without this the
    // committed board is not the floor it is described as: the page would fall
    // straight through to "nothing measured" whenever the archive is unreachable,
    // while `/api/board` beside it still answered from the file.
    '/assets': ['./observations/board.json', './observations/showcase.json'],
    // Same reason, one segment down: the detail page reads the store directly
    // too, and a route left out of this list has no floor when the archive is
    // unreachable — it would 404 every asset rather than serve the copy that
    // shipped with the deployment.
    '/assets/[symbol]': ['./observations/board.json'],
  },
};

export default config;
