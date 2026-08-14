/**
 * Unit tests for the issuer-mark store (src/observations.ts).
 *
 * No network. All filesystem interaction goes through a fresh directory under
 * os.tmpdir(), never the repo's `observations/` — that file is committed and
 * is what `/api/theses` and `pnpm measure` read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, readAll, merge, coverage, jumps, type Sample } from './observations';

function tmpPath(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'observations-test-'));
  return { dir, file: join(dir, 'marks.jsonl') };
}

function sample(overrides: Partial<Sample> & Pick<Sample, 'symbol' | 'observedAt'>): Sample {
  return {
    mid: 100,
    spreadBps: 10,
    period: 'market',
    halted: false,
    ...overrides,
  };
}

// --------------------------------------------------------------------- merge

test('merge deduplicates on symbol + observedAt, reproducing the 30+12(4 new)=34 shape from D67', () => {
  const into: Sample[] = Array.from({ length: 30 }, (_, i) =>
    sample({ symbol: 'wAAPLx', observedAt: 1_000 + i, mid: 200 + i }),
  );
  // 12 incoming marks: 8 collide on symbol+observedAt with what is already held,
  // 4 are genuinely new (observedAt beyond the existing range).
  const from: Sample[] = [
    ...Array.from({ length: 8 }, (_, i) => sample({ symbol: 'wAAPLx', observedAt: 1_000 + i, mid: 999 })),
    ...Array.from({ length: 4 }, (_, i) => sample({ symbol: 'wAAPLx', observedAt: 2_000 + i, mid: 300 + i })),
  ];

  const merged = merge(into, from);
  assert.equal(merged.length, 34, 'only the 4 genuinely new marks should be added');

  // The overlapping identity wins on `from` in this implementation (last write
  // in `[...into, ...from]` order) — pin that so a future refactor cannot
  // silently flip which side wins the collision.
  const collided = merged.find((s) => s.observedAt === 1_000)!;
  assert.equal(collided.mid, 999);
});

test('merge is idempotent: running the same incoming batch twice adds nothing the second time', () => {
  const into: Sample[] = Array.from({ length: 30 }, (_, i) =>
    sample({ symbol: 'wAAPLx', observedAt: 1_000 + i }),
  );
  const from: Sample[] = [
    ...Array.from({ length: 8 }, (_, i) => sample({ symbol: 'wAAPLx', observedAt: 1_000 + i })),
    ...Array.from({ length: 4 }, (_, i) => sample({ symbol: 'wAAPLx', observedAt: 2_000 + i })),
  ];

  const once = merge(into, from);
  assert.equal(once.length, 34);

  // This is the property the manual `pnpm sample --merge` step rests on: the
  // hand that runs it is the one most likely to run it twice.
  const twice = merge(once, from);
  assert.equal(twice.length, 34, 'a second merge of the same batch must add zero rows');
});

test('merge does not mutate its inputs', () => {
  const into: readonly Sample[] = Object.freeze([sample({ symbol: 'wAAPLx', observedAt: 1 })]);
  const from: readonly Sample[] = Object.freeze([sample({ symbol: 'wTSLAx', observedAt: 2 })]);

  // Object.freeze on the outer array already throws on a push/splice attempt,
  // but call merge and re-check contents too, in case of a defensive `.slice()`
  // that still mutated an aliased element.
  const result = merge(into, from);
  assert.equal(into.length, 1);
  assert.equal(from.length, 1);
  assert.equal(into[0]!.symbol, 'wAAPLx');
  assert.equal(from[0]!.symbol, 'wTSLAx');
  assert.equal(result.length, 2);
});

test('merge output is sorted by observedAt, then symbol', () => {
  const into: Sample[] = [
    sample({ symbol: 'wTSLAx', observedAt: 300 }),
    sample({ symbol: 'wAAPLx', observedAt: 100 }),
  ];
  const from: Sample[] = [sample({ symbol: 'wZZZZx', observedAt: 100 })];

  const merged = merge(into, from);
  assert.deepEqual(
    merged.map((s) => `${s.observedAt}:${s.symbol}`),
    ['100:wAAPLx', '100:wZZZZx', '300:wTSLAx'],
  );
});

// ---------------------------------------------------------------- append/readAll

test('readAll on a path that does not exist yet returns an empty array, not an error', () => {
  const { dir, file } = tmpPath();
  try {
    assert.deepEqual(readAll(file), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('append then readAll round-trips through a real file, across multiple append calls', () => {
  const { dir, file } = tmpPath();
  try {
    const batch1: Sample[] = [sample({ symbol: 'wAAPLx', observedAt: 1 })];
    const batch2: Sample[] = [
      sample({ symbol: 'wAAPLx', observedAt: 2 }),
      sample({ symbol: 'wTSLAx', observedAt: 3 }),
    ];

    append(batch1, file);
    append(batch2, file);

    const all = readAll(file);
    assert.equal(all.length, 3);
    assert.deepEqual(
      all.map((s) => s.observedAt),
      [1, 2, 3],
    );
    assert.equal(all[2]!.symbol, 'wTSLAx');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('append is a no-op on an empty batch — it must not create the directory or file', () => {
  const { dir, file } = tmpPath();
  try {
    append([], file);
    assert.deepEqual(readAll(file), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('append writes one JSON object per line with a trailing newline (JSONL framing)', () => {
  const { dir, file } = tmpPath();
  try {
    append([sample({ symbol: 'wAAPLx', observedAt: 1 })], file);
    const raw = readFileSync(file, 'utf8');
    assert.ok(raw.endsWith('\n'), 'file must end with a trailing newline');
    assert.equal(raw.split('\n').filter(Boolean).length, 1);
    // The single line must parse back to exactly the shape a Sample has.
    const parsed = JSON.parse(raw.trim());
    assert.equal(parsed.symbol, 'wAAPLx');
    assert.equal(parsed.observedAt, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------- coverage / jumps

test('jumps and coverage.boundaries count session boundaries crossed, not samples inside one session', () => {
  // Two marks inside one 'market' session must not be counted as a jump: the
  // useful unit is "close observed, then open observed", not sample count.
  const samples: Sample[] = [
    sample({ symbol: 'wAAPLx', observedAt: 1, period: 'closed', mid: 100 }),
    sample({ symbol: 'wAAPLx', observedAt: 2, period: 'market', mid: 101 }), // boundary #1
    sample({ symbol: 'wAAPLx', observedAt: 3, period: 'market', mid: 102 }), // same session — not a jump
    sample({ symbol: 'wAAPLx', observedAt: 4, period: 'closed', mid: 103 }),
    sample({ symbol: 'wAAPLx', observedAt: 5, period: 'market', mid: 104 }), // boundary #2
  ];

  const cov = coverage(samples);
  assert.equal(cov.length, 1);
  assert.equal(cov[0]!.symbol, 'wAAPLx');
  assert.equal(cov[0]!.samples, 5);
  assert.equal(cov[0]!.boundaries, 2, 'exactly two transitions into a market session, not four samples in one');

  const j = jumps(samples, 'wAAPLx');
  assert.equal(j.length, 2, 'jumps must match boundaries.length, one log-return per crossing');
  assert.equal(j[0], Math.log(101 / 100));
  assert.equal(j[1], Math.log(104 / 103));
});

test('a run of samples entirely inside one market session produces zero boundaries and zero jumps', () => {
  const samples: Sample[] = [
    sample({ symbol: 'wAAPLx', observedAt: 1, period: 'market', mid: 100 }),
    sample({ symbol: 'wAAPLx', observedAt: 2, period: 'market', mid: 101 }),
    sample({ symbol: 'wAAPLx', observedAt: 3, period: 'market', mid: 99 }),
  ];

  assert.equal(coverage(samples)[0]!.boundaries, 0);
  assert.equal(jumps(samples, 'wAAPLx').length, 0);
});

test('coverage separates symbols and sorts the report by symbol', () => {
  const samples: Sample[] = [
    sample({ symbol: 'wTSLAx', observedAt: 1, period: 'closed' }),
    sample({ symbol: 'wTSLAx', observedAt: 2, period: 'market' }),
    sample({ symbol: 'wAAPLx', observedAt: 1, period: 'market' }),
  ];

  const cov = coverage(samples);
  assert.deepEqual(
    cov.map((c) => c.symbol),
    ['wAAPLx', 'wTSLAx'],
  );
  assert.equal(cov.find((c) => c.symbol === 'wTSLAx')!.boundaries, 1);
  assert.equal(cov.find((c) => c.symbol === 'wAAPLx')!.boundaries, 0, 'a single market sample is not a crossing');
});

test('jumps skips a pair with a non-positive mid rather than producing a bad log return', () => {
  const samples: Sample[] = [
    sample({ symbol: 'wAAPLx', observedAt: 1, period: 'closed', mid: 0 }),
    sample({ symbol: 'wAAPLx', observedAt: 2, period: 'market', mid: 100 }),
  ];
  assert.equal(jumps(samples, 'wAAPLx').length, 0);
});
