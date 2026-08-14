/**
 * Where an evidence bundle actually lives — and the reason this file exists.
 *
 * `writeEvidence` puts the bundle in `evidence/<hash>.json`, which works on a
 * laptop and **does not work in production**. Vercel's filesystem is read-only
 * outside `/tmp`, so the write throws, `prepareFill` catches it, and the plan
 * comes back `stored: false`. Measured against the deployed app on 2026-08-14:
 *
 *     evidence.hash    0x2a872bd6…
 *     evidence.stored  false
 *
 * Which means a fill placed through the website put a hash on chain whose
 * bundle exists nowhere. `pnpm evidence` would answer "no bundle on disk" for
 * that receipt forever. The product's strongest claim — hash the evidence before
 * anything is signed, re-derive it from the file afterwards — worked perfectly
 * on the machine it was developed on and silently degraded to an unverifiable
 * 32 bytes on the path a real user takes. That is worse than not making the
 * claim.
 *
 * ## Three backends, in order, and none of them lie
 *
 *   1. **Vercel Blob**, when `BLOB_READ_WRITE_TOKEN` is set. Deterministic key,
 *      public read.
 *   2. **The filesystem**, when it is writable — the CLI, and any local run. The
 *      repo's `evidence/` directory stays what it has always been.
 *   3. **Nothing**, reported as `none` with the reason.
 *
 * The third is not a failure path to hide. A bundle that could not be stored is
 * a receipt nobody can audit, and the caller is expected to say so and hand the
 * user the JSON — see `Fill.tsx`. Silence is what this file was written to end.
 *
 * ## Why public
 *
 * The bundle is a quote, an oracle reading, a dry-run verdict and the addresses
 * involved. There is nothing private in it, and its entire purpose is for a
 * third party — a follower, a judge, an auditor — to fetch it and re-derive the
 * hash the chain already holds. A bundle behind a credential proves nothing to
 * the person who most needs it.
 */
import { evidenceHash, evidencePath, type EvidenceBundle } from './evidence';
import type { Hex } from 'viem';

/**
 * The public base of our Blob store, once one exists.
 *
 * A **committed constant** rather than an environment variable, deliberately:
 * `pnpm evidence` has to work for someone who has just cloned this repo and has
 * none of our credentials. An env var here would mean verification only works
 * for us, which is the opposite of the point.
 *
 * Empty until the store is provisioned:
 *
 *     vercel blob create-store reckonz-evidence
 *
 * then paste the store's public host here. Until then production fills report
 * `none`, honestly, and the browser offers the download instead.
 */
export const EVIDENCE_BLOB_BASE = process.env.EVIDENCE_BLOB_BASE ?? '';

export type Persistence =
  | { kind: 'blob'; url: string }
  | { kind: 'file'; path: string }
  | { kind: 'none'; reason: string };

/** Deterministic, so the hash on chain is the whole address of the bundle. */
export function evidenceKey(hash: Hex): string {
  return `evidence/${hash}.json`;
}

/**
 * Store a bundle, and say where it went.
 *
 * Never throws. A fill must not fail because an archive did — the trade is the
 * user's, the record is ours, and refusing to quote because a bucket is
 * unreachable would be the tail wagging the dog. What it must never do instead
 * is claim the bundle is somewhere it is not.
 */
export async function persistBundle(bundle: EvidenceBundle): Promise<Persistence> {
  const hash = evidenceHash(bundle);
  const body = `${JSON.stringify(bundle, null, 2)}\n`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const result = await put(evidenceKey(hash), body, {
        access: 'public',
        contentType: 'application/json',
        // The hash *is* the name. A random suffix would mean the bundle for a
        // receipt could not be found from the receipt, which is the only way
        // anyone will ever look for it.
        addRandomSuffix: false,
        // Two fills of the same leg in the same second produce the same bundle
        // and therefore the same hash; overwriting it with itself is correct.
        allowOverwrite: true,
      });
      return { kind: 'blob', url: result.url };
    } catch (e) {
      // Fall through to the filesystem rather than returning here: a token that
      // is present and broken should not be worse than no token at all.
      const reason = e instanceof Error ? e.message : String(e);
      const file = await tryFile(bundle, hash, body);
      return file ?? { kind: 'none', reason: `blob upload failed: ${reason}` };
    }
  }

  const file = await tryFile(bundle, hash, body);
  return (
    file ?? {
      kind: 'none',
      reason:
        'no BLOB_READ_WRITE_TOKEN and the filesystem is read-only — this bundle is not archived anywhere',
    }
  );
}

async function tryFile(
  _bundle: EvidenceBundle,
  hash: Hex,
  body: string,
): Promise<Persistence | null> {
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir('evidence', { recursive: true });
    await writeFile(evidencePath(hash), body, 'utf8');
    return { kind: 'file', path: evidencePath(hash) };
  } catch {
    return null;
  }
}

/** One sentence for a terminal or a panel. */
export function describePersistence(p: Persistence): string {
  switch (p.kind) {
    case 'blob':
      return `archived at ${p.url}`;
    case 'file':
      return `written to ${p.path}`;
    case 'none':
      return `NOT ARCHIVED — ${p.reason}`;
  }
}
