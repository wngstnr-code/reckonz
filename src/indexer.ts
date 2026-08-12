/**
 * The registries, read once and kept.
 *
 * ## Why this exists now
 *
 * `loadRegistry()` enumerates both registries on every call: `count()`, then one
 * `get()` per thesis and per receipt, then a token read per distinct asset to
 * resolve symbols. Every page load of the Simple mode surface pays that, over an
 * RPC that throttles, and the cost grows with the history — which is the one
 * number in this system designed to only ever go up.
 *
 * At sixteen receipts that was a few seconds. It is also the shape of a problem
 * that does not improve on its own, and `05-status.md` has carried "indexer —
 * blocked on volume" since before there were any receipts at all.
 *
 * ## An index is a second copy of a fact, so it is built to be checkable
 *
 * The repo's rule is one source per kind of fact, because the copy is what
 * drifts (CLAUDE.md). An index breaks that rule on purpose, so it pays for it:
 *
 *  - **The chain still decides how much exists.** `count()` is read every time;
 *    the store is only ever consulted for ids below it. A store that has been
 *    truncated, corrupted or deleted makes reads slower, never wrong, and can
 *    never invent a receipt the chain does not have.
 *  - **Only settled history is indexed.** A record is written once it is
 *    `CONFIRMATIONS` blocks deep. Receipt ids are assigned by an append-only
 *    contract, so an indexed record cannot change — but a reorg at the tip could
 *    take the transaction that produced it, so the tip is not indexed.
 *  - **`pnpm index --verify` re-reads every stored record from the chain** and
 *    reports any that disagree. A copy nobody re-derives is a copy nobody can
 *    trust, and this one can be re-derived in one command.
 *
 * ## Why a file and not a database
 *
 * Same answer as `observations/issuer-marks.jsonl`, which this sits next to:
 * append-only newline-delimited JSON survives being read with `tail`, diffs
 * legibly, and needs no infrastructure this project does not have. It is
 * committed, so a deploy ships the history rather than rebuilding it — Vercel's
 * filesystem is read-only, so the API can read this store and can never write
 * it. The writer is the CLI, and the publish worker if it is ever pointed here.
 *
 *   pnpm index             # fetch what is new, append it
 *   pnpm index --verify    # re-read every stored record from the chain
 *   pnpm index --rebuild   # throw the store away and index from zero
 */
import type { Address, Hex } from 'viem';
import { RECEIPT_REGISTRY_ABI, THESIS_REGISTRY_ABI } from './abi';
import { client, serial } from './chain';
import { MAINNET } from './deployments';
import { loadToken } from './pool';

export const STORE = 'observations/registry.jsonl';

/**
 * How far behind the tip to index.
 *
 * X Layer settles quickly and these registries are append-only, so this is not
 * about the record changing — it is about the transaction that created it being
 * dropped, which would shift every id after it. Twelve blocks is cheap
 * insurance measured in seconds.
 */
export const CONFIRMATIONS = 12n;

/** One settled leg, as the chain recorded it. Mirrors `ReceiptRegistry.Fill`. */
export interface IndexedFill {
  asset: Address;
  /** Resolved once, at index time, so a read never pays for a token call. */
  symbol: string;
  isExit: boolean;
  amountInUsdg: bigint;
  amountOut: bigint;
  executionPriceE8: bigint;
  slippageBps: number;
  fairValueE8: bigint;
  gapRisk: number;
}

export interface IndexedReceipt {
  kind: 'receipt';
  id: number;
  mandateId: bigint;
  policyVersion: number;
  agent: Address;
  thesisHash: Hex;
  evidenceHash: Hex;
  timestamp: number;
  blockNumber: bigint;
  fills: IndexedFill[];
}

export interface IndexedThesis {
  kind: 'thesis';
  id: number;
  author: Address;
  contentHash: Hex;
  publishedAt: number;
  blockNumber: bigint;
  cid: string;
}

export type IndexedRecord = IndexedReceipt | IndexedThesis;

export interface Index {
  theses: IndexedThesis[];
  receipts: IndexedReceipt[];
}

/**
 * BigInt has no JSON form, so every one is written as a decimal string and read
 * back by name. Listed explicitly rather than sniffed at parse time: a heuristic
 * that guesses which strings are numbers is a heuristic that will one day
 * convert a symbol or an address.
 */
const BIGINT_FIELDS = new Set([
  'mandateId',
  'blockNumber',
  'amountInUsdg',
  'amountOut',
  'executionPriceE8',
  'fairValueE8',
]);

function encode(record: IndexedRecord): string {
  return JSON.stringify(record, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function decode(line: string): IndexedRecord {
  return JSON.parse(line, (key, value) =>
    BIGINT_FIELDS.has(key) && typeof value === 'string' ? BigInt(value) : value,
  ) as IndexedRecord;
}

/**
 * Everything the store holds, deduplicated by id, newest write winning.
 *
 * Append-only means a re-index can write an id twice — after `--rebuild`, or if
 * two runs overlap. Reading takes the last one rather than refusing to load,
 * because the alternative is a store that a duplicate line makes unreadable.
 */
export async function readIndex(path = STORE): Promise<Index> {
  const { readFile } = await import('node:fs/promises');

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return { theses: [], receipts: [] };
  }

  const theses = new Map<number, IndexedThesis>();
  const receipts = new Map<number, IndexedReceipt>();

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let record: IndexedRecord;
    try {
      record = decode(line);
    } catch {
      // A truncated final line is what a killed writer leaves behind. Skipping
      // it costs one record that the next run will fetch again; refusing to
      // read costs the whole store.
      continue;
    }
    if (record.kind === 'thesis') theses.set(record.id, record);
    else if (record.kind === 'receipt') receipts.set(record.id, record);
  }

  return {
    theses: [...theses.values()].sort((a, b) => a.id - b.id),
    receipts: [...receipts.values()].sort((a, b) => a.id - b.id),
  };
}

/** Append, never rewrite. A store you can only add to is a store you can trust. */
export async function appendIndex(records: readonly IndexedRecord[], path = STORE): Promise<void> {
  if (records.length === 0) return;
  const { appendFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, records.map(encode).join('\n') + '\n', 'utf8');
}

function registries() {
  const deployment = MAINNET;
  if (!deployment) throw new Error('no mainnet deployment recorded in src/deployments.ts');

  const receipts = deployment.contracts.ReceiptRegistry as Address | undefined;
  const theses = deployment.contracts.ThesisRegistry as Address | undefined;
  if (!receipts || !theses) {
    throw new Error('ReceiptRegistry or ThesisRegistry missing from the mainnet deployment');
  }
  return { receipts, theses, chainId: deployment.chainId };
}

/** Symbols for exactly the assets that appear, one token read each. */
async function symbolsFor(assets: Address[]): Promise<Map<string, string>> {
  const unique = [...new Set(assets.map((a) => a.toLowerCase()))];
  const tokens = await serial(unique, (a: string) => loadToken(a as Address));
  return new Map(tokens.map((t) => [t.address.toLowerCase(), t.symbol]));
}

export async function fetchThesis(registry: Address, id: number): Promise<IndexedThesis> {
  const t = await client.readContract({
    address: registry,
    abi: THESIS_REGISTRY_ABI,
    functionName: 'get',
    args: [BigInt(id)],
  });
  return {
    kind: 'thesis',
    id,
    author: t.author,
    contentHash: t.contentHash,
    publishedAt: Number(t.publishedAt),
    blockNumber: t.blockNumber,
    cid: t.cid,
  };
}

export async function fetchReceipt(
  registry: Address,
  id: number,
  symbols?: Map<string, string>,
): Promise<IndexedReceipt> {
  const [receipt, fills] = await client.readContract({
    address: registry,
    abi: RECEIPT_REGISTRY_ABI,
    functionName: 'get',
    args: [BigInt(id)],
  });

  const resolved = symbols ?? (await symbolsFor(fills.map((f) => f.asset)));

  return {
    kind: 'receipt',
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
      symbol: resolved.get(f.asset.toLowerCase()) ?? f.asset,
      isExit: f.isExit,
      amountInUsdg: f.amountInUsdg,
      amountOut: f.amountOut,
      executionPriceE8: f.executionPriceE8,
      slippageBps: Number(f.slippageBps),
      fairValueE8: f.fairValueE8,
      gapRisk: Number(f.gapRisk),
    })),
  };
}

export interface IndexRun {
  chainId: number;
  /** What the chain says exists. */
  onChain: { theses: number; receipts: number };
  /** What the store held before this run. */
  had: { theses: number; receipts: number };
  added: IndexedRecord[];
  /** Records held back because they are not yet `CONFIRMATIONS` deep. */
  withheld: number;
  head: bigint;
}

/**
 * Fetch what the store does not have, and append it.
 *
 * Ids are contiguous from zero in both registries, so "what is missing" is
 * arithmetic rather than a scan: the chain's `count()` against the highest id
 * held. Gaps below that are refetched too — a partial run leaves holes, and a
 * store with a hole in it silently under-reports a track record.
 */
export async function indexRegistries(path = STORE): Promise<IndexRun> {
  const { receipts: receiptRegistry, theses: thesisRegistry, chainId } = registries();
  const stored = await readIndex(path);

  const [thesisCount, receiptCount, head] = await Promise.all([
    client.readContract({ address: thesisRegistry, abi: THESIS_REGISTRY_ABI, functionName: 'count' }),
    client.readContract({
      address: receiptRegistry,
      abi: RECEIPT_REGISTRY_ABI,
      functionName: 'count',
    }),
    client.getBlockNumber(),
  ]);

  const cutoff = head > CONFIRMATIONS ? head - CONFIRMATIONS : 0n;

  const haveThesis = new Set(stored.theses.map((t) => t.id));
  const haveReceipt = new Set(stored.receipts.map((r) => r.id));

  const missingTheses = Array.from({ length: Number(thesisCount) }, (_, i) => i).filter(
    (id) => !haveThesis.has(id),
  );
  const missingReceipts = Array.from({ length: Number(receiptCount) }, (_, i) => i).filter(
    (id) => !haveReceipt.has(id),
  );

  const added: IndexedRecord[] = [];
  let withheld = 0;

  for (const id of missingTheses) {
    const thesis = await fetchThesis(thesisRegistry, id);
    if (thesis.blockNumber > cutoff) {
      withheld += 1;
      continue;
    }
    added.push(thesis);
  }

  // Resolved once for the whole run rather than per receipt: the assets repeat,
  // and a token read is the same throttled RPC call as everything else here.
  const fetched: IndexedReceipt[] = [];
  for (const id of missingReceipts) {
    fetched.push(await fetchReceipt(receiptRegistry, id));
  }
  for (const receipt of fetched) {
    if (receipt.blockNumber > cutoff) {
      withheld += 1;
      continue;
    }
    added.push(receipt);
  }

  await appendIndex(added, path);

  return {
    chainId,
    onChain: { theses: Number(thesisCount), receipts: Number(receiptCount) },
    had: { theses: stored.theses.length, receipts: stored.receipts.length },
    added,
    withheld,
    head,
  };
}

export interface Mismatch {
  kind: 'thesis' | 'receipt';
  id: number;
  field: string;
  stored: string;
  chain: string;
}

/**
 * Re-derive every stored record from the chain and report what disagrees.
 *
 * This is the price of keeping a copy. It is deliberately a full re-read rather
 * than a spot check: the failure mode worth catching is a store written against
 * a different deployment or a different chain, and that one is invisible in a
 * sample.
 */
export async function verifyIndex(path = STORE): Promise<Mismatch[]> {
  const { receipts: receiptRegistry, theses: thesisRegistry } = registries();
  const stored = await readIndex(path);
  const out: Mismatch[] = [];

  const compare = (kind: 'thesis' | 'receipt', id: number, field: string, a: unknown, b: unknown) => {
    const left = typeof a === 'string' ? a.toLowerCase() : String(a);
    const right = typeof b === 'string' ? b.toLowerCase() : String(b);
    if (left !== right) out.push({ kind, id, field, stored: left, chain: right });
  };

  for (const held of stored.theses) {
    const fresh = await fetchThesis(thesisRegistry, held.id);
    compare('thesis', held.id, 'contentHash', held.contentHash, fresh.contentHash);
    compare('thesis', held.id, 'author', held.author, fresh.author);
    compare('thesis', held.id, 'publishedAt', held.publishedAt, fresh.publishedAt);
    compare('thesis', held.id, 'blockNumber', held.blockNumber, fresh.blockNumber);
  }

  for (const held of stored.receipts) {
    const fresh = await fetchReceipt(receiptRegistry, held.id);
    compare('receipt', held.id, 'thesisHash', held.thesisHash, fresh.thesisHash);
    compare('receipt', held.id, 'evidenceHash', held.evidenceHash, fresh.evidenceHash);
    compare('receipt', held.id, 'mandateId', held.mandateId, fresh.mandateId);
    compare('receipt', held.id, 'timestamp', held.timestamp, fresh.timestamp);
    compare('receipt', held.id, 'blockNumber', held.blockNumber, fresh.blockNumber);
    compare('receipt', held.id, 'fills', held.fills.length, fresh.fills.length);
    for (let i = 0; i < Math.min(held.fills.length, fresh.fills.length); i++) {
      const a = held.fills[i]!;
      const b = fresh.fills[i]!;
      compare('receipt', held.id, `fill[${i}].asset`, a.asset, b.asset);
      compare('receipt', held.id, `fill[${i}].amountInUsdg`, a.amountInUsdg, b.amountInUsdg);
      compare('receipt', held.id, `fill[${i}].amountOut`, a.amountOut, b.amountOut);
      compare('receipt', held.id, `fill[${i}].slippageBps`, a.slippageBps, b.slippageBps);
    }
  }

  return out;
}
