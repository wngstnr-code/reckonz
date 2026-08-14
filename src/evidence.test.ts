/**
 * Unit tests for the evidence hasher: `evidenceHash`, `verifyEvidence`,
 * `evidencePath`. `writeEvidence` / `readEvidence` are Node-only filesystem
 * helpers with a hardcoded, repo-relative `evidence/` directory (no
 * injectable base path) — writing through them here would either land in the
 * repo's real evidence store (forbidden) or require monkey-patching
 * `node:fs/promises`, which is out of scope for hand-written fakes. They are
 * deliberately not exercised; `evidenceHash`/`verifyEvidence` cover the part
 * that actually binds a receipt to a bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { Address, Hex } from 'viem';
import { evidenceHash, verifyEvidence, evidencePath, type EvidenceBundle } from './evidence';

const ASSET: Address = '0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f';

function baseBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    kind: 'entry',
    chainId: 196,
    decidedAt: 1_755_000_000,
    mandateId: 'mandate-1',
    executor: '0x1111111111111111111111111111111111111a',
    guard: '0x2222222222222222222222222222222222222b',
    thesisHash: '0x00' as Hex,
    legs: [
      {
        asset: ASSET,
        symbol: 'wAAPLx',
        amountIn: '1000000000',
        minAmountOut: '990000',
        feeTier: 3000,
        simulatedOut: '995000',
        impactBps: 12,
      },
    ],
    observations: [
      {
        asset: ASSET,
        fairValueE8: '25000000000',
        confidenceBps: 50,
        gapRisk: 10,
        capacityUsdg: '50000000000',
        updatedAt: 1_754_999_000,
        ageSeconds: 1000,
        hasValue: true,
      },
    ],
    dryRun: { ok: true, reason: '', offendingAsset: null },
    ...overrides,
  };
}

function exitBundle(): EvidenceBundle {
  const b = baseBundle({ kind: 'exit' });
  b.legs = [{ ...b.legs[0]!, impactBps: null }];
  return b;
}

// -------------------------------------------------------------- evidenceHash

test('evidenceHash is deterministic across repeated calls on the same bundle', () => {
  const bundle = baseBundle();
  assert.equal(evidenceHash(bundle), evidenceHash(baseBundle()));
});

test('evidenceHash does not depend on JavaScript key insertion order', () => {
  // Build the same bundle content, but with the top-level keys written in a
  // different order and one leg's keys reordered too. If canonicalise did
  // not sort keys, these two hashes would differ even though the bundles are
  // the same fact, which would make evidenceHash unverifiable by anyone who
  // re-serialises the JSON differently than we happened to.
  const bundleA = baseBundle();
  const bundleB: EvidenceBundle = {
    dryRun: bundleA.dryRun,
    observations: bundleA.observations,
    legs: [
      {
        impactBps: bundleA.legs[0]!.impactBps,
        simulatedOut: bundleA.legs[0]!.simulatedOut,
        feeTier: bundleA.legs[0]!.feeTier,
        minAmountOut: bundleA.legs[0]!.minAmountOut,
        amountIn: bundleA.legs[0]!.amountIn,
        symbol: bundleA.legs[0]!.symbol,
        asset: bundleA.legs[0]!.asset,
      },
    ],
    thesisHash: bundleA.thesisHash,
    guard: bundleA.guard,
    executor: bundleA.executor,
    mandateId: bundleA.mandateId,
    decidedAt: bundleA.decidedAt,
    chainId: bundleA.chainId,
    kind: bundleA.kind,
  };
  assert.equal(evidenceHash(bundleA), evidenceHash(bundleB));
});

test('evidenceHash changes when amountIn changes', () => {
  const a = baseBundle();
  const b = baseBundle();
  b.legs = [{ ...b.legs[0]!, amountIn: '2000000000' }];
  assert.notEqual(evidenceHash(a), evidenceHash(b));
});

test('evidenceHash changes when decidedAt changes', () => {
  const a = baseBundle();
  const b = baseBundle({ decidedAt: a.decidedAt + 1 });
  assert.notEqual(evidenceHash(a), evidenceHash(b));
});

test('evidenceHash changes when dryRun.ok flips', () => {
  const a = baseBundle();
  const b = baseBundle({ dryRun: { ...a.dryRun, ok: false } });
  assert.notEqual(evidenceHash(a), evidenceHash(b));
});

test('an exit bundle (impactBps: null) hashes deterministically, same as an entry bundle', () => {
  const exitA = exitBundle();
  const exitB = exitBundle();
  assert.equal(exitA.kind, 'exit');
  assert.equal(exitA.legs[0]!.impactBps, null);
  assert.equal(evidenceHash(exitA), evidenceHash(exitB));
  // And it must differ from the entry version of the same numbers, since
  // kind and impactBps are part of what was decided.
  assert.notEqual(evidenceHash(exitA), evidenceHash(baseBundle()));
});

// ------------------------------------------------------------- verifyEvidence

test('verifyEvidence returns true for a bundle and its own hash', () => {
  const bundle = baseBundle();
  assert.equal(verifyEvidence(bundle, evidenceHash(bundle)), true);
});

test('verifyEvidence returns false when the bundle has been altered from what the hash claims', () => {
  const bundle = baseBundle();
  const claimed = evidenceHash(bundle);
  const tampered = baseBundle({ decidedAt: bundle.decidedAt + 1 });
  assert.equal(verifyEvidence(tampered, claimed), false);
});

test('verifyEvidence works for the exit shape too', () => {
  const bundle = exitBundle();
  assert.equal(verifyEvidence(bundle, evidenceHash(bundle)), true);
});

test('verifyEvidence compares case-insensitively (hex casing is not semantic)', () => {
  const bundle = baseBundle();
  const claimed = evidenceHash(bundle).toUpperCase() as Hex;
  assert.equal(verifyEvidence(bundle, claimed), true);
});

// --------------------------------------------------------------- evidencePath

test('evidencePath derives a path under evidence/ named after the hash', () => {
  const bundle = baseBundle();
  const hash = evidenceHash(bundle);
  const p = evidencePath(hash);
  assert.equal(p, `evidence/${hash}.json`);
  assert.ok(p.startsWith('evidence/'));
  assert.ok(p.endsWith('.json'));
});

test('evidencePath stays inside the evidence directory for real hash values', () => {
  // Real hashes come only from keccak256 (fixed-length hex), so there is no
  // caller-supplied path-traversal input in practice. Confirm the resolved
  // path is contained within evidence/ for a spread of actual hash outputs.
  const hashes = [
    evidenceHash(baseBundle()),
    evidenceHash(exitBundle()),
    evidenceHash(baseBundle({ mandateId: 'mandate-2' })),
  ];
  const evidenceDir = path.resolve('evidence');
  for (const hash of hashes) {
    const resolved = path.resolve(evidencePath(hash));
    assert.ok(
      resolved.startsWith(evidenceDir + path.sep),
      `${resolved} escaped ${evidenceDir}`,
    );
  }
});
