/**
 * The registry as a page reads it: serialisable, receipt-first, and summarised.
 *
 * `track-record.ts` answers "what did each thesis do", which is the right shape
 * for a thesis and the wrong one for a page called Receipts. Twenty receipts
 * exist and six carry a thesis; a view built around theses renders those six in
 * full and footnotes the rest, which claims more discipline than the chain
 * shows. So this flattens the other way: every receipt is a row, and the thesis
 * is an attribute of it.
 *
 * It is also where the wire types live. They were declared inside the page
 * component and again, informally, by the route's JSON — two copies of one
 * contract, free to drift. Nothing here touches the chain or the filesystem, so
 * it is unit-testable without either.
 */

import { shortfallMeasured } from './abi';
import type { RegistrySnapshot } from './track-record';

/** BigInt does not survive JSON or the server-to-client boundary. Decimal strings do. */
export interface WireFill {
  asset: string;
  symbol: string;
  isExit: boolean;
  amountInUsdg: string;
  amountOut: string;
  executionPriceE8: string;
  slippageBps: number;
  fairValueE8: string;
  gapRisk: number;
}

export interface WireReceipt {
  id: number;
  mandateId: string;
  policyVersion: number;
  agent: string;
  thesisHash: string;
  evidenceHash: string;
  timestamp: number;
  blockNumber: string;
  fills: WireFill[];
}

export interface WireBasketWeight {
  asset: string;
  symbol: string;
  notionalUsdg: string;
  weightBps: number;
}

export interface WireTrackRecord {
  fillCount: number;
  entryCount: number;
  exitCount: number;
  notionalUsdg: string;
  weightedSlippageBps: number;
  worstSlippageBps: number;
  firstFillAt: number | null;
  lastFillAt: number | null;
}

export interface WireThesis {
  id: number;
  author: string;
  contentHash: string;
  publishedAt: number;
  blockNumber: string;
  cid: string;
  receipts: WireReceipt[];
  basket: WireBasketWeight[];
  record: WireTrackRecord;
  publishedBeforeExecution: boolean;
}

export interface WireSnapshot {
  chainId: number;
  theses: WireThesis[];
  unattributed: WireReceipt[];
  orphanedHashes: string[];
}

/** A receipt knows which thesis claimed it, which the chain-side record does not carry. */
export interface ViewReceipt extends WireReceipt {
  thesisId: number | null;
}

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Whether a receipt stamped an evidence hash at all. Not whether it verifies. */
export function hasEvidence(receipt: { evidenceHash: string }): boolean {
  return receipt.evidenceHash.toLowerCase() !== ZERO_HASH;
}

const fill = (f: RegistrySnapshot['theses'][number]['receipts'][number]['fills'][number]): WireFill => ({
  asset: f.asset,
  symbol: f.symbol,
  isExit: f.isExit,
  amountInUsdg: f.amountInUsdg.toString(),
  amountOut: f.amountOut.toString(),
  executionPriceE8: f.executionPriceE8.toString(),
  slippageBps: f.slippageBps,
  fairValueE8: f.fairValueE8.toString(),
  gapRisk: f.gapRisk,
});

const receipt = (r: RegistrySnapshot['unattributed'][number]): WireReceipt => ({
  id: r.id,
  mandateId: r.mandateId.toString(),
  policyVersion: r.policyVersion,
  agent: r.agent,
  thesisHash: r.thesisHash,
  evidenceHash: r.evidenceHash,
  timestamp: r.timestamp,
  blockNumber: r.blockNumber.toString(),
  fills: r.fills.map(fill),
});

/**
 * The whole snapshot, with every bigint turned into a decimal string.
 *
 * The route used a JSON replacer to do this, which worked for the route and
 * nothing else: a server component passing the snapshot to a client one hits
 * the same wall with no replacer available. Doing it once, by hand, means the
 * types describe what actually arrives rather than what was declared.
 */
export function toWire(snapshot: RegistrySnapshot): WireSnapshot {
  return {
    chainId: snapshot.chainId,
    theses: snapshot.theses.map((t) => ({
      id: t.id,
      author: t.author,
      contentHash: t.contentHash,
      publishedAt: t.publishedAt,
      blockNumber: t.blockNumber.toString(),
      cid: t.cid,
      receipts: t.receipts.map(receipt),
      basket: t.basket.map((b) => ({
        asset: b.asset,
        symbol: b.symbol,
        notionalUsdg: b.notionalUsdg.toString(),
        weightBps: b.weightBps,
      })),
      record: {
        ...t.record,
        notionalUsdg: t.record.notionalUsdg.toString(),
      },
      publishedBeforeExecution: t.publishedBeforeExecution,
    })),
    unattributed: snapshot.unattributed.map(receipt),
    orphanedHashes: snapshot.orphanedHashes,
  };
}

/**
 * Every receipt the chain holds, newest first, each knowing its thesis.
 *
 * Attributed and unattributed in one list on purpose. They are the same kind of
 * object and the difference between them is one field; sorting them into two
 * lists on the page was what buried fourteen of twenty.
 */
export function allReceipts(wire: WireSnapshot): ViewReceipt[] {
  const attributed = wire.theses.flatMap((t) =>
    t.receipts.map((r) => ({ ...r, thesisId: t.id })),
  );
  const rest = wire.unattributed.map((r) => ({ ...r, thesisId: null }));
  return [...attributed, ...rest].sort((a, b) => b.id - a.id);
}

export function findReceipt(wire: WireSnapshot, id: number): ViewReceipt | null {
  return allReceipts(wire).find((r) => r.id === id) ?? null;
}

export interface Summary {
  receiptCount: number;
  fillCount: number;
  entryCount: number;
  exitCount: number;
  /** USDG across entries, 6 decimals, as a decimal string. */
  notionalUsdg: string;
  /**
   * Notional-weighted realised slippage over the fills that *have* one.
   *
   * `null` when nothing was measurable at all, which is a different statement
   * from zero and must not be rendered as the best possible number (D77).
   */
  weightedSlippageBps: number | null;
  /** How many fills carried a measurable shortfall, and how many did not. */
  measuredFills: number;
  unmeasuredFills: number;
  withThesis: number;
  withEvidence: number;
}

/**
 * The page's headline numbers.
 *
 * `BoardFigures` established the rule these follow: a total is never shown
 * alone. Every count here is a fraction of `receiptCount` or carries the
 * denominator it was taken over, because "17 bps" says nothing without how many
 * fills it averaged and "6 theses" hides that fourteen receipts have none.
 */
export function summarise(wire: WireSnapshot): Summary {
  const receipts = allReceipts(wire);
  const fills = receipts.flatMap((r) => r.fills);

  let weighted = 0n;
  let weight = 0n;
  let measured = 0;

  for (const f of fills) {
    // An unmeasured shortfall is not a zero one. Averaging it in would drag the
    // headline towards zero using fills nothing ever priced, which is the exact
    // direction this number must never fail in.
    if (!shortfallMeasured(f)) continue;
    const notional = BigInt(f.amountInUsdg);
    weighted += notional * BigInt(f.slippageBps);
    weight += notional;
    measured += 1;
  }

  const entries = fills.filter((f) => !f.isExit);

  return {
    receiptCount: receipts.length,
    fillCount: fills.length,
    entryCount: entries.length,
    exitCount: fills.length - entries.length,
    notionalUsdg: entries.reduce((sum, f) => sum + BigInt(f.amountInUsdg), 0n).toString(),
    weightedSlippageBps: weight === 0n ? null : Number(weighted / weight),
    measuredFills: measured,
    unmeasuredFills: fills.length - measured,
    withThesis: receipts.filter((r) => r.thesisId !== null).length,
    withEvidence: receipts.filter(hasEvidence).length,
  };
}
