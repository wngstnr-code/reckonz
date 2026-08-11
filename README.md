# Reckonz

**Non-custodial execution and risk tooling for tokenised equities on X Layer.**
You write the thesis; Reckonz maps it to what actually trades, sizes it against real
depth, and enforces the exits on chain.

[reckonz.vercel.app](https://reckonz.vercel.app) · [@reckonz_xyz](https://x.com/reckonz_xyz)

Most financial products sell *"you can"*. This one sells *"you cannot, and here is the
number"*. A $250,000 thesis meets a market that can absorb $2,191 of it, and the system
says so instead of forcing the rest through at a 28% haircut.

## Live on X Layer mainnet (chain 196)

Every contract below is verified on Sourcify — `exact_match` on creation and runtime
bytecode.

| Contract | Address |
|---|---|
| `FairValueOracle` | [`0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09`](https://repo.sourcify.dev/196/0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09) |
| `ReceiptRegistry` | [`0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6`](https://repo.sourcify.dev/196/0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6) |
| `PolicyGuard` | [`0x3F58df45FcB5D1074bA5D046D4928CF5efde5f4d`](https://repo.sourcify.dev/196/0x3F58df45FcB5D1074bA5D046D4928CF5efde5f4d) |
| `Executor` | [`0xf3a06c9f0F1AABf01080475E420DD7A1092E1e1B`](https://repo.sourcify.dev/196/0xf3a06c9f0F1AABf01080475E420DD7A1092E1e1B) |
| `FeeCollector` | [`0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0`](https://repo.sourcify.dev/196/0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0) |
| `ThesisRegistry` | [`0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E`](https://repo.sourcify.dev/196/0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E) |

The oracle, guard and executor were replaced on 2026-08-11 to add a publish-time bound; the
registries were kept, so the fills below are in the same append-only history they were written to.
Admin of the oracle, the registry and the fee collector is a **2-of-3 Safe**
([`0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e`](https://www.oklink.com/xlayer/address/0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e));
publishing is a separate key that can do nothing else.

Settlement is real USDG, `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`. A testnet stack
(chain 1952) is deployed and verified too; addresses in `src/deployments.ts`.

**Four real fills, not a simulation:**

```
#0  0x7240759d327d468f9a7086ed439abf42dead17887105d986ca0870ebf46d6545   0.5 USDG -> wSPYx
#1  0x5710894e80baddfb35ab12321642b16c8cc8ab0b8f9a90a837f7c1e3ee9d1a23   0.5 USDG -> wSPYx, 15 bps fee
#2  0x300870192316392ff062c4f890ab1cb616a1e5e5e2ce2b43aebb3f8df2b27af5   carries thesis 0xc3cd487e…
#3  0xc9eba0cb05da5f00d71a63486d696a90bddc4a4f7ca3ddaab6b1acdb158f74f8   0.5 USDG -> wTSLAx, 7 bps
```

`#0`–`#2` ran through the previous guard and executor; `#3` is the first through the contracts
listed above. All four are in one append-only history, because the migration replaced the oracle,
guard and executor and **kept the registry**.

In each, the swap, the policy check and the receipt happen in **one transaction**. The
executor holds nothing when it returns, and asserts that rather than assuming it.

## What makes it defensible

**The AI never holds a key that can move funds.** The agent supplies routing and nothing
else. `PolicyGuard.validateAndRecord` runs last, inside the trade's own transaction — if
the mandate is violated it reverts, and the Permit2 pull and every swap revert with it.
There is no state in which a rule was broken and the trade stood. Off-chain checks are
decoration; this is the enforcement.

**The receipt cannot be authored by the agent.** Execution price is derived from measured
balance deltas; fair value and gap risk are stamped by the guard from the oracle. Receipt
`#1` records 0.49925 USDG traded at 777.49 with 44 bps of shortfall — numbers the agent
never touched.

**The oracle is a guard, not a price.** It carries each equity's last official print
forward using instruments still trading, publishes a band and a gap-risk score, and
**refuses to publish at all** when it cannot defend a number. It prices **28 of the 30**
xStocks on X Layer, and which 28 is not a judgement call: a test reconciles each wrapper's
on-chain price against the listing it claims to track, and admits the mapping only if they
agree. The two it refuses are refused with a number — wSKHYx trades 86% below an SK Hynix
share, and SpaceX is private.

**Funds are pulled per execution** against a signed, amount-bounded, expiring Permit2
authorisation — never a standing allowance.

## Run

```bash
pnpm install
pnpm dev                     # the web app — thesis in, guard verdict out
pnpm verify                  # ported Uniswap math vs live on-chain state
pnpm verify:abi              # src/abi.ts vs the compiled contracts, selector by selector
pnpm plan [usdg] [maxBps]    # a thesis basket: naive execution vs planned
pnpm capacity                # what every xStock can absorb, by impact limit
pnpm oracle [usdg]           # fair value, gap risk, and the guard's decision per asset
pnpm thesis "free text"      # thesis -> assets -> sizing -> mandate
pnpm test:sol                # 89 tests
```

On-chain writes take their chain from `TARGET` (`testnet` by default), so nothing can
write to the wrong one:

```bash
TARGET=mainnet pnpm oracle:publish     # run the oracle engine, publish, read back
TARGET=mainnet pnpm mandate            # create a mandate, install triggers, watch one fire
TARGET=mainnet pnpm execute wSPYx 0.5  # quote -> dryRun -> Permit2 -> one real fill
```

## What is here

| File | Role |
|---|---|
| `src/v3math.ts` | Uniswap V3 core math in BigInt — TickMath, SqrtPriceMath, SwapMath, TickBitmap |
| `src/pool.ts` | Pool snapshot loader + exact-input multi-tick swap simulation |
| `src/planner.ts` | Routing, capacity search, slicing schedule, basket planning |
| `src/fairvalue.ts` | Fair-value engine — β estimation, confidence band, gap-risk score |
| `src/guard.ts` | Off-chain mirror of the on-chain execution check |
| `src/thesis.ts` | Thesis Compiler — schema, prompts, mandate compilation |
| `src/pipeline.ts` | The whole product as one streamed run; shared by CLI and web |
| `src/abi.ts` | The contract surface, one source, browser-safe |
| `contracts/PolicyGuard.sol` | Mandate, policy, exit triggers, and the binding check |
| `contracts/FairValueOracle.sol` | On-chain observations + `checkExecution` |
| `contracts/Executor.sol` | Permit2 pull → swap → settle → submit, one transaction |
| `contracts/V3Swapper.sol` | Direct pool swaps; derives the pool rather than trusting a router |
| `contracts/ReceiptRegistry.sol` | Append-only execution history |
| `contracts/FeeCollector.sol` | 15 bps on notional, ceiling fixed in code at 50 |
| `app/` | Next.js front end; renders `src/pipeline.ts` and computes nothing |

Pool state is prefetched into two multicalls, so the simulation is pure and synchronous —
`capacity()` runs its bisection across every fee tier without a single network call.

## Notes that cost time to learn

- **The Uniswap V3 factory on X Layer is not at the canonical address.** It is
  `0x4b2ab38dbf28d31d467aa8993f6c2585981d6804`, resolved by reading `factory()` on a live
  pool. An SDK default fails silently here.
- **The Universal Router on X Layer cannot execute a V3 swap at all.** It carries the
  *canonical* factory in its own bytecode, so it derives pool addresses that have no code
  and reverts with no data. Deployed, correctly shaped, and useless — which is why
  `Executor` derives the pool itself. Checking a codesize and a selector proved nothing.
- **A confirmed write is not immediately readable.** The public RPC load-balances, so a
  read straight after a write can hit an unsynced node and return **zeroes, not an
  error** — and gas estimation for a dependent transaction reverts for reasons that make
  no sense. Poll until the state is visible.
- **There are no Chainlink equity feeds on X Layer.** Any fair-value layer has to be
  built, not consumed.
- `TICK_RATIOS` in `v3math.ts` was derived numerically (`2^128 · 1.0001^(-2^(k-1))`), not
  copied — a shifted constant produces plausible-looking prices at small ticks and garbage
  above ~±10,000.
- **There is no market-hours problem to ignore.** These tokens trade 24/7 while their
  reference markets are open ~32 hours a week. NQ/ES futures cover weeknights; nothing
  covers weekends. The band has to say so.
- **Do not scale daily volatility across calendar time** to size an overnight band. The
  asset does not move over a weekend. Sampling the security's own realised close-to-open
  jumps — weekend gaps separately from overnight ones — took ±19% bands down to ±5%.

## The finding

Absorbable USDG before price impact exceeds the limit. All 30 xStocks with a USDG pool,
measured against live state; `*` marks the eight the oracle can price.

```
asset       spot           0.50%     1.00%     2.00%     5.00%
wGLDx         405.44      10,752    22,569    46,201   115,189
wQQQx         723.83       3,885     8,155    16,696    42,316
wSPYx   *     777.17       3,871     8,126    16,635    42,161
wIWMx         301.39       3,645     7,651    15,664    39,700
wNVDAx  *     219.17       2,223     4,062     7,149    14,864
…24 more, each ~800–1,100 at 0.5%
TOTAL                     48,353   100,887   205,365   515,340
```

**The whole tokenised-equity universe on X Layer absorbs ~$48k at 0.5% impact.** Depth is
not uniform even though TVL nearly is, which is the argument for measuring absorbable size
rather than reading TVL off a dashboard. Full table in `docs/01-xlayer-reality.md`.

A five-leg semiconductor basket sized naively at $250k pays **~$70,500** in slippage — 28%
of the basket. Sized to capacity it pays $28, and reports the $244k it refused to force
into the market.

Two consequences:

1. **This cannot be an AUM business.** Fees come from execution quality, published theses,
   and the fair-value feed — not from assets gathered.
2. **Telling the user the truth is the product.** Every competing allocator will show a
   clean pie chart and hand the user a 28% haircut.

## The refusals

The three moments that make the case, from one run of the web app:

```
allocate  Samsung -> unmapped, "no matching asset"      ← it will not substitute an adjacent name
capacity  $250,000 asked -> $2,191 executable           ← and it hands back the $247,809
guard     wSKHYx REJECT NO_REFERENCE                    ← KRW basis will not reconcile; value withheld
```

The third is worth dwelling on. `wSKHYx`'s reference quotes in KRW and does not reconcile
with the on-chain price, so the oracle marks it unpublishable rather than printing a
−99.99% basis. `wSPCXx` has no reference market at all — SpaceX is private — and is
withheld by design. Twenty-two of the thirty xStocks trade but cannot yet be priced; a
thesis about Apple now maps to wAAPLx, is sized against its real depth, and is refused at
the guard for the true reason rather than the false claim that the asset does not exist.
