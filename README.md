# Reckonz

**Non-custodial execution and risk tooling for tokenised equities on X Layer.**

![tests](https://img.shields.io/badge/tests-322_passing-brightgreen) ![network](https://img.shields.io/badge/network-X_Layer_mainnet_196-blue) ![contracts](https://img.shields.io/badge/contracts-14_verified_on_Sourcify-1ba27a) ![receipts](https://img.shields.io/badge/onchain_receipts-18-orange)

> **"You cannot, and here is the number."**

Reckonz turns an investment thesis into on-chain positions in **tokenised real-world assets**
(xStocks: Apple, Nvidia, Tesla and 27 more, trading as ERC-20s on **X Layer**), sized to what the
market can actually absorb, and into the exit rules that close them. **Your funds never leave your
wallet, at any point.**

Built for the **X Layer "AI Season" hackathon (AI-RWA track)** by Team Indonesia.

[reckonz.xyz](https://reckonz.xyz) and [@reckonz_xyz](https://x.com/reckonz_xyz)

---

## The problem

Tokenised equities finally exist on-chain, and the tooling around them behaves as if the liquidity
does too. **The entire xStock universe on X Layer absorbs about $97,329 at 0.5% price impact**
(measured 2026-08-15; it was about $48,000 four days earlier). Every allocator built on top of it
will still show a clean pie chart, take the full amount, and hand the user the difference as
slippage.

The second problem is the one AI made worse. An agent that trades on your behalf is a key that can
move money, bounded at best by a session policy and a spend cap. Those bound *where funds may go and
how much*. Nothing bounds **whether the price can be defended and whether the depth is really
there**, which is the failure mode that actually costs money on a thin chain.

The third is that nobody can check afterwards. The system that executed the trade is usually the
same system that writes the report about it.

## The solution

Reckonz is a refusal engine with an executor attached. Four places it declines, each enforced rather
than advised:

1. **You write a thesis in plain language:** *"HBM memory supply stays tight for two more
   quarters."* The compiler turns it into a falsifiable claim: causal chain, beneficiaries, and the
   conditions you said would change your mind. Ask for Samsung and it answers **"no matching
   asset"**, instead of substituting an adjacent ticker.
2. **It sizes each leg against live Uniswap V3 depth**, not against the number you typed. Ask for
   $250,000 and it executes **$20,361**, hands back $229,639, and shows that executing the whole
   amount in one shot would have cost **$51,348** in slippage against **$102** for the part that
   fits. Measured 2026-08-16; re-run `pnpm plan 250000` before quoting it, because it moved 3x in
   the day before that with no change on our side.
3. **The oracle refuses to publish** a value it cannot defend, rather than guessing. A cross-check
   sits between the engine and the chain, and it *withholds, never corrects*.
4. **`PolicyGuard` reverts inside the trade's own transaction** when a bound breaks. There is no
   state in which a rule was violated and the trade stood.

Your exit conditions become triggers a contract enforces: the decision made while you are calm,
enforced when you are not. You sign once, with a Permit2 authorisation scoped to one token, a capped
amount and twenty minutes, and it executes.

## Key features

- **The AI never holds a key that can move funds.** The server quotes, reads the oracle and asks the
  guard, then hands back a plan that is **inert**. Only your signature activates it. There is no
  `proposeRebalance()` and never was.
- **Receipts the agent cannot author.** Execution price is derived from measured balance deltas;
  fair value and gap risk are stamped by the guard from the oracle. Receipt `#1` records 0.49925
  USDG at 777.49 with 44 bps of shortfall, numbers nothing off-chain touched.
- **Evidence hashes, published before signing.** The exact quote, the oracle's value *and its age in
  seconds*, and the guard's verdict, hashed before anything is signed, archived publicly, and
  re-derivable by anyone with `pnpm evidence <hash>`.
- **A guard that bounds on market conditions.** Bounding an agent's key is commodity by now.
  Bounding on *whether the price is defensible and the depth is there* is the part nothing else
  checks, and it runs last, in the same transaction as the swap.
- **An oracle that says "I don't know".** It carries each equity's last official print forward,
  publishes a band and a gap-risk score, and marks a value **unpublishable** rather than inventing
  one. It prices **30 of 30** xStocks, and which 30 is not a judgement call (see below).
- **Admission by reconciliation, not by opinion.** An asset enters the universe only when the
  wrapper's on-chain price reconciles against the mark **its own issuer** publishes for that token.
  Adding a line because the ticker looks obvious is the exact assertion this oracle refuses to make.
- **Exits are first-class.** Buying was a web page and selling was a terminal, which is the wrong
  asymmetry for risk tooling. Both are in the browser now, both through the same planner.
- **An unmeasured exit is never rendered as a perfect one.** With a stale oracle the contract
  computes shortfall zero, which is correct and *not* a measurement. It reports `slip unmeasured`,
  and selling in that state requires an explicit acknowledgement.
- **Owner kill switch, plus a 2-of-3 Safe.** Admin of the oracle, the receipt registry and the fee
  collector is a Safe; publishing is a separate hot key that can do nothing else.
- **A schema, not a prompt, bounds the model.** It may only name quantities the chain can measure. A
  condition nothing can measure is surfaced as a manual watch item rather than quietly becoming a
  rule that can never fire.
- **A red-team suite runs hostile and prompt-injected theses on every commit**, 24 of them. It found
  two live defects: a hallucinated symbol that surfaced as "capacity the market refused", and an
  unreachable trigger that installed cleanly and could never fire.
- **Wallet-native, phone included.** EIP-6963 injected wallets plus WalletConnect, no wallet
  library, no change to the money path.
- **`GET /api/health` answers whether a fill could succeed right now** and returns **503** when
  nothing can trade. A deployment that responds is not a deployment that works.

## Demo: the chain is the evidence

- **Live app:** [https://reckonz.xyz](https://reckonz.xyz)
- **Health:** [https://reckonz.xyz/api/health](https://reckonz.xyz/api/health)

**Eighteen real fills, not a simulation**, including sales, two placed from a browser, and five
bound to the evidence they rest on:

```
#0  0x7240759d327d468f9a7086ed439abf42dead17887105d986ca0870ebf46d6545   0.5 USDG -> wSPYx
#1  0x5710894e80baddfb35ab12321642b16c8cc8ab0b8f9a90a837f7c1e3ee9d1a23   0.5 USDG -> wSPYx, 15 bps fee
#2  0x300870192316392ff062c4f890ab1cb616a1e5e5e2ce2b43aebb3f8df2b27af5   carries thesis 0xc3cd487e...
#3  0xc9eba0cb05da5f00d71a63486d696a90bddc4a4f7ca3ddaab6b1acdb158f74f8   0.5 USDG -> wTSLAx, 7 bps
#4  0x769edd3bb8e2765f7cc4c46cf69f7894d51a9e7bff1dcf58234c421a92d10b0a   wSPYx -> 0.1004 USDG, isExit
#5  0x7e680f64844532819e9687b4cbe5b2a102811c66b8f9d56157a243b8c61b4ecf   thesis #1, wQQQx, 39 bps
#6  0xca141f6d9803992376eab5dd0ac74e97d0aaa4a0a5bee6218ee4ae5b29830cf9   thesis #1, wNVDAx, 28 bps
#7  0x04685035a0251848d4c0580b30e4c5569236eaeaa62f42023615cfccada00933   thesis #2, wTSLAx, 0 bps
#8  0xdf2d5564292d50623054ed8d0bb59093a84ce522f58ac60d67cfe8303666842a   thesis #2, wNVDAx, 27 bps
#9-#13                                                                 five exits, priced by the issuer
#14 0xfbcdb2282d862941c0b386faa725e01f17957d557349e79a8da4fac310f0c552   0.6 USDG -> wTSLAx
#15 0xcdb607a89c8ccc3a4999257b2f547dc962c19f540644f6624937386b0d25bbc5   0.5 USDG -> wSPYx, from a browser
#16 0x85501e91...                                                      first exit from a browser
#17                                                                    the same, from the rebuilt CLI
```

**`#15` is the one to look at.** It was placed from the web app against the OKX extension: the
server quoted it, read the oracle and asked the guard, and the **wallet** produced the Permit2
signature and sent the transaction. It settled at 776.8877 against a fair value of 776.9450, so
**0 bps of shortfall**, gap risk 4. It carries thesis #0's hash, so it lands in that thesis's public
track record, which is the loop this project exists to close.

**A sixth fill was attempted and refused.** wSPYx quoted 59 bps above fair value against a 50 bps
ceiling, so the guard rejected it in `dryRun` and no gas was spent. That refusal is the product
working, and it is why thesis #1's basket holds two of the three assets it names.

In each fill, the swap, the policy check and the receipt happen in **one transaction**. The executor
holds nothing when it returns, and asserts that rather than assuming it.

### Live on X Layer mainnet (chain 196)

Every contract is verified on Sourcify, `exact_match` on creation and runtime bytecode.

| Contract | Address |
|---|---|
| `FairValueOracle` | [`0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09`](https://repo.sourcify.dev/196/0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09) |
| `ReceiptRegistry` | [`0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6`](https://repo.sourcify.dev/196/0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6) |
| `PolicyGuard` | [`0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be`](https://repo.sourcify.dev/196/0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be) |
| `Executor` | [`0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2`](https://repo.sourcify.dev/196/0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2) |
| `FeeCollector` | [`0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0`](https://repo.sourcify.dev/196/0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0) |
| `ThesisRegistry` | [`0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E`](https://repo.sourcify.dev/196/0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E) |

The oracle, guard and executor were replaced on 2026-08-11 to add a publish-time bound; the
registries were **kept**, so every fill above lives in one append-only history. Admin is a **2-of-3
Safe** ([`0x98d19BE6...7F1391e`](https://www.oklink.com/xlayer/address/0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e));
publishing is a separate key that can do nothing else. Settlement is real USDG,
`0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`. A testnet stack (chain 1952) is deployed and verified
too, for fourteen verified contracts in total, seven per chain. Addresses in `src/deployments.ts`.

## Architecture

```
+---------------------------------------------------------------+
| UI - Next.js 16 App Router + Tailwind v4                      |
|   renders src/pipeline.ts and computes NOTHING (D28)          |
+---------------------------------------------------------------+
| SERVER - quote, oracle read, guard dryRun, evidence hash      |
|   holds no key; returns an INERT plan                         |
+---------------------------------------------------------------+
| WALLET - the user's own (EIP-6963 / WalletConnect)            |
|   produces the Permit2 signature and sends the transaction    |
+---------------------------------------------------------------+
                        | one transaction
                        v
   Executor - Permit2 pull -> V3Swapper (derives the pool itself)
            -> FeeCollector (15 bps, ceiling 50 in code)
            -> PolicyGuard.validateAndRecord   <- reverts here, and
            -> ReceiptRegistry (append-only)      everything reverts with it
                        ^
        FairValueOracle |  issuer mark x shares/token, band, gap risk
                        |  cross-checked, or marked unpublishable
```

**The AI is upstream of the money path, never inside it.** The compiler emits a mandate; the mandate
is enforced by a contract; the contract is the only thing that can move value, and only against a
signature the owner just produced.

## Judge's tour: start here

The parts of the codebase we are proud of, so you do not have to go spelunking:

| What | Where | Why it matters |
|---|---|---|
| The binding check | [`contracts/PolicyGuard.sol#L246`](contracts/PolicyGuard.sol#L246) | `validateAndRecord` runs **last, inside the trade's own transaction**. A violated bound reverts the Permit2 pull and every swap with it |
| Nothing is left behind | [`contracts/Executor.sol#L157-L163`](contracts/Executor.sol#L157-L163) | The executor asserts it holds zero on return rather than assuming it: non-custody proven per transaction, not promised |
| `peek` is safe, `observation` reverts | [`contracts/FairValueOracle.sol#L313`](contracts/FairValueOracle.sol#L313) vs [`#L334`](contracts/FairValueOracle.sol#L334) | The names suggest the opposite. `src/abi.ts` said the opposite for weeks and the browser fill path believed it (D64) |
| Admission by reconciliation | [`src/fairvalue.ts#L121`](src/fairvalue.ts#L121) | Every asset carries `admittedOn`, proof it passed `pnpm reconcile` against the issuer's own mark. No hand-added tickers |
| The second opinion | [`src/crosscheck.ts#L127`](src/crosscheck.ts#L127) | Quote vs itself, spread vs plausibility, mid vs our own history, value vs the pool. It **withholds, never corrects**, and a check that cannot run reports `skipped`, never `ok` |
| Hallucinations are named, not absorbed | [`src/thesis.ts#L177`](src/thesis.ts#L177) | `validateAllocation`. An invented symbol used to vanish at the planner and resurface as "capacity the market refused" |
| Unreachable triggers are dropped | [`src/triggers.ts#L119`](src/triggers.ts#L119) | `reachability()` plus `METRIC_DOMAIN`: `gapRisk > 5000` installed cleanly on a 0-100 score and could never fire |
| Evidence, hashed before signing | [`src/evidence.ts#L95`](src/evidence.ts#L95) | Quote, oracle value, **its age in seconds**, and the verdict. `pnpm evidence <hash>` re-derives it from a fresh clone |
| Zero has two meanings | [`src/exit-plan.ts#L415`](src/exit-plan.ts#L415) | A stale oracle makes shortfall zero. `shortfallBps: null` distinguishes "sold above fair value" from "nothing measured it" (D77) |
| The off-chain mirror | [`src/guard.ts#L59`](src/guard.ts#L59) | Mirrors `checkExecution` line for line. If they diverge, the mirror is wrong, and a test pins it against **real mainnet receipts** |
| The model as hostile input | [`src/thesis-redteam.test.ts`](src/thesis-redteam.test.ts) | 24 adversarial theses run the whole distance from JSON to `setTriggers` |
| Derived, not recalled | [`src/v3math.ts`](src/v3math.ts) | `TICK_RATIOS` was computed (`2^128 * 1.0001^(-2^(k-1))`), not copied. A shifted constant looks plausible below 10,000 ticks and is garbage above |

## Run it

```bash
pnpm install
forge install foundry-rs/forge-std@v1.16.2   # lib/ is gitignored

pnpm dev                     # the web app: thesis in, guard verdict out
pnpm verify                  # ported Uniswap math vs live on-chain state
pnpm verify:abi              # src/abi.ts vs the compiled contracts, selector by selector
pnpm plan [usdg] [maxBps]    # a thesis basket: naive execution vs planned
pnpm capacity                # what every xStock can absorb, by impact limit
pnpm oracle [usdg]           # fair value, gap risk, and the guard's decision per asset
pnpm thesis "free text"      # thesis -> assets -> sizing -> mandate
pnpm track-record            # every published thesis and what it actually did
pnpm evidence <hash>         # re-derive a receipt's evidence bundle and compare
pnpm test                    # 227 TypeScript unit tests plus 106 Foundry tests
```

Anything that writes on chain takes its chain from `TARGET` (`testnet` by default), so nothing can
write to the wrong one:

```bash
TARGET=mainnet pnpm oracle:publish     # run the oracle engine, publish, read back
TARGET=mainnet pnpm mandate            # create a mandate, install triggers, watch one fire
TARGET=mainnet pnpm execute wSPYx 0.5  # quote -> dryRun -> Permit2 -> one real fill
TARGET=mainnet pnpm exit wSPYx --units 0.0005   # the reverse
TARGET=mainnet pnpm breaker <id> on    # the owner kill switch
```

## What is here

| File | Role |
|---|---|
| `src/v3math.ts` | Uniswap V3 core math in BigInt: TickMath, SqrtPriceMath, SwapMath, TickBitmap |
| `src/pool.ts` | Pool snapshot loader plus exact-input multi-tick swap simulation |
| `src/planner.ts` | Routing, capacity search, slicing schedule, basket planning |
| `src/fairvalue.ts` | Fair-value engine: issuer mark times shares per token, band, gap-risk score |
| `src/issuer.ts` | The issuer's own view: quote, per-session spread, corporate-action multiplier |
| `src/crosscheck.ts` | The second opinion between the engine and the chain |
| `src/guard.ts` | Off-chain mirror of the on-chain execution check |
| `src/thesis.ts` | Thesis Compiler: schema, prompts, mandate compilation |
| `src/pipeline.ts` | The whole product as one streamed run; shared by CLI and web |
| `src/fill.ts`, `src/exit-plan.ts` | Everything before a signature, in both directions |
| `src/evidence.ts`, `src/evidence-store.ts` | The bundle, its hash, and somewhere it can be fetched from |
| `src/abi.ts`, `src/deployments.ts`, `src/chain.ts` | One source per kind of fact, browser-safe |
| `src/ratelimit.ts` | Token buckets and in-flight caps for every public route |
| `contracts/PolicyGuard.sol` | Mandate, policy, exit triggers, and the binding check |
| `contracts/FairValueOracle.sol` | On-chain observations plus `checkExecution` |
| `contracts/Executor.sol` | Permit2 pull, swap, settle, submit: one transaction |
| `contracts/V3Swapper.sol` | Direct pool swaps; derives the pool rather than trusting a router |
| `contracts/ReceiptRegistry.sol` | Append-only execution history |
| `contracts/FeeCollector.sol` | 15 bps on notional, ceiling fixed in code at 50 |
| `app/` | Next.js front end; renders `src/pipeline.ts` and computes nothing |

Pool state is prefetched into two multicalls, so the simulation is pure and synchronous.
`capacity()` runs its bisection across every fee tier without a single network call.

## The finding

Absorbable USDG before price impact exceeds the limit. All 30 xStocks with a USDG pool, measured
against live state on 2026-08-11:

```
asset       spot           0.50%     1.00%     2.00%     5.00%
wGLDx         405.44      10,752    22,569    46,201   115,189
wQQQx         723.83       3,885     8,155    16,696    42,316
wSPYx         777.17       3,871     8,126    16,635    42,161
wIWMx         301.39       3,645     7,651    15,664    39,700
wNVDAx        219.17       2,223     4,062     7,149    14,864
...24 more, each ~800-1,100 at 0.5%
TOTAL                     48,353   100,887   205,365   515,340
```

**About $48k at 0.5% impact on 11 August. About $97k on the 15th, with no code change.** We publish
that number with its date rather than hide it, because it is a reading of the pools and not a
property of them: OKX's own custodial order book settles these tickers on X Layer, and arbitrage
between the two is deepening the market underneath us. Re-run `pnpm capacity` and you will get a
third number. That is the point being made, not a risk to the claim.

Depth is not uniform even though TVL nearly is, which is the whole argument for measuring absorbable
size rather than reading TVL off a dashboard.

Two consequences:

1. **This cannot be an AUM business.** Fees come from execution quality, published theses, and the
   fair-value feed, not from assets gathered.
2. **Telling the user the truth is the product.** Every competing allocator will show a clean pie
   chart and hand the user a 28% haircut.

## The refusals

The three moments that make the case, from one run of the web app:

```
allocate  Samsung -> unmapped, "no matching asset"      <- it will not substitute an adjacent name
capacity  $250,000 asked -> $20,361 executable          <- and it hands back the $229,639
guard     wSKHYx ALLOW                                  <- resolved: it tracks a US DR, not the Seoul share (D62)
```

The third is worth dwelling on, because it was wrong for a day and the wrongness is the point.
`wSKHYx` was refused at -86% against the Seoul listing, and the oracle marked it unpublishable
rather than printing a basis it could not defend. **That refusal was correct. The reason was not.**
The token tracks a US depositary receipt, and the roughly 7x gap was a DR ratio rather than a broken
pool. Referencing the issuer found in one query what no amount of care with the exchange mapping
would have found, because the exchange mapping was the thing that was wrong.

All 30 are now priced, each admitted by a reconciliation rather than by a judgement that the ticker
looked obvious. `wSPCXx` is priced and carries a caveat no other asset does: SpaceX is private, so
the issuer's mark is the **only** opinion in existence and nothing can falsify it. A thesis about
Apple maps to wAAPLx, is sized against its real depth, and where it is refused, it is refused for the
true reason rather than the false claim that the asset does not exist.

## Notes that cost time to learn

- **The Uniswap V3 factory on X Layer is not at the canonical address.** It is
  `0x4b2ab38dbf28d31d467aa8993f6c2585981d6804`, resolved by reading `factory()` on a live pool. An
  SDK default fails **silently** here.
- **The Universal Router on X Layer cannot execute a V3 swap at all.** It carries the *canonical*
  factory in its own bytecode, so it derives pool addresses that have no code and reverts with no
  data. Deployed, correctly shaped, and useless, which is why `Executor` derives the pool itself.
  Checking a codesize and a selector proved nothing.
- **A confirmed write is not immediately readable.** The public RPC load-balances, so a read straight
  after a write can hit an unsynced node and return **zeroes, not an error**, and gas estimation for
  a dependent transaction reverts for reasons that make no sense. Poll until the state is visible. In
  a browser this bites twice: `viem`'s `waitForTransactionReceipt` never returned through the
  injected provider either, so the page polls for the receipt itself.
- **There are no Chainlink equity feeds on X Layer.** Any fair-value layer has to be built, not
  consumed. Morpho and Ondo are not here either; the $81.8M lender is Aave V3.
- **There is no market-hours problem to ignore.** These tokens trade 24/7 while their reference
  markets are open about 32 hours a week. NQ/ES futures cover weeknights; nothing covers weekends.
  The band has to say so.
- **Do not scale daily volatility across calendar time** to size an overnight band. The asset does
  not move over a weekend. Sampling the security's own realised close-to-open jumps, weekend gaps
  separately from overnight ones, took bands of plus or minus 19% down to plus or minus 5%.

## How it maps to the judging criteria

- **Application of AI.** The compiler is bounded by a **schema rather than a prompt**, so the model
  can only name quantities the chain can measure; unmeasurable conditions are surfaced to the user
  instead of quietly becoming rules that never fire. A 24-test red-team suite runs hostile and
  prompt-injected theses through the whole path on every commit, and it has found real defects.
- **On-chain data.** 18 receipts in an append-only registry on mainnet, five carrying evidence
  hashes anyone can re-derive; fees actually collected; a 2-of-3 Safe as admin; every deployed
  address verified on Sourcify.
- **Code quality.** 106 Foundry plus 232 TypeScript tests in CI on every push, arithmetic mirrors
  pinned against **real mainnet receipts** rather than invented vectors, one source per kind of fact,
  and an append-only decision log that records the mistakes instead of hiding them.
- **Innovation.** Bounded agent execution is commodity by now. Bounding on **market conditions**,
  whether the price is defensible and the depth is there, inside the trade's own transaction is not,
  and neither is a receipt the executing system cannot author.
- **User value and product completeness.** Thesis, mandate, sized fill, track record, exit: end to
  end, from the browser, on mainnet, with real money. Plus the refusals, which are the reason to use
  it.
- **Contribution to the ecosystem.** A fair-value feed and a capacity measurement for all 30 xStocks
  on X Layer, on a chain that has neither. The discipline layer is deployed *before* the liquidity
  arrives.

## Roadmap

Shipped: mainnet stack with a publish-time bound, exits (contract, CLI and browser), evidence
bundles archived publicly, the oracle cross-check, `/api/health` with a 503 that means it, RPC
failover across three endpoints, WalletConnect for phones, rate limiting on every public route, and
232 unit tests including the red-team suite. Next:

- **Something that calls `/api/health`.** An endpoint is not a monitor; one uptime check on a
  one-minute timer closes the gap that caused a two-day silent outage.
- **A publish worker with real uptime.** The cross-check's history arm degrades to `skipped` within
  48 hours of the last sampled mark.
- **A cross-instance rate limit.** What ships today is a per-instance cost ceiling, not a global
  guarantee, and it is described that way on purpose.
- **A demo video** recorded against a live oracle.

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `viem`, `zod`, Foundry and Solidity,
Permit2, Uniswap V3 ported to BigInt, Gemini for the thesis compiler, Vercel Blob for evidence,
X Layer mainnet (196) and testnet (1952).

## Non-negotiables

If you contribute, these do not bend:

- **Non-custodial.** No contract in this repo may take custody of user funds.
- **The AI never holds a key that can move funds arbitrarily.** Permit2 is what enforces it;
  off-chain checks are decoration.
- **The oracle is a guard, not a price.** When it cannot defend a number it marks the value
  unpublishable rather than inventing one.
- **Tooling, not investment advice.** The user writes the thesis; the system maps and executes it.
  Never invert.
- **Report capacity honestly.** Telling users what the chain cannot absorb *is* the product.

## License

ISC. Contracts are verified on Sourcify, so the source of everything deployed is readable on chain
regardless.
