/**
 * Where a bundle goes, and what is said when it goes nowhere.
 *
 * The defect this module closes was not a crash. `writeEvidence` threw on
 * Vercel's read-only filesystem, `prepareFill` caught it, and the plan came back
 * `stored: false` — a boolean nothing rendered in a colour anyone would notice.
 * Measured against production on 2026-08-14, that was **every** fill placed
 * through the website. So the tests that matter here are the ones about
 * reporting, not the ones about writing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evidenceHash, type EvidenceBundle } from './evidence';
import {
  describePersistence,
  evidenceKey,
  hasBlobCredentials,
  persistBundle,
} from './evidence-store';

const BUNDLE: EvidenceBundle = {
  kind: 'entry',
  chainId: 196,
  decidedAt: 1_786_000_000,
  mandateId: '1',
  executor: '0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2',
  guard: '0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be',
  thesisHash: `0x${'0'.repeat(64)}`,
  legs: [
    {
      asset: '0xE7E553Cd128F0011777323A0b44a7b96EA1CB540',
      symbol: 'wSPYx',
      amountIn: '500000',
      minAmountOut: '640',
      feeTier: 500,
      simulatedOut: '643',
      impactBps: 3,
    },
  ],
  observations: [
    {
      asset: '0xE7E553Cd128F0011777323A0b44a7b96EA1CB540',
      fairValueE8: '77694500000',
      confidenceBps: 12,
      gapRisk: 4,
      capacityUsdg: '3872000000',
      updatedAt: 1_785_999_990,
      ageSeconds: 10,
      hasValue: true,
    },
  ],
  dryRun: { ok: true, reason: 'ALLOW', offendingAsset: null },
};

/** Run something with the process parked in an empty directory. */
async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'reckonz-evidence-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    return await fn(dir);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
}

test('the key is the hash, so a receipt is enough to find its bundle', () => {
  // No random suffix, no timestamp, no counter. The 32 bytes in the receipt are
  // the whole address of the evidence — anything else and a verifier holding a
  // receipt has nowhere to look.
  const hash = evidenceHash(BUNDLE);
  assert.equal(evidenceKey(hash), `evidence/${hash}.json`);
});

test('with a writable filesystem the bundle lands on disk, byte for byte', async () => {
  await inTempDir(async () => {
    const where = await persistBundle(BUNDLE);
    assert.equal(where.kind, 'file');
    if (where.kind !== 'file') return;

    const written = JSON.parse(await readFile(where.path, 'utf8')) as EvidenceBundle;
    // Re-derived from the file rather than compared field by field: this is the
    // property `pnpm evidence` relies on, and the only one worth asserting.
    assert.equal(evidenceHash(written), evidenceHash(BUNDLE));
  });
});

test('a bundle that could not be stored says so, with the reason', async () => {
  // The production case. There is no token and the filesystem refuses, and the
  // result must carry a sentence a user can act on rather than a false.
  await inTempDir(async () => {
    // All three, not just the read-write token: the SDK authenticates with
    // `BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN` first, and a test that unset only
    // the obvious one would quietly upload to the real store from CI.
    const saved = {
      rw: process.env.BLOB_READ_WRITE_TOKEN,
      storeId: process.env.BLOB_STORE_ID,
      oidc: process.env.VERCEL_OIDC_TOKEN,
    };
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    const readOnly = join(process.cwd(), 'not-a-directory');
    const cwd = process.cwd();
    // A file where `evidence/` wants to be: mkdir fails, and so does the write.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(cwd, 'evidence'), 'in the way', 'utf8');
    void readOnly;

    try {
      const where = await persistBundle(BUNDLE);
      assert.equal(where.kind, 'none');
      if (where.kind !== 'none') return;
      assert.match(where.reason, /not archived anywhere/);
    } finally {
      if (saved.rw !== undefined) process.env.BLOB_READ_WRITE_TOKEN = saved.rw;
      if (saved.storeId !== undefined) process.env.BLOB_STORE_ID = saved.storeId;
      if (saved.oidc !== undefined) process.env.VERCEL_OIDC_TOKEN = saved.oidc;
    }
  });
});

test('the description of an unarchived bundle is loud, not neutral', () => {
  // It used to render in the same grey as everything else, which is how every
  // production fill went unarchived without anyone noticing.
  assert.match(describePersistence({ kind: 'none', reason: 'no token' }), /NOT ARCHIVED/);
  assert.match(
    describePersistence({ kind: 'blob', url: 'https://example.public.blob.vercel-storage.com/x' }),
    /archived at https/,
  );
  assert.match(describePersistence({ kind: 'file', path: 'evidence/0xabc.json' }), /written to/);
});

test('a configured store is enough to try — the SDK owns the credential question', () => {
  // Twice now this gated on a variable we guessed at. First
  // `BLOB_READ_WRITE_TOKEN`, which Vercel no longer provisions; then that plus
  // `VERCEL_OIDC_TOKEN`, which the runtime injects rather than the project
  // setting — production had `BLOB_STORE_ID` and still answered "no blob store
  // is reachable", a sentence we had written while guessing.
  //
  // Whether a token can be obtained is `@vercel/blob`'s question and it answers
  // it precisely. This asks only whether a store exists to talk to; a failure
  // then comes back in the SDK's own words, which is a diagnosis instead of an
  // assumption.
  const saved = { ...process.env };
  try {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    assert.equal(hasBlobCredentials(), false);

    process.env.BLOB_STORE_ID = 'store_kqJdljzlkaaN4S05';
    assert.equal(hasBlobCredentials(), true, 'a configured store must at least be tried');

    delete process.env.BLOB_STORE_ID;
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_x';
    assert.equal(hasBlobCredentials(), true);
  } finally {
    process.env = saved;
  }
});

test('a broken token falls back to disk rather than losing the bundle', async () => {
  // A present-but-wrong token must not be worse than no token: the upload fails,
  // and the local write still happens. Losing the only copy because a credential
  // rotated would be the expensive version of this bug.
  await inTempDir(async () => {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_definitely-not-valid';
    try {
      const where = await persistBundle(BUNDLE);
      assert.equal(where.kind, 'file', 'the bundle was lost when the upload failed');
    } finally {
      if (token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = token;
    }
  });
});
