# Reckonz

**Non-custodial execution and risk tooling for tokenised equities on X Layer.**
You write the thesis; Reckonz maps it to what actually trades, sizes it against real
depth, and enforces the exits on chain.

[@reckonz_xyz](https://x.com/reckonz_xyz)

Two components of the product, both running against live X Layer mainnet (chain 196):

- **Execution Planner** — sizes and schedules trades using a full multi-tick Uniswap V3
  swap simulation, not the single-tick approximation that makes thin pools look deeper
  than they are.
- **FairValueOracle** — carries each equity's last official print forward using
  instruments that are still trading, publishes a band and a gap-risk score, and
  refuses to publish at all when it cannot defend a number.

The product is **non-custodial**: users hold their own assets. These components decide
what to buy, how large, when, and whether to execute at all — they never take deposits.

## Run

```bash
pnpm install
pnpm verify     # sanity-checks the ported Uniswap math against on-chain state
pnpm plan       # a thesis basket: naive execution vs planned
pnpm capacity   # how much every xStock can absorb, by impact limit
pnpm oracle     # fair value, gap risk, and the PolicyGuard decision per asset
```

`pnpm plan [totalUsdg] [maxImpactBps]` — defaults `250000 50`.

## What is here

| File | Role |
|---|---|
| `src/chain.ts` | X Layer client, verified addresses, RPC throttling |
| `src/v3math.ts` | Uniswap V3 core math in BigInt — TickMath, SqrtPriceMath, SwapMath, TickBitmap |
| `src/pool.ts` | Pool snapshot loader + exact-input multi-tick swap simulation |
| `src/planner.ts` | Routing, capacity search, slicing schedule, basket planning |
| `src/marketdata.ts` | Reference listings and 24/7 signals; gap statistics |
| `src/fairvalue.ts` | Fair-value engine — β estimation, confidence band, gap-risk score |
| `src/guard.ts` | Off-chain mirror of the on-chain execution check |
| `contracts/FairValueOracle.sol` | On-chain observations + `checkExecution` for PolicyGuard |
| `src/verify.ts` | Proves the math agrees with the chain before anything is built on it |
| `src/capacity.ts` | Capacity curve across the xStock universe |
| `src/demo.ts` | Naive vs planned basket execution |
| `src/oracle-demo.ts` | Fair value vs on-chain price, and the resulting allow/reject |

Pool state is prefetched into two multicalls, so the simulation is pure and
synchronous — `capacity()` runs 40 bisection steps × every fee tier without a
single network call.

## Notes that cost time to learn

- **The Uniswap V3 factory on X Layer is not at the canonical address.** It is
  `0x4b2ab38dbf28d31d467aa8993f6c2585981d6804`, resolved by reading `factory()` on a
  live pool. An SDK default fails silently here. Permit2, Multicall3 and the Universal
  Router *are* at their canonical addresses.
- **There are no Chainlink equity feeds on X Layer.** Any fair-value or NAV layer has
  to be built, not consumed.
- `TICK_RATIOS` in `v3math.ts` was derived numerically (`2^128 · 1.0001^(-2^(k-1))`),
  not copied — a shifted constant produces plausible-looking prices at small ticks and
  garbage above ~±10,000.
- The public RPC throttles hard. Reads are serialised and batched at 12.
- **There is no market-hours problem to ignore.** These tokens trade 24/7 while their
  reference markets are open ~32 hours a week. NQ/ES futures cover weeknights; nothing
  covers weekends. The band has to say so.
- **Do not scale daily volatility across calendar time** to size an overnight band. The
  asset does not move over a weekend. Sampling the security's own realised close-to-open
  jumps — weekend gaps separately from overnight ones — took ±19% bands down to ±5%.

## The finding

Absorbable USDG before price impact exceeds the limit, X Layer mainnet:

```
asset       spot         0.50%     1.00%     2.00%     5.00%
wSPYx         777.30     3,872     8,126    16,636    42,165
wNVDAx        223.11     2,089     4,710     7,813    15,557
wSPCXx        135.92       887     1,862     3,812     9,663
wCRCLx         67.02       840     1,763     3,609     9,147
wINTCx         97.29       838     1,759     3,601     9,128
wMUx          861.42       807     1,693     3,467     8,786
wSKHYx        134.81       800     1,678     3,436     8,708
wSNDKx       1192.82       834     1,750     3,582     9,080
TOTAL                   10,965    23,342    45,957   112,233
```

A five-leg semiconductor basket sized naively at $250k pays **~$71,000** in slippage —
28% of the basket. Sized to capacity it pays $28, and reports the $244k it refused to
force into the market.

Two consequences for the product:

1. **This cannot be an AUM business.** The entire tokenised-equity universe on X Layer
   absorbs ~$48k at 0.5% impact. Fees must come from execution quality, published
   theses, and the fair-value feed — not from assets gathered.
2. **Telling the user the truth is the product.** Every competing allocator will show a
   clean pie chart and hand the user a 28% haircut.

## The oracle, live

Monday pre-market, 64.7h since the last official US print:

```
asset     reference   state      stale   fair value   ±band    onchain    basis   gap
wSPYx     SPY         PRE        64.7h       772.99   0.24%     777.23    0.55%    27
wNVDAx    NVDA        PRE        64.7h       223.51   2.11%     223.65    0.06%    38
wINTCx    INTC        PRE        64.7h       101.27   4.35%      97.41   -3.82%    70
wSKHYx    000660.KS   CLOSED      6.2h   1413822.82   7.92%     135.04      —      56
wSPCXx    —           NO_REF        —       withheld     —       135.51      —     100
```

Three things this surfaces that a price feed would not:

- **wINTCx is quoted 3.8% below fair value on X Layer.** Actionable, and the reason its
  gap risk is 70.
- **wSKHYx's reference quotes in KRW and does not reconcile with the on-chain price.**
  The oracle marks it unpublishable rather than printing a −99.99% basis. Verifying what
  each wrapper actually references is a real, unsolved piece of work.
- **wSPCXx has no reference market at all.** SpaceX is private. The oracle withholds a
  value by design; private-market price discovery is a different product, not a
  parameter of this one.
