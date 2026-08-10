import type { NextConfig } from 'next';

const config: NextConfig = {
  // Pin the workspace root: a stray lockfile in a parent directory otherwise
  // makes Turbopack infer the wrong one.
  turbopack: { root: import.meta.dirname },
  // The engine in src/ is plain TypeScript ESM shared with the CLI demos; it
  // is imported directly by the route handlers rather than duplicated.
  typedRoutes: true,
};

export default config;
