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
  /** Settlement currency in for an entry; asset units in for an exit. */
  amountIn: string;
  /** The floor the transaction carried. */
  minAmountOut: string;
  feeTier: number;
  /** What the simulation said the leg would return. */
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

export async function readEvidence(hash: Hex): Promise<EvidenceBundle | null> {
  const { readFile } = await import('node:fs/promises');
  try {
    return JSON.parse(await readFile(evidencePath(hash), 'utf8')) as EvidenceBundle;
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
