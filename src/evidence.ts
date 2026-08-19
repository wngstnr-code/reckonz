/**
 * What the agent was looking at when it acted, hashed into the receipt.
 *
 * `ReceiptRegistry.Fill` has carried `evidenceHash` and `evidenceCID` since it
 * was written, `03-architecture.md` promised "Evidence: IPFS, hash on-chain",
 * and every receipt so far records a zero hash and an empty string (D52). So the
 * claim that a fill can be audited against the state that produced it was not
 * true: you could see *what* was traded, never *why that was the right size at
 * that moment*.
 *
 * The half that needs no infrastructure is the hash, and that is the half that
 * binds. A bundle is written to `evidence/<hash>.json` and its keccak goes on
 * chain in the same transaction as the fill. Anyone holding the file can prove
 * it is the one the receipt refers to; nobody can substitute a different one
 * afterwards, because the receipt is append-only.
 *
 * **This is deliberately not IPFS, and `evidenceCID` stays empty.** A CID names
 * content on a network that will serve it; writing one we cannot pin would be a
 * pointer to nothing, which D50 already refused to do for `ThesisRegistry.cid`.
 * Retrievability is a separate problem from integrity, and only one of them was
 * free. When there is somewhere to pin, the same bundle produces the same hash
 * and the CID can be added for fills made from then on.
 *
 *   pnpm evidence <hash>     # print a stored bundle, and re-verify its hash
 */
import { keccak256, toHex, type Address, type Hex } from 'viem';
import { canonicalise } from './thesis';

/** One leg as it was decided, before the chain answered. */
export interface EvidenceLeg {
  asset: Address;
  symbol: string;
  /** Settlement currency in for an entry; asset units in for an exit. Base units. */
  amountIn: string;
  /** The floor the transaction carried, in the output token's **base units**. */
  minAmountOut: string;
  feeTier: number;
  /**
   * What the simulation said the leg would return, as a **decimal string** --
   * `"0.002277759170473198"`, not base units.
   *
   * So this field and `minAmountOut` above describe the same quantity in two
   * different representations, which is a wart and not a fixable one: the bundle
   * layout is an input to `evidenceHash`, and changing it would make every hash
   * already on chain unverifiable. Recorded here so the next reader compares
   * them knowingly instead of dividing one by the other, which produces a
   * plausible number that means nothing.
   */
  simulatedOut: string;
  /** Price impact the planner measured, in basis points. */
  impactBps: number | null;
}

/** The oracle's published view of an asset at decision time. */
export interface EvidenceObservation {
  asset: Address;
  fairValueE8: string;
  confidenceBps: number;
  gapRisk: number;
  capacityUsdg: string;
  updatedAt: number;
  /** Age in seconds when the decision was taken. The point of recording it. */
  ageSeconds: number;
  hasValue: boolean;
}

export interface EvidenceBundle {
  /** `entry` spends the settlement currency; `exit` sells a position back. */
  kind: 'entry' | 'exit';
  chainId: number;
  /** Unix seconds when the bundle was assembled, not when it was mined. */
  decidedAt: number;
  mandateId: string;
  executor: Address;
  guard: Address;
  /** Zero when the fill claims no published reasoning. */
  thesisHash: Hex;
  legs: EvidenceLeg[];
  observations: EvidenceObservation[];
  /** The guard's own verdict, asked before spending gas. */
  dryRun: { ok: boolean; reason: string; offendingAsset: Address | null };
  /**
   * Exits only, and only when the shortfall could not be measured (D77).
   *
   * `Executor._exitShortfallBps` returns zero when the oracle is stale or
   * silent, so `maxSlippageBps` has nothing to compare against and the sale goes
   * out unbounded. The observation above already proves the oracle had lapsed;
   * this records that the seller was told and went ahead anyway.
   *
   * Optional, and absent on every measured fill — `canonicalise` drops
   * `undefined`, so bundles that do not set it hash exactly as they did before
   * this field existed, and every evidence hash already on chain still verifies.
   */
  shortfall?: { status: string; acknowledged: boolean };
}

/**
 * Canonical hash of a bundle.
 *
 * Shares `canonicalise` with `thesisHash` rather than reimplementing it: key
 * order must not change the answer, and two hashing conventions in one repo is
 * one convention that will drift. If this changes, every previously recorded
 * `evidenceHash` becomes unverifiable — so it must not change casually.
 */
export function evidenceHash(bundle: EvidenceBundle): Hex {
  return keccak256(toHex(canonicalise(bundle)));
}

/** Where a bundle lives. Relative to the repo root, and committed. */
export function evidencePath(hash: Hex): string {
  return `evidence/${hash}.json`;
}

/**
 * Node-only. Kept behind dynamic imports so this module stays importable from
 * the browser — `src/abi.ts`, `chain.ts` and `deployments.ts` are not the only
 * files the FE reaches, and a top-level `node:fs` here would break the page.
 */
export async function writeEvidence(bundle: EvidenceBundle): Promise<Hex> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const hash = evidenceHash(bundle);
  await mkdir('evidence', { recursive: true });
  // Pretty-printed for a human reading the file; the hash is taken from the
  // canonical form, so formatting here cannot affect it.
  await writeFile(evidencePath(hash), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  return hash;
}

/**
 * The bundle for a hash, from wherever it ended up.
 *
 * Disk first — that is where the CLI writes and what the repo commits. Then the
 * archive, because a fill placed through the website was never on this machine
 * (D80): its bundle went to a blob store, and a verifier who has just cloned
 * this repo has no other way to reach it. Without the second half `pnpm
 * evidence` could only ever check the fills we made ourselves, which is the
 * weakest possible version of an audit trail.
 */
export async function readEvidence(hash: Hex): Promise<EvidenceBundle | null> {
  const { readFile } = await import('node:fs/promises');
  try {
    return JSON.parse(await readFile(evidencePath(hash), 'utf8')) as EvidenceBundle;
  } catch {
    /* not on disk — try the archive below */
  }

  const { EVIDENCE_BLOB_BASE, evidenceKey } = await import('./evidence-store');
  if (!EVIDENCE_BLOB_BASE) return null;

  try {
    const response = await fetch(`${EVIDENCE_BLOB_BASE.replace(/\/$/, '')}/${evidenceKey(hash)}`);
    if (!response.ok) return null;
    return (await response.json()) as EvidenceBundle;
  } catch {
    return null;
  }
}

/**
 * Re-derive the hash from a stored bundle.
 *
 * The whole point of the exercise: a bundle that no longer hashes to the value
 * in the receipt has been edited, and saying so is more useful than any amount
 * of assurance that it has not.
 */
export function verifyEvidence(bundle: EvidenceBundle, claimed: Hex): boolean {
  return evidenceHash(bundle).toLowerCase() === claimed.toLowerCase();
}

/**
 * Where a bundle was found, and whether it still hashes to what the chain says.
 *
 * `unreachable` and `mismatch` are different failures and only one of them is
 * ours: a bundle nobody archived was never auditable, and a bundle that no
 * longer re-derives its hash has been edited. Collapsing them into "not
 * verified" would hide the second inside the first.
 */
export type EvidenceCheck =
  | { kind: 'none' }
  /** The bundle travels with the verdict: whoever verified it wants to read it. */
  | { kind: 'verified'; source: 'file' | 'blob'; url: string | null; bundle: EvidenceBundle }
  | { kind: 'mismatch'; source: 'file' | 'blob' }
  | { kind: 'unreachable' };

const ZERO_EVIDENCE = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Check one receipt's evidence hash against the bundle it claims.
 *
 * Disk first, then the archive, for the reason `readEvidence` gives — but this
 * reports which of the two answered, because only the archive is a URL a
 * stranger can open. A bundle that exists solely on the machine that made it is
 * a private record, and rendering it as a public one would be the loudest kind
 * of lie this page could tell.
 *
 * A verified result carries the bundle itself. The caller has already paid for
 * the fetch, and the bundle is the decision -- what the guard was asked before
 * any gas was spent, how old the oracle was at that moment, the floor the
 * transaction carried. Returning only a boolean made the page that exists to
 * show the decision download it and throw it away.
 *
 * Never throws: a page about twenty receipts must not fail because one bundle
 * is missing.
 */
export async function checkEvidence(claimed: string): Promise<EvidenceCheck> {
  if (!claimed || claimed.toLowerCase() === ZERO_EVIDENCE) return { kind: 'none' };
  const hash = claimed as Hex;

  const { readFile } = await import('node:fs/promises');
  try {
    const bundle = JSON.parse(await readFile(evidencePath(hash), 'utf8')) as EvidenceBundle;
    return verifyEvidence(bundle, hash)
      ? { kind: 'verified', source: 'file', url: null, bundle }
      : { kind: 'mismatch', source: 'file' };
  } catch {
    /* not on this machine — the archive is the only other place it can be */
  }

  const { EVIDENCE_BLOB_BASE, evidenceKey } = await import('./evidence-store');
  if (!EVIDENCE_BLOB_BASE) return { kind: 'unreachable' };

  const url = `${EVIDENCE_BLOB_BASE.replace(/\/$/, '')}/${evidenceKey(hash)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return { kind: 'unreachable' };
    const bundle = (await response.json()) as EvidenceBundle;
    return verifyEvidence(bundle, hash)
      ? { kind: 'verified', source: 'blob', url, bundle }
      : { kind: 'mismatch', source: 'blob' };
  } catch {
    return { kind: 'unreachable' };
  }
}
