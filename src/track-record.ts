/**
 * What a published thesis actually did, read back from the chain.
 *
 * This is the read half of Simple mode. `ThesisRegistry` says who claimed what
 * and when; `ReceiptRegistry` says what was then executed. Joining them is the
 * whole product claim in one comparison — the reasoning was published *before*
 * the outcome existed — and it is what makes a track record here different from
 * a screenshot.
 *
 * The join key is the thesis's `contentHash`, which every fill carries as
 * `thesisHash`. Nothing else links them: `ReceiptRegistry.performance()` is keyed
 * by `mandateId`, so it answers "how did this mandate do", not "how did this
 * thesis do". A thesis can be followed by many mandates — that is the point of
 * Simple mode — so the aggregation below groups by hash and ignores mandates.
 *
 * Two things this module refuses to do:
 *
 *  - **Invent a basket.** The weights come from the settled fills, not from the
 *    thesis text. The text is a claim; the fills are what a follower would be
 *    copying. They are also the only half that cannot be rewritten.
 *  - **Attribute an unattributed receipt.** A fill with a zero `thesisHash` was
 *    executed without a published thesis. It is counted and reported as such
 *    rather than folded into a thesis it was never bound to.
 */
import { formatUnits, type Address, type Hex } from 'viem';
import { RECEIPT_REGISTRY_ABI, THESIS_REGISTRY_ABI } from './abi';
import { client, serial, USDG } from './chain';
import { MAINNET } from './deployments';
import { loadToken } from './pool';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** One settled leg, as the chain recorded it. */
export interface FillRecord {
  asset: Address;
  /** Read from the token, not from a table — see `XSTOCKS` in chain.ts. */
  symbol: string;
  isExit: boolean;
  /** USDG in, 6 decimals. */
  amountInUsdg: bigint;
  amountOut: bigint;
  /** Realised price, 8 decimals. */
  executionPriceE8: bigint;
  /** Realised slippage against the quote the agent acted on. */
  slippageBps: number;
  /** The oracle's fair value at execution time, 8 decimals. */
  fairValueE8: bigint;
  gapRisk: number;
}

export interface ReceiptRecord {
  id: number;
  mandateId: bigint;
  policyVersion: number;
  agent: Address;
  thesisHash: Hex;
  evidenceHash: Hex;
  timestamp: number;
  blockNumber: bigint;
  fills: FillRecord[];
}

/**
 * One asset's share of a thesis's executed entries.
 *
 * Weights are computed over **entries only**. An exit is a decision to leave,
 * not a smaller allocation, so folding it into the denominator would quietly
 * misreport what a follower is being asked to copy.
 */
export interface BasketWeight {
  asset: Address;
  symbol: string;
  /** Summed USDG across every entry fill in this asset. */
  notionalUsdg: bigint;
  /** Share of the thesis's total entry notional. */
  weightBps: number;
}

export interface TrackRecord {
  fillCount: number;
  entryCount: number;
  exitCount: number;
  /** Total USDG deployed across entries. */
  notionalUsdg: bigint;
  /** Notional-weighted realised slippage. The honest headline number. */
  weightedSlippageBps: number;
  worstSlippageBps: number;
  /** Unix seconds of the first and last settled fill, or null with no fills. */
  firstFillAt: number | null;
  lastFillAt: number | null;
}

export interface ThesisRecord {
  id: number;
  author: Address;
  contentHash: Hex;
  publishedAt: number;
  blockNumber: bigint;
  /**
   * Empty for every thesis published so far — there is nowhere to pin yet, and
   * `thesis-publish.ts` writes `''` rather than a CID that resolves to nothing.
   * The basket below is derived from fills precisely so this does not block a
   * follower.
   */
  cid: string;
  receipts: ReceiptRecord[];
  basket: BasketWeight[];
  record: TrackRecord;
  /**
   * True when every receipt settled after the thesis was published. False means
   * the ordering claim does not hold for this thesis, and a consumer should say
   * so rather than render a track record that implies foresight.
   */
  publishedBeforeExecution: boolean;
}

export interface RegistrySnapshot {
  chainId: number;
  theses: ThesisRecord[];
  /**
   * Receipts carrying a zero `thesisHash` — executed with no published thesis.
   * Reported rather than hidden: they are real fills, and a track record page
   * that silently drops them overstates how much of the activity was declared
   * in advance.
   */
  unattributed: ReceiptRecord[];
  /**
   * Receipts whose `thesisHash` matches no entry in `ThesisRegistry`. Should be
   * empty; a non-empty list means a hash was stamped into a fill without the
   * thesis ever being published, which is worth surfacing loudly.
   */
  orphanedHashes: Hex[];
}

function registryAddresses() {
  const deployment = MAINNET;
  if (!deployment) throw new Error('no mainnet deployment recorded in src/deployments.ts');

  const receipts = deployment.contracts.ReceiptRegistry as Address | undefined;
  const theses = deployment.contracts.ThesisRegistry as Address | undefined;
  if (!receipts || !theses) {
    throw new Error('ReceiptRegistry or ThesisRegistry missing from the mainnet deployment');
  }
  return { receipts, theses, chainId: deployment.chainId };
}

/**
 * Symbols for exactly the assets that appear in the receipts.
 *
 * `addressBySymbol()` in pool.ts loads all 30 xStocks; a track record touches a
 * handful, and the public RPC is the scarce resource here.
 */
async function symbolsFor(assets: Address[]): Promise<Map<Address, string>> {
  const unique = [...new Set(assets.map((a) => a.toLowerCase() as Address))];
  const tokens = await serial(unique, (a: Address) => loadToken(a));
  return new Map(tokens.map((t) => [t.address.toLowerCase() as Address, t.symbol]));
}

/**
 * Every receipt, oldest first.
 *
 * Enumerated by index rather than by log scan: `count()` is authoritative, the
 * volume is small, and an event query against this RPC is the less reliable of
 * the two. Revisit if receipts ever reach the thousands — at which point the
 * indexer in `05-status.md` stops being a roadmap item.
 */
async function loadReceipts(registry: Address): Promise<ReceiptRecord[]> {
  const count = await client.readContract({
    address: registry,
    abi: RECEIPT_REGISTRY_ABI,
    functionName: 'count',
  });

  const ids = Array.from({ length: Number(count) }, (_, i) => i);
  const raw = await serial(ids, async (id) => {
    const [receipt, fills] = await client.readContract({
      address: registry,
      abi: RECEIPT_REGISTRY_ABI,
      functionName: 'get',
      args: [BigInt(id)],
    });
    return { id, receipt, fills };
  });

  const symbols = await symbolsFor(raw.flatMap((r) => r.fills.map((f) => f.asset)));

  return raw.map(({ id, receipt, fills }) => ({
    id,
    mandateId: receipt.mandateId,
    policyVersion: Number(receipt.policyVersion),
    agent: receipt.agent,
    thesisHash: receipt.thesisHash,
    evidenceHash: receipt.evidenceHash,
    timestamp: Number(receipt.timestamp),
    blockNumber: receipt.blockNumber,
    fills: fills.map((f) => ({
      asset: f.asset,
      symbol: symbols.get(f.asset.toLowerCase() as Address) ?? f.asset,
      isExit: f.isExit,
      amountInUsdg: f.amountInUsdg,
      amountOut: f.amountOut,
      executionPriceE8: f.executionPriceE8,
      slippageBps: Number(f.slippageBps),
      fairValueE8: f.fairValueE8,
      gapRisk: Number(f.gapRisk),
    })),
  }));
}

/** Weight a thesis's entry fills by the USDG that actually went in. */
function basketFrom(receipts: ReceiptRecord[]): BasketWeight[] {
  const byAsset = new Map<Address, { symbol: string; notional: bigint }>();

  for (const r of receipts) {
    for (const f of r.fills) {
      if (f.isExit) continue;
      const key = f.asset.toLowerCase() as Address;
      const seen = byAsset.get(key);
      if (seen) seen.notional += f.amountInUsdg;
      else byAsset.set(key, { symbol: f.symbol, notional: f.amountInUsdg });
    }
  }

  const total = [...byAsset.values()].reduce((sum, v) => sum + v.notional, 0n);
  if (total === 0n) return [];

  return [...byAsset.entries()]
    .map(([asset, v]) => ({
      asset,
      symbol: v.symbol,
      notionalUsdg: v.notional,
      // Integer bps at chain precision; the rounding is toward zero and the
      // remainder is at most one bps per asset, which is below anything a
      // follower's fill can express anyway.
      weightBps: Number((v.notional * 10_000n) / total),
    }))
    .sort((a, b) => b.weightBps - a.weightBps);
}

function recordFrom(receipts: ReceiptRecord[]): TrackRecord {
  const fills = receipts.flatMap((r) =>
    r.fills.map((f) => ({ ...f, timestamp: r.timestamp })),
  );
  const entries = fills.filter((f) => !f.isExit);
  const notional = entries.reduce((sum, f) => sum + f.amountInUsdg, 0n);

  // Weighted by notional rather than averaged per fill: a $0.25 fill and a
  // $2,000 fill are not one datum each, and treating them as such is how a
  // slippage number stops describing the money.
  const weighted =
    notional === 0n
      ? 0
      : Number(
          entries.reduce((sum, f) => sum + f.amountInUsdg * BigInt(f.slippageBps), 0n) /
            notional,
        );

  const times = fills.map((f) => f.timestamp).sort((a, b) => a - b);

  return {
    fillCount: fills.length,
    entryCount: entries.length,
    exitCount: fills.length - entries.length,
    notionalUsdg: notional,
    weightedSlippageBps: weighted,
    worstSlippageBps: fills.reduce((worst, f) => Math.max(worst, f.slippageBps), 0),
    firstFillAt: times[0] ?? null,
    lastFillAt: times[times.length - 1] ?? null,
  };
}

/**
 * The whole registry, joined.
 *
 * One pass over both registries; everything after is local. Called by the API
 * route and by `pnpm track-record`, so the page and the terminal cannot
 * disagree about what the chain says (D28).
 */
export async function loadRegistry(): Promise<RegistrySnapshot> {
  const { receipts: receiptRegistry, theses: thesisRegistry, chainId } = registryAddresses();

  const count = await client.readContract({
    address: thesisRegistry,
    abi: THESIS_REGISTRY_ABI,
    functionName: 'count',
  });

  const thesisIds = Array.from({ length: Number(count) }, (_, i) => i);
  const [published, allReceipts] = await Promise.all([
    serial(thesisIds, async (id) => {
      const t = await client.readContract({
        address: thesisRegistry,
        abi: THESIS_REGISTRY_ABI,
        functionName: 'get',
        args: [BigInt(id)],
      });
      return { id, thesis: t };
    }),
    loadReceipts(receiptRegistry),
  ]);

  const byHash = new Map<string, ReceiptRecord[]>();
  const unattributed: ReceiptRecord[] = [];
  for (const r of allReceipts) {
    if (r.thesisHash === ZERO_HASH) {
      unattributed.push(r);
      continue;
    }
    const key = r.thesisHash.toLowerCase();
    byHash.set(key, [...(byHash.get(key) ?? []), r]);
  }

  const theses: ThesisRecord[] = published.map(({ id, thesis }) => {
    const key = thesis.contentHash.toLowerCase();
    const mine = byHash.get(key) ?? [];
    byHash.delete(key);
    const publishedAt = Number(thesis.publishedAt);

    return {
      id,
      author: thesis.author,
      contentHash: thesis.contentHash,
      publishedAt,
      blockNumber: thesis.blockNumber,
      cid: thesis.cid,
      receipts: mine,
      basket: basketFrom(mine),
      record: recordFrom(mine),
      // The ordering claim, checked rather than assumed. `every` on an empty
      // list is true, which is correct here: a thesis with no executions has
      // not yet contradicted itself.
      publishedBeforeExecution: mine.every((r) => r.timestamp > publishedAt),
    };
  });

  return {
    chainId,
    theses,
    unattributed,
    orphanedHashes: [...byHash.keys()] as Hex[],
  };
}

/** Convenience for a detail page. Returns null rather than throwing on a bad id. */
export async function loadThesis(id: number): Promise<ThesisRecord | null> {
  const snapshot = await loadRegistry();
  return snapshot.theses.find((t) => t.id === id) ?? null;
}

/** USDG at 6 decimals, for display only. */
export function usdg(amount: bigint): string {
  return formatUnits(amount, USDG.decimals);
}
