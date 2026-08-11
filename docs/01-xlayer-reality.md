# X Layer — verified on-chain reality

Everything here was checked directly against `https://rpc.xlayer.tech` (chainId `0xc4`
= 196), the DefiLlama API parsed as JSON, and GeckoTerminal network `x-layer`, on
**2026-08-10**. Re-verify before relying on it.

> **Do not trust prose summaries of large JSON APIs for these facts.** An early WebFetch
> summary of DefiLlama's `/protocols` endpoint asserted "Morpho Blue on xLayer" and
> "Ondo on xLayer". Both are false. Parse the JSON or hit the RPC.

## Network

```
mainnet   chainId 196   https://rpc.xlayer.tech
testnet   chainId 1952  https://testrpc.xlayer.tech
gas       OKB
explorer  https://www.oklink.com/xlayer
```

## Infrastructure addresses (mainnet)

```
Uniswap V3 Factory   0x4b2ab38dbf28d31d467aa8993f6c2585981d6804   ← NOT the canonical address
Permit2              0x000000000022D473030F116dDEE9F6B43aC78BA3   ✅ canonical
Universal Router     0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af   ✅ canonical
Multicall3           0xcA11bde05977b3631167028862bE2a173976CA11   ✅ canonical
Aave V3 Pool         0xE3F3Caefdd7180F884c01E57f65Df979Af84f116
```

The factory being off-canonical is the single most expensive gotcha here — SDK defaults
fail **silently**, returning zero addresses rather than erroring.

There are **no Chainlink equity price feeds on X Layer**. Any fair-value layer must be
built, not consumed. That is a moat, not a blocker.

## Assets

```
USDG    0x4ae46a509f6b1d9056937ba4500cb143933d2dc8   6 dec   "Global Dollar"  ← xStocks settle in this
USD₮0   0x779ded0c9e1022225f8e0630b35a9b54be713736   6 dec   ~$113M supply
```

### Tokenised equities (xStocks) — live on mainnet

Verified by reading `name()` on-chain:

```
wSPYx    0xe7e553cd128f0011777323a0b44a7b96ea1cb540   "Wrapped SP500 xStock"
wNVDAx   0xa8ddb5cd96b5222afe198316e9a57caa642850d5   "Wrapped NVIDIA xStock"
wSPCXx   0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072   "Wrapped SpaceX xStock"
wCRCLx   0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8
wINTCx   0x33aa35b0271fffe2048cc093ab7fe60931786719
wMUx     0xe2047ee3bddb5c99ae428ab83df63f8730698e30
wSKHYx   0x6215a58ed045d71f2561aaabe54f4c885c522998
wSNDKx   0x75e82e2884ea10f72fca777449b73377f4646219
```

### The full universe — 30 xStocks, captured 2026-08-11

Enumerated from every USDG pool GeckoTerminal indexes on `x-layer`, then spot-checked on-chain
with `symbol()` / `name()`. **All 30 are investable; the oracle prices 8 of them** — the split is
deliberate and D33 explains it. `*` below marks the eight.

```
wAAPLx   0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f   Apple          197,507
wAMDx    0xee7ccb0d37a12862e7f92f6c92a93d9c2d304266   AMD            191,848
wAMZNx   0x910cabde3eba7fc1ce64fd14bd680b9f60fa0f90   Amazon         200,570
wASMLx   0x9147b03c16b18fc4f686f610f189f91ddf4347b4   ASML           201,130
wAVGOx   0xe89572bfe500ac7e8ecd8dc8119d274214e06f14   Broadcom       199,046
wCOINx   0x44c7ed7ffdf8465c9d27f60aec845eed3d49d56e   Coinbase       200,772
wCRCLx   0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8   Circle         203,725  *
wDELLx   0x04db4384013664baa627c1a3fa4ff0c50f37cfd3   Dell           218,131
wEWYx    0x021b40617982074748c81a19d22046cc2548c3be   MSCI Korea ETF 215,469
wGLDx    0x735f1509bff25e27cd442b9bfb231324648ead9b   Gold           406,053   (commodity)
wGOOGLx  0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f   Alphabet       198,231
wHOODx   0x59801175a9b2248f9bf4ba7f82e17045c4672ec8   Robinhood      198,291
wIBMx    0xbf69d85055642a9c6450bdfde3c49baac50f8286   IBM            197,676
wINTCx   0x33aa35b0271fffe2048cc093ab7fe60931786719   Intel          204,391  *
wIWMx    0x25d218f19b706c8680aa26fb64e676cf84b58f65   Russell 2000   469,455   (ETF)
wMETAx   0xe840946ffebcd66b7c4e95095effafadfa0d0e56   Meta           200,307
wMRVLx   0xb4ee60b6b817ca7386422ef1a0f45eaddea13275   Marvell        198,318
wMSFTx   0x166fbe68274b6a47e025f4ba17388c539f1fa1d0   Microsoft      201,359
wMSTRx   0x30987adf0b11dc698438a99ba04ec3a1ab2c7eab   MicroStrategy  198,200
wMUx     0xe2047ee3bddb5c99ae428ab83df63f8730698e30   Micron         198,200  *
wNVDAx   0xa8ddb5cd96b5222afe198316e9a57caa642850d5   NVIDIA         214,178  *
wORCLx   0x1349456830ddc3d8599e4d6a63698883eca67ada   Oracle         205,694
wPLTRx   0x4a2df09536f62341c9f946427d16414c04e21342   Palantir       210,634
wQQQx    0x4c1ae29c159838fc1b224636e28e086eb69101f7   Nasdaq 100     499,989   (ETF)
wSKHYx   0x6215a58ed045d71f2561aaabe54f4c885c522998   SK Hynix       195,625  *
wSNDKx   0x75e82e2884ea10f72fca777449b73377f4646219   SanDisk        208,799  *
wSPCXx   0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072   SpaceX         213,566  * (private)
wSPYx    0xe7e553cd128f0011777323a0b44a7b96ea1cb540   S&P 500        498,899  * (ETF)
wTSLAx   0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171   Tesla          208,509
wTSMx    0x27d62249488fc66ecbb92c8da3f56f700b8e8501   TSMC           209,725
```

`*` = the 8 currently in `XSTOCK_SEEDS` and `ASSETS`. All quote against USDG on the 0.05% tier.
TVL is remarkably uniform at ~$200k, except the index products (wSPYx, wQQQx, wIWMx) and gold at
~$400–500k — a deliberate seeding, not organic liquidity.

Note the universe is broader than "US tech equities": it includes an ETF on Korea (wEWYx), the
Russell 2000, and a commodity (wGLDx). Any claim that this is only the AI/semiconductor trade is
now out of date.

All quoted against **USDG** on Uniswap V3, mostly the 0.05% tier, ~$200k TVL each
(~$500k for the index ETFs wSPYx / wQQQx).

The listing is not random: it is the **AI/semiconductor trade** plus the **crypto-equity
trade**, plus SpaceX. That is a thesis someone at OKX chose.

## Liquidity — the number that governs the product

TVL is misleading here; the liquidity is spread wide, not concentrated at price. What
matters is absorbable size, measured by simulating swaps against live pool state
(`pnpm capacity`):

All 30, measured 2026-08-11. `*` marks the eight with a verified reference market in
`ASSETS` — the ones the oracle can price. The other 22 trade, and are refused at the
guard for a reason that is true (D33).

```
asset       spot           0.50%     1.00%     2.00%     5.00%
wAAPLx        309.77       1,069     2,243     4,592    11,638
wAMDx         472.15         787     1,651     3,380     8,566
wAMZNx        277.45       1,081     2,269     4,646    11,775
wASMLx       1749.54       1,078     2,263     4,633    11,743
wAVGOx        425.26       1,072     2,251     4,608    11,678
wCOINx        149.34       1,081     2,269     4,644    11,771
wCRCLx  *      66.98         840     1,762     3,608     9,144
wDELLx        461.57         892     1,873     3,834     9,718
wEWYx         165.37         891     1,870     3,828     9,702
wGLDx         405.44      10,752    22,569    46,201   115,189
wGOOGLx       357.72       1,072     2,251     4,608    11,678
wHOODx         94.87         819     1,718     3,517     8,914
wIBMx         241.12         815     1,710     3,501     8,873
wINTCx  *      98.52         843     1,770     3,624     9,186
wIWMx         301.39       3,645     7,651    15,664    39,700
wMETAx        596.75       1,077     2,261     4,628    11,731
wMRVLx        211.15         812     1,704     3,488     8,839
wMSFTx        508.46       1,083     2,274     4,655    11,798
wMSTRx         97.52         818     1,718     3,516     8,911
wMUx    *     871.33         811     1,703     3,486     8,837
wNVDAx  *     219.17       2,223     4,062     7,149    14,864
wORCLx        152.27       1,108     2,326     4,761    12,066
wPLTRx        173.18       1,125     2,361     4,834    12,253
wQQQx         723.83       3,885     8,155    16,696    42,316
wSKHYx  *     137.10         806     1,692     3,465     8,781
wSNDKx  *    1253.22         855     1,794     3,672     9,307
wSPCXx  *     136.66         890     1,868     3,825     9,694
wSPYx   *     777.17       3,871     8,126    16,635    42,161
wTSLAx        331.50       1,128     2,367     4,846    12,282
wTSMx         422.81       1,122     2,356     4,823    12,223
TOTAL                     48,353   100,887   205,365   515,340
```

Gold is the outlier by an order of magnitude — $10.7k at 0.5% against ~$1k for a typical
equity wrapper — and the index ETFs (wSPYx, wQQQx, wIWMx) sit between. Depth is not
uniform even though TVL nearly is, which is the whole argument for measuring absorbable
size rather than reading TVL off a dashboard.

**The entire tokenised-equity universe on X Layer absorbs ~$48k at 0.5% impact**, and
~$515k at 5%. Re-measured 2026-08-11 across all 30 assets; the table above covers the
eight the oracle prices, which is where the earlier ~$11k figure came from — a real number
described as something it was not. The correction is 4.4×, and it changes nothing about
the conclusion: an AUM product still has nowhere to put money. See `02-product.md` and D34.

## Chain economics

- **Total TVL ~$113M.** For scale: Base $4.68B, Arbitrum $1.2B, Linea $28M.
- Lending is **Aave V3 (~$84M)**, *not* Morpho. Morpho's own API does not list chain 196.
  Aave reserves: USDT0 $42M, XBTC $16.5M, OKB $15.3M, XETH $9.9M, USDG $0.44M, XSOL $0.1M.
- DEXs: Uniswap V3 $17.5M, PotatoSwap $5.2M, Curve $2.7M, then a long tail.
- **Zero RWA-category protocols** per DefiLlama. Ondo is not deployed. Spark Savings and
  Spark Liquidity Layer list X Layer but hold $0.
- There is real memecoin and launchpad activity (DOGSHIT, XDOG, 万事OK, Flap.sh, XLAUNCH).

## Tooling notes

- **DexScreener does not index X Layer at all.** GeckoTerminal does, as network `x-layer`.
- The public RPC throttles hard. Serialise reads, batch at ~12, retry with backoff.
- Expect to build your own indexer. That is itself an ecosystem contribution worth claiming.
