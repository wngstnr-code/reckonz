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
| `PolicyGuard` | [`0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be`](https://repo.sourcify.dev/196/0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be) |
| `Executor` | [`0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2`](https://repo.sourcify.dev/196/0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2) |
| `FeeCollector` | [`0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0`](https://repo.sourcify.dev/196/0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0) |
| `ThesisRegistry` | [`0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E`](https://repo.sourcify.dev/196/0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E) |

The oracle, guard and executor were replaced on 2026-08-11 to add a publish-time bound; the
registries were kept, so the fills below are in the same append-only history they were written to.
Admin of the oracle, the registry and the fee collector is a **2-of-3 Safe**
([`0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e`](https://www.oklink.com/xlayer/address/0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e));
publishing is a separate key that can do nothing else.

Settlement is real USDG, `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`. A testnet stack
(chain 1952) is deployed and verified too; addresses in `src/deployments.ts`.

**Sixteen real fills, not a simulation — including sales, one placed from a browser, and five bound
to the evidence they rest on:**

```
#0  0x7240759d327d468f9a7086ed439abf42dead17887105d986ca0870ebf46d6545   0.5 USDG -> wSPYx
#1  0x5710894e80baddfb35ab12321642b16c8cc8ab0b8f9a90a837f7c1e3ee9d1a23   0.5 USDG -> wSPYx, 15 bps fee
#2  0x300870192316392ff062c4f890ab1cb616a1e5e5e2ce2b43aebb3f8df2b27af5   carries thesis 0xc3cd487e…
#3  0xc9eba0cb05da5f00d71a63486d696a90bddc4a4f7ca3ddaab6b1acdb158f74f8   0.5 USDG -> wTSLAx, 7 bps
#4  0x769edd3bb8e2765f7cc4c46cf69f7894d51a9e7bff1dcf58234c421a92d10b0a   wSPYx -> 0.1004 USDG, isExit
#5  0x7e680f64844532819e9687b4cbe5b2a102811c66b8f9d56157a243b8c61b4ecf   thesis #1, wQQQx, 39 bps
#6  0xca141f6d9803992376eab5dd0ac74e97d0aaa4a0a5bee6218ee4ae5b29830cf9   thesis #1, wNVDAx, 28 bps
#7  0x04685035a0251848d4c0580b30e4c5569236eaeaa62f42023615cfccada00933   thesis #2, wTSLAx, 0 bps
#8  0xdf2d5564292d50623054ed8d0bb59093a84ce522f58ac60d67cfe8303666842a   thesis #2, wNVDAx, 27 bps
#9–#13                                                                 five exits, priced by the issuer
#14 0xfbcdb2282d862941c0b386faa725e01f17957d557349e79a8da4fac310f0c552   0.6 USDG -> wTSLAx
#15 0xcdb607a89c8ccc3a4999257b2f547dc962c19f540644f6624937386b0d25bbc5   0.5 USDG -> wSPYx, from a browser
```

`#15` is the one to look at. It was placed from the web app against the OKX extension — the server
quoted it, read the oracle and asked the guard, and the **wallet** produced the Permit2 signature and
sent the transaction. It settled at 776.8877 against a fair value of 776.9450: **0 bps of shortfall**,
gap risk 4. It carries thesis #0's hash, so it lands in that thesis's public track record, which is
the loop this project exists to close.

`#5`–`#8` and `#15` each carry an `evidenceHash`: the quote, the oracle's value *and its age in seconds*,
and the guard's verdict, hashed before signing and checkable with `pnpm evidence`. A fifth fill was
attempted and **refused** — wSPYx quoted 59 bps above fair value against a 50 bps ceiling, so the
guard rejected it in `dryRun` and no gas was spent. That refusal is the product working, and it is
why thesis #1's basket holds two of the three assets it names.

`#0`–`#2` ran through the previous guard and executor; `#3` is the first through the guard listed
above. `#4` is the first **exit** — the executor was redeployed on 2026-08-12 because until then it
could only ever buy (D51). All sixteen are in one append-only history, because every migration
replaced contracts around the registry and **kept the registry**.

In each, the swap, the policy check and the receipt happen in **one transaction**. The
executor holds nothing when it returns, and asserts that rather than assuming it.

## What makes it defensible

**The AI never holds a key that can move funds.** The agent supplies routing and nothing
else. `PolicyGuard.validateAndRecord` runs last, inside the trade's own transaction — if
the mandate is violated it reverts, and the Permit2 pull and every swap revert with it.
There is no state in which a rule was broken and the trade stood. Off-chain checks are
decoration; this is the enforcement.

Bounding an agent's key is common by now — session keys, spend ceilings, destination
whitelists. Those bound **where funds may go and how much**. This one also bounds on
**whether the price can be defended and whether the depth is actually there**, which is the
part nothing else checks.

**The receipt cannot be authored by the agent.** Execution price is derived from measured
balance deltas; fair value and gap risk are stamped by the guard from the oracle. Receipt
`#1` records 0.49925 USDG traded at 777.49 with 44 bps of shortfall — numbers the agent
never touched.

**The oracle is a guard, not a price.** It carries each equity's last official print
forward using instruments still trading, publishes a band and a gap-risk score, and
**refuses to publish at all** when it cannot defend a number. It prices **30 of the 30**
xStocks on X Layer, and which 30 is not a judgement call: a test reconciles each wrapper's
on-chain price against the mark its **issuer** publishes for that token, and admits the
mapping only if they agree.

It priced 28 until 2026-08-12, when the reference moved from exchange listings to the issuer
(D62). The two it used to refuse are the reason that change was right rather than merely
convenient: wSKHYx traded 86% below an SK Hynix share because it tracks a **US depositary
receipt**, not the Seoul ordinary — the issuer had published that identifier all along — and
SpaceX is private, so no exchange can price it while the party minting the token marks it
every day.

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
pnpm track-record            # every published thesis and what it actually did
pnpm index [--verify]        # keep the registry index current; --verify re-reads it from the chain
pnpm evidence <hash>         # re-derive a receipt's evidence bundle and compare
pnpm test:sol                # 106 tests
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
| `src/fairvalue.ts` | Fair-value engine — issuer mark × shares per token, band, gap-risk score |
| `src/issuer.ts` | The issuer's own view: quote, per-session spread, corporate-action multiplier |
| `src/guard.ts` | Off-chain mirror of the on-chain execution check |
| `src/thesis.ts` | Thesis Compiler — schema, prompts, mandate compilation |
| `src/pipeline.ts` | The whole product as one streamed run; shared by CLI and web |
| `src/abi.ts` | The contract surface, one source, browser-safe |
| `src/permit.ts` | The Permit2 authorisation, browser-safe so a wallet can produce one |
| `src/fill.ts` | Quote, pool check, oracle read, `dryRun` and evidence — everything before a signature |
| `src/track-record.ts` | The registry join: a thesis, and what executed against it |
| `src/indexer.ts` | The registries read once and kept, so a page load is not an enumeration |
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
  no sense. Poll until the state is visible. In a browser this bites twice: `viem`'s
  `waitForTransactionReceipt` never returned through the injected provider either, so the
  page polls for the receipt itself.
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
measured against live state on 2026-08-11.

```
asset       spot           0.50%     1.00%     2.00%     5.00%
wGLDx         405.44      10,752    22,569    46,201   115,189
wQQQx         723.83       3,885     8,155    16,696    42,316
wSPYx         777.17       3,871     8,126    16,635    42,161
wIWMx         301.39       3,645     7,651    15,664    39,700
wNVDAx        219.17       2,223     4,062     7,149    14,864
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
guard     wSKHYx ALLOW                                  ← resolved: it tracks a US DR, not the Seoul share (D62)
```

The third is worth dwelling on, because it was wrong for a day and the wrongness is the point.
`wSKHYx` was refused at −86% against the Seoul listing, and the oracle marked it unpublishable
rather than printing a basis it could not defend. That refusal was correct. The *reason* was
not: the token tracks a US depositary receipt, and the ~7× gap was a DR ratio rather than a
broken pool. Referencing the issuer found in one query what no amount of care with the
exchange mapping would have found, because the exchange mapping was the thing that was wrong.

All 30 are now priced, each admitted by a reconciliation rather than by a judgement that the
ticker looked obvious. `wSPCXx` is priced and carries a caveat no other asset does: SpaceX is
private, so the issuer's mark is the **only** opinion in existence and nothing can falsify it.
A thesis about Apple maps to wAAPLx, is sized against its real depth, and — where it is
refused — is refused for the true reason rather than the false claim that the asset does not
exist.
