/**
 * X Layer (chainId 196) client + verified mainnet addresses.
 *
 * NOTE: the Uniswap V3 factory on X Layer is NOT at the canonical
 * 0x1F98431c8aD98523631AE4a59f267346ea31F984. Resolved on-chain by reading
 * factory() on a live pool. Using an SDK default here fails silently.
 */
import { createPublicClient, defineChain, http, type Address } from 'viem';

export const xLayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.xlayer.tech'] } },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

export const xLayerTestnet = defineChain({
  id: 1952,
  name: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://testrpc.xlayer.tech'] } },
});

/**
 * The public X Layer RPC throttles aggressively. Small JSON-RPC batches plus a
 * generous retry budget keeps the planner's thousands of reads from tripping
 * it — the simulation itself is offline, so this only costs us on load.
 */
export const client = createPublicClient({
  chain: xLayer,
  transport: http(undefined, {
    batch: { batchSize: 12, wait: 24 },
    retryCount: 6,
    retryDelay: 400,
    timeout: 30_000,
  }),
});

/** Serial map — the public RPC rejects wide fan-out. */
export async function serial<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i++) out.push(await fn(items[i]!, i));
  return out;
}

export const ADDR = {
  univ3Factory: '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  /**
   * ⛔ Deployed, correctly shaped, and **unable to execute a V3 swap on this chain.**
   * Its bytecode has the canonical v3 factory baked in, not X Layer's, so it derives
   * pool addresses that do not exist and reverts with no data. `SWEEP` works; nothing
   * that touches a pool does. See D35 before using this for anything.
   */
  universalRouter: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af',
  multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
  aaveV3Pool: '0xE3F3Caefdd7180F884c01E57f65Df979Af84f116',
} as const satisfies Record<string, Address>;

/** Settlement currency for every xStock pool on X Layer. */
export const USDG = {
  address: '0x4ae46a509f6b1d9056937ba4500cb143933d2dc8' as Address,
  symbol: 'USDG',
  decimals: 6,
};

export const USDT0 = {
  address: '0x779ded0c9e1022225f8e0630b35a9b54be713736' as Address,
  symbol: 'USD₮0',
  decimals: 6,
};

/**
 * Every tokenised equity with a USDG pool on X Layer — all 30, enumerated from
 * GeckoTerminal and spot-checked on-chain 2026-08-11 (docs/01-xlayer-reality.md).
 *
 * This is the **investable** universe: what the chain will let you trade. It is
 * deliberately not the same list as `ASSETS` in src/fairvalue.ts, which is what
 * the oracle can defend a fair value for and is smaller by design — a verified
 * reference market is hand-made work, and publishing a number without one is the
 * exact failure this system exists to prevent.
 *
 * Conflating the two produced a refusal that was factually false: a thesis about
 * Apple was told "no matching asset" while wAAPLx traded in a $197k pool. Now it
 * maps, gets sized against its real depth, and is refused at the guard for the
 * true reason — no reference market we can defend yet. See D33.
 *
 * Addresses only. Symbols are read from the chain by `loadToken`, so this list
 * cannot drift out of agreement with what is actually deployed.
 */
export const XSTOCKS: Address[] = [
  '0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f', // wAAPLx  — Apple
  '0xee7ccb0d37a12862e7f92f6c92a93d9c2d304266', // wAMDx   — AMD
  '0x910cabde3eba7fc1ce64fd14bd680b9f60fa0f90', // wAMZNx  — Amazon
  '0x9147b03c16b18fc4f686f610f189f91ddf4347b4', // wASMLx  — ASML
  '0xe89572bfe500ac7e8ecd8dc8119d274214e06f14', // wAVGOx  — Broadcom
  '0x44c7ed7ffdf8465c9d27f60aec845eed3d49d56e', // wCOINx  — Coinbase
  '0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8', // wCRCLx  — Circle          (modelled)
  '0x04db4384013664baa627c1a3fa4ff0c50f37cfd3', // wDELLx  — Dell
  '0x021b40617982074748c81a19d22046cc2548c3be', // wEWYx   — MSCI Korea ETF
  '0x735f1509bff25e27cd442b9bfb231324648ead9b', // wGLDx   — Gold (commodity)
  '0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f', // wGOOGLx — Alphabet
  '0x59801175a9b2248f9bf4ba7f82e17045c4672ec8', // wHOODx  — Robinhood
  '0xbf69d85055642a9c6450bdfde3c49baac50f8286', // wIBMx   — IBM
  '0x33aa35b0271fffe2048cc093ab7fe60931786719', // wINTCx  — Intel           (modelled)
  '0x25d218f19b706c8680aa26fb64e676cf84b58f65', // wIWMx   — Russell 2000 ETF
  '0xe840946ffebcd66b7c4e95095effafadfa0d0e56', // wMETAx  — Meta
  '0xb4ee60b6b817ca7386422ef1a0f45eaddea13275', // wMRVLx  — Marvell
  '0x166fbe68274b6a47e025f4ba17388c539f1fa1d0', // wMSFTx  — Microsoft
  '0x30987adf0b11dc698438a99ba04ec3a1ab2c7eab', // wMSTRx  — MicroStrategy
  '0xe2047ee3bddb5c99ae428ab83df63f8730698e30', // wMUx    — Micron          (modelled)
  '0xa8ddb5cd96b5222afe198316e9a57caa642850d5', // wNVDAx  — NVIDIA          (modelled)
  '0x1349456830ddc3d8599e4d6a63698883eca67ada', // wORCLx  — Oracle
  '0x4a2df09536f62341c9f946427d16414c04e21342', // wPLTRx  — Palantir
  '0x4c1ae29c159838fc1b224636e28e086eb69101f7', // wQQQx   — Nasdaq 100 ETF
  '0x6215a58ed045d71f2561aaabe54f4c885c522998', // wSKHYx  — SK Hynix        (modelled)
  '0x75e82e2884ea10f72fca777449b73377f4646219', // wSNDKx  — SanDisk         (modelled)
  '0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072', // wSPCXx  — SpaceX, private (modelled)
  '0xe7e553cd128f0011777323a0b44a7b96ea1cb540', // wSPYx   — S&P 500 ETF     (modelled)
  '0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171', // wTSLAx  — Tesla
  '0x27d62249488fc66ecbb92c8da3f56f700b8e8501', // wTSMx   — TSMC
];

/** Fee tiers to probe when discovering pools. */
export const FEE_TIERS = [100, 500, 3000, 10000] as const;

export const TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};
