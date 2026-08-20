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
Universal Router     0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af   ⛔ CANNOT SWAP — see D35
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

Measured **2026-08-20**, and the `*` marks here mean something new: the cell is the USDG
pool's **depth**, reached before the impact limit was, so it is not an impact measurement and a
wider limit will not move it (D103). Only **17 of the 30** had a USDG pool with in-range
liquidity that day; the other 13 quoted nothing at all.

```
asset       spot           0.50%     1.00%     2.00%     5.00%
wAAPLx        317.76       2,166     3,572     6,116    13,445
wAMDx         471.40         786     1,651     3,379     8,564
wCOINx        164.96       1,136     2,384     4,881    12,371
wCRCLx         80.60         878     1,844     3,774     9,566
wEWYx         174.01           0*        0*        0*        0*
wGOOGLx       346.09         463       532       630       846
wIBMx         242.19         817     1,715     3,510     8,896
wMETAx        552.43       1,037     2,176     4,454    11,289
wMSFTx        487.03       1,060     2,226     4,557    11,549
wMSTRx        107.58         859     1,804     3,693     9,360
wMUx          949.04         817     1,714     3,510     8,895
wNVDAx        219.11       6,625    10,750    16,481    29,791
wSKHYx        161.93         810     1,700     3,480     8,819
wSNDKx       1596.31         846     1,777     3,637     9,218
wSPCXx        139.21         828     1,739     3,560     9,022
wSPYx         773.97       3,865     8,112    16,606    42,084
wTSLAx        350.28      14,761    21,911    24,693*   24,693*
wAMZNx wASMLx wAVGOx wDELLx wGLDx wHOODx wINTCx wIWMx
wMRVLx wORCLx wPLTRx wQQQx wTSMx                        no USDG pool
TOTAL                     37,756    65,607   106,961   218,412
```

**The shape inverted in nine days.** On 2026-08-11 gold was the outlier by an order of magnitude
($10,752 at 0.5%) and a typical equity wrapper sat near $1,000. Today `wGLDx`'s USDG pool holds
**$39**, `wQQQx` and `wIWMx` quote nothing, and `wTSLAx` alone carries 39% of the universe's
absorbable size. Depth is not uniform, it is not stable, and it is not TVL, which is the whole
argument for measuring absorbable size rather than reading a dashboard.

**The entire tokenised-equity universe on X Layer absorbed $37,756 at 0.5% impact on
2026-08-20**, and $218,412 at 5%. Write it with the date: this is a reading of the pools on a
given day, not a property of the market. It was $97,329 and $759,633 on 2026-08-15, ~$48k and
~$515k on the 11th, and ~$11k before that — the last one a real number describing only the eight
assets the oracle prices, reported as though it covered all thirty. **The reading does not only
go up.** D49's arbitrage-deepens-the-pools argument was written when it had doubled twice; it has
now more than halved, and the honest form of the claim is that these pools move fast in both
directions. See D84 for the 15 August measurement, D103 for what the number does and does not
cover, D34 for the earliest correction.

Two limits on the number itself, both live: it counts the **USDG pool only** (`wTSLAx` also
trades against USDC in a pool with twice the depth, uncounted), and only **in-range** liquidity.
It is a floor, and it is measured; it is not the chain's ceiling.

None of the movement changes the conclusion: an AUM product still has nowhere to put money. See
`02-product.md`.

Depth is concentrated. `wGOOGLx` alone absorbs $29,653 at 0.5% — nearly a third of the universe —
while the tail sits at $800–1,200. An average is the wrong summary of this table.

## Chain economics

Re-measured 2026-08-11 by parsing `https://api.llama.fi/protocols` and `/v2/chains` with `jq`
— not by reading a summary of them, which is how D2 happened.

- **Total TVL $116,395,074.** For scale: Base $4.68B, Arbitrum $1.2B, Linea $28M.
- Lending is **Aave V3 ($81.8M)**, *not* Morpho. Morpho's own API does not list chain 196.
  Aave reserves: USDT0 $42M, XBTC $16.5M, OKB $15.3M, XETH $9.9M, USDG $0.44M, XSOL $0.1M.
- DEXs: **Uniswap V3 $22.9M** (was $17.5M — the pools are growing), Gate $6.8M, PotatoSwap
  $5.3M, Curve $2.7M, then a long tail.
- **56 protocols in total**, by category: 26 Dexs, 10 bridge (incl. cross-chain and
  aggregator), 6 Lending, 3 Derivatives, 3 Launchpad, 3 Liquidity Manager, 2 Yield, 1 CEX,
  1 CeDeFi, 1 Onchain Capital Allocator.
- **Zero RWA-category protocols**, and zero in asset management, index or portfolio. Ondo is
  not deployed. The four things closest to an application layer are all dead here: Spark
  Liquidity Layer **$0**, DefiEdge **$133**, Steer **$81**, Gamma **$3** — and the last three
  manage Uniswap LP positions, not portfolios.
- **No live hedging venue.** Satori Perp **$0**, D8X **$0.0002**, Fufuture **$0**. This is
  load-bearing for `02-product.md`: a position taken here cannot be hedged on-chain here.
- Multi-chain deployments that arrived automatically and were never used: Dolomite **$746**,
  ZeroLend **$7,181**.
- There is real memecoin and launchpad activity (DOGSHIT, XDOG, 万事OK, Flap.sh, XLAUNCH).

## The venue above the pools — added 2026-08-11

The AMM pools are not the only place these assets trade, and this was not known when the
liquidity section above was written. It does not change any number in it. It changes what the
numbers *mean*.

**OKX `Unified Tokenized Stocks` is live**: 40+ tokenised US stocks and ETFs against USDT on a
shared order book that merges different issuers' versions of the same stock into one market,
"starting with xStocks", trading 24/7, with **deposits and withdrawals on X Layer and Solana**
— reportedly with no fees and no gas (that last part returned HTTP 403 and is unverified).
Custodial, and US and EU users are excluded.

Two consequences worth holding in mind:

1. **It is an AMM number, not a market number.** A retail buyer on X Layer has a
   deeper, cheaper, custodial route available. Our capacity figures remain exactly correct
   about what the *pools* absorb, which is what a non-custodial execution path must use. They
   are not a claim about total tradable size for these tickers.
2. **The pools deepen over time — this is now measured, not predicted.** Because X Layer
   deposits and withdrawals are open, arbitrage flows between order book and pool. That is good
   for users and erodes the premise the sizing half of the product rests on. Capacity doubled
   between 2026-08-11 and 2026-08-15 with no change on our side (D84). **Re-run `pnpm capacity`
   before quoting any capacity number anywhere**, and treat a rising one as the expected case
   rather than an anomaly.
3. **Depth is not volume, and only depth had ever been measured here.** The same pools traded
   $12,038,377 in 24h on 2026-08-15 — but 81% of it in two tickers, wAAPLx and wGOOGLx, which is
   the arbitrage of point 2 rather than flow a non-custodial router could serve. Quoting the
   total as an addressable market would repeat the mistake this section exists to prevent.

Separately, **xStocks now ships `xChange`**, their own *"multi-chain execution layer for
tokenized equity trading"*: 70+ tokenised stocks, liquidity via **0x RFQ straight to market
makers** rather than pools, 24/5, on Ethereum and Solana. **X Layer is not mentioned.** RFQ
depth is not bounded by pool depth, so if xChange lands here the capacity argument weakens
considerably while the gap-risk argument does not. Worth checking periodically; nothing to do
about it now. See D49.

## Tooling notes

- **DexScreener does not index X Layer at all.** GeckoTerminal does, as network `x-layer`.
- The public RPC throttles hard. Serialise reads, batch at ~12, retry with backoff.
- Expect to build your own indexer. That is itself an ecosystem contribution worth claiming.
