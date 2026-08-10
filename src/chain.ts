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
 * Seed set of tokenised equities verified on X Layer mainnet. The Universe
 * Mapper discovers the rest from the factory at runtime — this list only
 * bootstraps discovery so we never hard-code the investable universe.
 */
export const XSTOCK_SEEDS: Address[] = [
  '0xe7e553cd128f0011777323a0b44a7b96ea1cb540', // wSPYx  — Wrapped SP500 xStock
  '0xa8ddb5cd96b5222afe198316e9a57caa642850d5', // wNVDAx — Wrapped NVIDIA xStock
  '0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072', // wSPCXx — Wrapped SpaceX xStock
  '0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8', // wCRCLx
  '0x33aa35b0271fffe2048cc093ab7fe60931786719', // wINTCx
  '0xe2047ee3bddb5c99ae428ab83df63f8730698e30', // wMUx
  '0x6215a58ed045d71f2561aaabe54f4c885c522998', // wSKHYx
  '0x75e82e2884ea10f72fca777449b73377f4646219', // wSNDKx
];

/** Fee tiers to probe when discovering pools. */
export const FEE_TIERS = [100, 500, 3000, 10000] as const;

export const TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};
