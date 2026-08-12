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
  outputFileTracingIncludes: {
    '/api/theses': ['./observations/registry.jsonl'],
  },
};

export default config;
