/**
 * Unit tests for the registry index store (src/indexer.ts).
 *
 * No RPC. `client.readContract` / `client.getBlockNumber` are monkey-patched
 * on the shared `client` singleton exported from `./chain` — indexer.ts has no
 * dependency-injection seam for it, so this is the only way to keep these
 * tests offline. Every test that stubs the client restores the originals in a
 * `finally`, so a failure here cannot leak a fake into another test file.
 *
 * All filesystem interaction goes through a fresh directory under
 * os.tmpdir(), never the repo's committed `observations/registry.jsonl`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address, Hex } from 'viem';
import { client } from './chain';
import { MAINNET } from './deployments';
import {
  CONFIRMATIONS,
  appendIndex,
  fetchReceipt,
  fetchThesis,
  indexRegistries,
  readIndex,
  verifyIndex,
  type IndexedReceipt,
  type IndexedThesis,
} from './indexer';

function tmpPath(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));
  return { dir, file: join(dir, 'registry.jsonl') };
}

const THESIS_REGISTRY = (MAINNET!.contracts.ThesisRegistry as Address).toLowerCase();
const RECEIPT_REGISTRY = (MAINNET!.contracts.ReceiptRegistry as Address).toLowerCase();

const HASH = '0x' + '11'.repeat(32) as Hex;
const HASH2 = '0x' + '22'.repeat(32) as Hex;
const AGENT = '0x0000000000000000000000000000000000000a' as Address;
const AUTHOR = '0x0000000000000000000000000000000000000b' as Address;

function thesisFixture(overrides: Partial<{ author: Address; contentHash: Hex; publishedAt: bigint; blockNumber: bigint; cid: string }> = {}) {
  return {
    author: AUTHOR,
    contentHash: HASH,
    publishedAt: 1_000n,
    blockNumber: 50n,
    cid: 'bafy-fixture',
    ...overrides,
  };
}

function receiptFixture(
  overrides: Partial<{
    mandateId: bigint;
    policyVersion: number;
    thesisHash: Hex;
    evidenceHash: Hex;
    agent: Address;
    timestamp: bigint;
    blockNumber: bigint;
  }> = {},
): [any, any[]] {
  return [
    {
      mandateId: 1n,
      policyVersion: 1,
      thesisHash: HASH,
      evidenceHash: HASH2,
      agent: AGENT,
      timestamp: 1_000n,
      blockNumber: 10n,
      ...overrides,
    },
    [],
  ];
}

/** Install a fake client for the duration of `fn`, then restore the real one. */
async function withFakeClient<T>(
  handlers: {
    readContract: (args: any) => any;
    getBlockNumber?: () => bigint;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const originalReadContract = client.readContract;
  const originalGetBlockNumber = client.getBlockNumber;
  (client as any).readContract = async (args: any) => handlers.readContract(args);
  if (handlers.getBlockNumber) {
    (client as any).getBlockNumber = async () => handlers.getBlockNumber!();
  }
  try {
    return await fn();
  } finally {
    (client as any).readContract = originalReadContract;
    (client as any).getBlockNumber = originalGetBlockNumber;
  }
}

// -------------------------------------------------------------- JSONL round-trip

test('appendIndex then readIndex round-trips IndexedThesis and IndexedReceipt through JSONL, bigints included', async () => {
  const { dir, file } = tmpPath();
  try {
    const thesis: IndexedThesis = {
      kind: 'thesis',
      id: 0,
      author: AUTHOR,
      contentHash: HASH,
      publishedAt: 1_000,
      blockNumber: 50n,
      cid: 'bafy-fixture',
    };
    const receipt: IndexedReceipt = {
      kind: 'receipt',
      id: 0,
      mandateId: 7n,
      policyVersion: 1,
      agent: AGENT,
      thesisHash: HASH,
      evidenceHash: HASH2,
      timestamp: 2_000,
      blockNumber: 10n,
      fills: [
        {
          asset: '0x0000000000000000000000000000000000000c' as Address,
          symbol: 'wAAPLx',
          isExit: false,
          amountInUsdg: 100n,
          amountOut: 200n,
          executionPriceE8: 300n,
          slippageBps: 5,
          fairValueE8: 400n,
          gapRisk: 1,
        },
      ],
    };

    await appendIndex([thesis, receipt], file);
    const loaded = await readIndex(file);

    assert.equal(loaded.theses.length, 1);
    assert.equal(loaded.receipts.length, 1);
    assert.deepEqual(loaded.theses[0], thesis);
    assert.deepEqual(loaded.receipts[0], receipt);
    // bigint fields specifically — JSON round-trip through a decimal string
    // is where a naive implementation would silently drop precision.
    assert.equal(typeof loaded.receipts[0]!.mandateId, 'bigint');
    assert.equal(loaded.receipts[0]!.mandateId, 7n);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readIndex on a store that does not exist yet returns empty registries, not an error', async () => {
  const { dir, file } = tmpPath();
  try {
    const loaded = await readIndex(file);
    assert.deepEqual(loaded, { theses: [], receipts: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readIndex deduplicates by id, the newest written line winning', async () => {
  const { dir, file } = tmpPath();
  try {
    const first: IndexedThesis = {
      kind: 'thesis',
      id: 0,
      author: AUTHOR,
      contentHash: HASH,
      publishedAt: 1_000,
      blockNumber: 50n,
      cid: 'first',
    };
    const rewritten: IndexedThesis = { ...first, cid: 'rewritten-by-rebuild' };

    await appendIndex([first], file);
    await appendIndex([rewritten], file);

    const loaded = await readIndex(file);
    assert.equal(loaded.theses.length, 1, 'one id must yield one record, not two');
    assert.equal(loaded.theses[0]!.cid, 'rewritten-by-rebuild');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readIndex skips a truncated final line instead of refusing to read the whole store', async () => {
  const { dir, file } = tmpPath();
  try {
    const thesis: IndexedThesis = {
      kind: 'thesis',
      id: 0,
      author: AUTHOR,
      contentHash: HASH,
      publishedAt: 1_000,
      blockNumber: 50n,
      cid: 'ok',
    };
    await appendIndex([thesis], file);
    // Simulate a writer killed mid-line: append a fragment with no closing
    // brace and no trailing newline.
    const { appendFile } = await import('node:fs/promises');
    await appendFile(file, '{"kind":"thesis","id":1,"author":"0x');

    const loaded = await readIndex(file);
    assert.equal(loaded.theses.length, 1, 'the one well-formed record must still load');
    assert.equal(loaded.theses[0]!.id, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('appendIndex is a no-op on an empty batch — it must not create the directory or file', async () => {
  const { dir, file } = tmpPath();
  try {
    await appendIndex([], file);
    await assert.rejects(readFile(file, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --------------------------------------------------------------- fetch mapping

test('fetchThesis maps the on-chain struct into IndexedThesis, converting uint64s to number', async () => {
  const result = await withFakeClient(
    {
      readContract: ({ functionName }: any) => {
        assert.equal(functionName, 'get');
        return thesisFixture();
      },
    },
    () => fetchThesis(THESIS_REGISTRY as Address, 3),
  );

  assert.equal(result.id, 3);
  assert.equal(result.publishedAt, 1_000);
  assert.equal(typeof result.publishedAt, 'number');
  assert.equal(result.blockNumber, 50n);
});

test('fetchReceipt resolves symbols from the caller-supplied map, skipping a token read entirely', async () => {
  const asset = '0x0000000000000000000000000000000000000c' as Address;
  const result = await withFakeClient(
    {
      readContract: ({ functionName }: any) => {
        assert.equal(functionName, 'get');
        return [
          {
            mandateId: 1n,
            policyVersion: 1,
            thesisHash: HASH,
            evidenceHash: HASH2,
            agent: AGENT,
            timestamp: 1_000n,
            blockNumber: 10n,
          },
          [
            {
              asset,
              isExit: false,
              amountInUsdg: 100n,
              amountOut: 200n,
              executionPriceE8: 300n,
              slippageBps: 5,
              fairValueE8: 400n,
              gapRisk: 1,
            },
          ],
        ];
      },
    },
    () => fetchReceipt(RECEIPT_REGISTRY as Address, 0, new Map([[asset.toLowerCase(), 'wAAPLx']])),
  );

  assert.equal(result.fills[0]!.symbol, 'wAAPLx');
});

// --------------------------------------------------------------- indexRegistries

test('indexRegistries fetches only what the store is missing below chain count(), and enumerates the rest as withheld', async () => {
  const { dir, file } = tmpPath();
  try {
    const head = 100n;
    const cutoff = head - CONFIRMATIONS; // 88n

    const run = await withFakeClient(
      {
        getBlockNumber: () => head,
        readContract: ({ address, functionName, args }: any) => {
          const addr = (address as string).toLowerCase();
          if (addr === THESIS_REGISTRY) {
            if (functionName === 'count') return 2n;
            if (functionName === 'get') {
              const id = Number(args[0]);
              // id 0 is confirmed (blockNumber 50 <= cutoff 88); id 1 is not
              // yet CONFIRMATIONS deep (blockNumber 95 > cutoff 88).
              return thesisFixture({ blockNumber: id === 0 ? 50n : 95n, cid: `thesis-${id}` });
            }
          }
          if (addr === RECEIPT_REGISTRY) {
            if (functionName === 'count') return 1n;
            if (functionName === 'get') return receiptFixture({ blockNumber: 10n });
          }
          throw new Error(`unexpected readContract call: ${functionName} @ ${addr}`);
        },
      },
      () => indexRegistries(file),
    );

    assert.deepEqual(run.onChain, { theses: 2, receipts: 1 });
    assert.deepEqual(run.had, { theses: 0, receipts: 0 });
    // Only the confirmed thesis (id 0) and the confirmed receipt (id 0) are
    // added; the chain says two theses exist but only one is deep enough.
    assert.equal(run.added.length, 2);
    assert.equal(run.withheld, 1);

    const stored = await readIndex(file);
    assert.deepEqual(
      stored.theses.map((t) => t.id),
      [0],
      'the store must not hold an id that was withheld for reorg safety',
    );
    assert.deepEqual(
      stored.receipts.map((r) => r.id),
      [0],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('indexRegistries re-fetches only the ids missing from an already-populated store, never re-deriving what it already has', async () => {
  const { dir, file } = tmpPath();
  try {
    // Pre-populate with thesis id 0, as a previous run would have left it.
    const existing: IndexedThesis = {
      kind: 'thesis',
      id: 0,
      author: AUTHOR,
      contentHash: HASH,
      publishedAt: 1_000,
      blockNumber: 10n,
      cid: 'already-here',
    };
    await appendIndex([existing], file);

    const fetchedIds: number[] = [];
    const run = await withFakeClient(
      {
        getBlockNumber: () => 100n,
        readContract: ({ address, functionName, args }: any) => {
          const addr = (address as string).toLowerCase();
          if (addr === THESIS_REGISTRY) {
            if (functionName === 'count') return 2n; // chain now has ids 0 and 1
            if (functionName === 'get') {
              const id = Number(args[0]);
              fetchedIds.push(id);
              return thesisFixture({ blockNumber: 20n, cid: `thesis-${id}` });
            }
          }
          if (addr === RECEIPT_REGISTRY) {
            if (functionName === 'count') return 0n;
          }
          throw new Error(`unexpected readContract call: ${functionName} @ ${addr}`);
        },
      },
      () => indexRegistries(file),
    );

    assert.deepEqual(fetchedIds, [1], 'the chain still decides what exists; the store only fills in the gap below it');
    assert.equal(run.had.theses, 1);
    assert.equal(run.added.length, 1);

    const stored = await readIndex(file);
    assert.deepEqual(
      stored.theses.map((t) => t.id),
      [0, 1],
    );
    assert.equal(stored.theses[0]!.cid, 'already-here', 'the pre-existing record must be untouched by this run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------- verifyIndex

test('verifyIndex reports a stored record that disagrees with the chain, without overwriting the store', async () => {
  const { dir, file } = tmpPath();
  try {
    const stale: IndexedThesis = {
      kind: 'thesis',
      id: 0,
      author: AUTHOR,
      contentHash: HASH,
      publishedAt: 1_000,
      blockNumber: 50n,
      cid: 'stale-cid',
    };
    await appendIndex([stale], file);

    const mismatches = await withFakeClient(
      {
        readContract: ({ functionName }: any) => {
          assert.equal(functionName, 'get');
          // The chain's real contentHash disagrees with what is stored.
          return thesisFixture({ contentHash: HASH2, blockNumber: 50n });
        },
      },
      () => verifyIndex(file),
    );

    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0]!.kind, 'thesis');
    assert.equal(mismatches[0]!.id, 0);
    assert.equal(mismatches[0]!.field, 'contentHash');
    assert.equal(mismatches[0]!.stored, HASH.toLowerCase());
    assert.equal(mismatches[0]!.chain, HASH2.toLowerCase());

    // verifyIndex must be read-only: the store on disk still holds the stale
    // value it reported disagreeing with, not a silently "corrected" one.
    const reloaded = await readIndex(file);
    assert.equal(reloaded.theses[0]!.contentHash, HASH);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyIndex reports nothing when every stored field agrees with the chain', async () => {
  const { dir, file } = tmpPath();
  try {
    const record: IndexedThesis = {
      kind: 'thesis',
      id: 0,
      author: AUTHOR,
      contentHash: HASH,
      publishedAt: 1_000,
      blockNumber: 50n,
      cid: 'matches',
    };
    await appendIndex([record], file);

    const mismatches = await withFakeClient(
      { readContract: () => thesisFixture({ blockNumber: 50n }) },
      () => verifyIndex(file),
    );

    assert.deepEqual(mismatches, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
