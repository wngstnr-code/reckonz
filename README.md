# Reckonz

**Non-custodial execution and risk tooling for tokenised equities on X Layer.**

![network](https://img.shields.io/badge/network-X_Layer_mainnet_196-blue) ![contracts](https://img.shields.io/badge/contracts-verified_on_Sourcify-1ba27a) ![custody](https://img.shields.io/badge/custody-none-6ee7b7) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

> **"You cannot, and here is the number."**

Reckonz turns an investment thesis into on-chain positions in **tokenised real-world assets**
(xStocks: Apple, Nvidia, Tesla and the rest of the universe, trading as ERC-20s on **X Layer**),
sized to what the market can actually absorb, and into the exit rules that close them. **Your funds
never leave your wallet, at any point.**

Built for the **X Layer "AI Season" hackathon (AI-RWA track)**.

[reckonz.xyz](https://reckonz.xyz) · [the console](https://app.reckonz.xyz/assets) · [@reckonz_xyz](https://x.com/reckonz_xyz) · [source](https://github.com/wngstnr-code/reckonz)

---

## Five minutes, if you are judging

1. **[/idea](https://app.reckonz.xyz/idea)**. Write a thesis, watch it get compiled into a
   falsifiable claim, mapped to tokens that actually exist, and sized down to what the pools can
   take.
2. **[/trade](https://app.reckonz.xyz/trade)**. The part that needs your wallet: set a mandate's
   bounds, then buy or sell inside them. The plan the server hands back is inert, and your own
   wallet signs the Permit2 authorisation that moves anything.
3. **[/assets](https://app.reckonz.xyz/assets)**. Every xStock with its fair value or an honest
   refusal to price it, its gap risk, and a measured depth ladder. That last number is the one
   nobody else on this chain publishes.
4. **[/receipts](https://app.reckonz.xyz/receipts)**. Real fills, read from the chain, each linked
   to the evidence bundle its decision rested on. `pnpm evidence <hash>` re-derives any of them
   from a fresh clone and tells you whether it matches what was signed.
5. **[/api/health](https://reckonz.xyz/api/health)**. Whether a fill could succeed right now. It
   answers 503 when nothing can trade, because a deployment that responds is not a deployment that
   works.

---

## The problem

Tokenised equities finally exist on-chain, and the tooling around them behaves as if the liquidity
does too. The pools behind these tickers are thin and they move, by multiples, inside a single week,
in both directions, with nothing launched in between. Every allocator built on top of them will
still show a clean pie chart, take the full amount, and hand the user the difference as slippage.

The second problem is the one AI made worse. An agent that trades on your behalf is a key that can
move money, bounded at best by a session policy and a spend cap. Those bound *where funds may go and
how much*. Nothing bounds **whether the price can be defended and whether the depth is really
there**, which is the failure mode that actually costs money on a thin chain.

The third is that nobody can check afterwards. The system that executed the trade is usually the
same system that writes the report about it.

## What it does

Reckonz is a refusal engine with an executor attached. Four places it declines, each enforced rather
than advised:

1. **You write a thesis in plain language:** *"HBM memory supply stays tight for two more
   quarters."* The compiler turns it into a falsifiable claim: causal chain, beneficiaries, and the
   conditions you said would change your mind. Ask for a company with no token on X Layer and it
   answers **"no matching asset"** instead of substituting an adjacent ticker.
2. **It sizes each leg against live Uniswap V3 depth**, not against the number you typed. Ask for a
   quarter of a million and it executes the part the pools can take inside your impact limit, hands
   the rest back, and shows what forcing the whole amount through in one shot would have cost.
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
  fair value and gap risk are stamped by the guard from the oracle. Nothing off-chain touches
  either number.
- **Evidence hashes, published before signing.** The exact quote, the oracle's value *and its age in
  seconds*, and the guard's verdict, hashed before anything is signed, archived publicly, and
  re-derivable by anyone with `pnpm evidence <hash>`.
- **A guard that bounds on market conditions.** Bounding an agent's key is commodity by now.
  Bounding on *whether the price is defensible and the depth is there* is the part nothing else
  checks, and it runs last, in the same transaction as the swap.
- **An oracle that says "I don't know".** It carries each equity's last official print forward,
  publishes a band and a gap-risk score, and marks a value **unpublishable** rather than inventing
  one.
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
- **A red-team suite runs hostile and prompt-injected theses on every commit.** It found two live
  defects: a hallucinated symbol that surfaced as "capacity the market refused", and an unreachable
  trigger that installed cleanly and could never fire.
- **Wallet-native, phone included.** EIP-6963 injected wallets plus WalletConnect, no wallet
  library, no change to the money path.
- **`GET /api/health` answers whether a fill could succeed right now** and returns **503** when
  nothing can trade. A deployment that responds is not a deployment that works.

## Demo: the chain is the evidence

| | |
|---|---|
| Landing | [reckonz.xyz](https://reckonz.xyz) |
| The console | [/assets](https://app.reckonz.xyz/assets), [/idea](https://app.reckonz.xyz/idea), [/trade](https://app.reckonz.xyz/trade), [/receipts](https://app.reckonz.xyz/receipts) |
| Health | [reckonz.xyz/api/health](https://reckonz.xyz/api/health) |

Real fills on mainnet, not a simulation: entries and exits, some placed from a browser against a
wallet extension, each carrying the hash of the evidence it rests on. Two worth opening:

**A fill placed from the browser.**
[`0xcdb607a8…`](https://www.oklink.com/xlayer/tx/0xcdb607a89c8ccc3a4999257b2f547dc962c19f540644f6624937386b0d25bbc5)
The server quoted it, read the oracle and asked the guard; the **wallet** produced the Permit2
signature and sent the transaction. It settled inside the guard's bound with zero shortfall against
fair value, and it carries a thesis hash, so it lands in that thesis's public track record. Nothing
on our side held a key at any point.

**An exit whose shortfall could not be measured.**
[`0x85501e91…`](https://www.oklink.com/xlayer/tx/0x85501e9180f290b8ae6dfcdcc07ac85e4c4d1bdc48af07cd012b47c899e78414)
The oracle was stale, so the contract recorded a fair value of zero and a shortfall of zero. That
zero is correct and it is **not** a measurement, and the receipt is rendered as `slip unmeasured`
rather than as a flawless sale. It is in this README because a system that only shows you its clean
receipts is the thing this one is arguing against.

**A fill was also attempted and refused.** The asset quoted above fair value by more than the
policy's ceiling, so the guard rejected it in `dryRun` and no gas was spent. That refusal is the
product working, and it is why that thesis's basket holds fewer assets than it names.

In each fill, the swap, the policy check and the receipt happen in **one transaction**. The executor
holds nothing when it returns, and asserts that rather than assuming it.

### Live on X Layer mainnet (chain 196)

Every deployed contract is verified on Sourcify, `exact_match` on both creation and runtime
bytecode, on mainnet and on testnet.

| Contract | What it is | Address |
|---|---|---|
| `FairValueOracle` | Publishes a value, a band and a gap-risk score, or refuses to | [`0xDB7949c9…`](https://repo.sourcify.dev/196/0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09) |
| `PolicyGuard` | Mandates, policy, exit triggers, and the check that reverts the trade | [`0x9C8F1af1…`](https://repo.sourcify.dev/196/0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be) |
| `Executor` | Permit2 pull, swap, settle, record: one transaction, no custody | [`0xD3d4aeD6…`](https://repo.sourcify.dev/196/0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2) |
| `ReceiptRegistry` | Append-only execution history the agent cannot author | [`0x9D045758…`](https://repo.sourcify.dev/196/0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6) |
| `ThesisRegistry` | Published theses, so a track record cannot be edited after the fact | [`0xD4b503d0…`](https://repo.sourcify.dev/196/0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E) |
| `FeeCollector` | Fee on notional, with a ceiling that is a `constant`, not a setting | [`0x3A1D6b91…`](https://repo.sourcify.dev/196/0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0) |
| `PoolSwapper` | Funding helper for an EOA. Not in the user money path | [`0x1f3b67d8…`](https://repo.sourcify.dev/196/0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28) |

The oracle, guard and executor were replaced once to add a publish-time bound; the registries were
**kept**, so every fill lives in one append-only history. Admin of the oracle, the receipt registry
and the fee collector is a **2-of-3 Safe**
([`0x98d19BE6…`](https://www.oklink.com/xlayer/address/0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e));
publishing is a separate hot key that can do nothing else, and its gas runway is reported by
`/api/health` so the one outage everybody can see coming is watched rather than remembered.
Settlement is real USDG, `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`. A full testnet stack
(chain 1952) is deployed and verified too. Every address lives in `src/deployments.ts`, and nowhere
else.

## Architecture

```
     a thesis, in plain language
     │
     ▼

┌────────────────────────────────────────────────────────────────────────────┐
│  OFF CHAIN           nothing here holds a key that can move funds          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Thesis Compiler     bounded by a schema, not a prompt: it may only        │
│                      name quantities the chain can measure                 │
│         │                                                                  │
│         ▼                                                                  │
│  Planner, oracle,    sizes every leg to live pool depth, and hashes        │
│  guard dryRun        the evidence BEFORE anything is signed                │
│         │                                                                  │
│         ▼                                                                  │
│  an INERT plan       it cannot execute itself                              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

     │
     ▼

┌────────────────────────────────────────────────────────────────────────────┐
│  YOUR WALLET         EIP-6963 or WalletConnect                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                      signs a Permit2 authorisation, scoped to one token,   │
│                      a capped amount, and twenty minutes                   │
│                      the only thing in this diagram that can move value    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

     │  one transaction
     ▼

┌────────────────────────────────────────────────────────────────────────────┐
│  ON CHAIN            one transaction: all of it, or none of it             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Executor            pulls against your signature, and asserts that it     │
│                      holds nothing when it returns                         │
│         │                                                                  │
│         ▼                                                                  │
│  V3Swapper           derives the pool itself, and trusts no router         │
│         │                                                                  │
│         ▼                                                                  │
│  FeeCollector        fee on notional, with a ceiling that is a constant    │
│         │                                                                  │
│         ▼                                                                  │
│  PolicyGuard         the binding check, and it runs LAST. It judges        │
│                      against FairValueOracle: the issuer's mark times      │
│                      shares per token, a band, a gap risk, cross-checked,  │
│                      or withheld when it cannot be defended                │
│                                                                            │
│        ✗             a bound breaks HERE and the swap, the fee and the     │
│                      Permit2 pull revert with it, in the same transaction  │
│                                                                            │
│         ▼            otherwise                                             │
│  ReceiptRegistry     append-only, and the agent cannot author it           │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**The AI is upstream of the money path, never inside it.** The compiler emits a mandate; the mandate
is enforced by a contract; the contract is the only thing that can move value, and only against a
signature the owner just produced.

## Judge's tour: start here

The parts of the codebase we are proud of, so you do not have to go spelunking:

| What | Where | Why it matters |
|---|---|---|
| The binding check | `validateAndRecord` in [`contracts/PolicyGuard.sol`](contracts/PolicyGuard.sol) | It runs **last, inside the trade's own transaction**. A violated bound reverts the Permit2 pull and every swap with it |
| Nothing is left behind | [`contracts/Executor.sol`](contracts/Executor.sol) | The executor asserts it holds zero on return rather than assuming it: non-custody proven per transaction, not promised |
| `peek` is safe, `observation` reverts | [`contracts/FairValueOracle.sol`](contracts/FairValueOracle.sol) | The names suggest the opposite, and an ABI comment that said so was believed by the browser fill path for weeks |
| Admission by reconciliation | [`src/fairvalue.ts`](src/fairvalue.ts) | Every asset carries `admittedOn`, proof it passed `pnpm reconcile` against the issuer's own mark. No hand-added tickers |
| The second opinion | [`src/crosscheck.ts`](src/crosscheck.ts) | Quote vs itself, spread vs plausibility, mid vs our own history, value vs the pool. It **withholds, never corrects**, and a check that cannot run reports `skipped`, never `ok` |
| Hallucinations are named, not absorbed | `validateAllocation` in [`src/thesis.ts`](src/thesis.ts) | An invented symbol used to vanish at the planner and resurface as "capacity the market refused" |
| Unreachable triggers are dropped | `reachability()` in [`src/triggers.ts`](src/triggers.ts) | A bound stated outside a metric's own domain installed cleanly and could never fire |
| Evidence, hashed before signing | [`src/evidence.ts`](src/evidence.ts) | Quote, oracle value, **its age in seconds**, and the verdict. `pnpm evidence <hash>` re-derives it from a fresh clone |
| Zero has two meanings | [`src/exit-plan.ts`](src/exit-plan.ts) | A stale oracle makes shortfall zero. `shortfallBps: null` distinguishes "sold above fair value" from "nothing measured it" |
| The off-chain mirror | [`src/guard.ts`](src/guard.ts) | Mirrors `checkExecution` line for line. If the two diverge, the mirror is wrong. Its two **deliberate** divergences are pinned by test with the reason attached, because they are exactly what a later reader would "fix" into agreement |
| Pinned to receipts, not to vectors | [`src/fill.test.ts`](src/fill.test.ts), [`src/exit-plan.test.ts`](src/exit-plan.test.ts) | The arithmetic is asserted against numbers **read back from mainnet receipts**. A test against a real receipt cannot agree with a wrong mirror |
| The model as hostile input | [`src/thesis-redteam.test.ts`](src/thesis-redteam.test.ts) | Adversarial theses run the whole distance from JSON to `setTriggers` |
| Derived, not recalled | [`src/v3math.ts`](src/v3math.ts) | `TICK_RATIOS` was computed, not copied. A shifted constant looks plausible at small tick counts and is garbage at large ones |

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
pnpm test                    # TypeScript unit tests plus the Foundry suite
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
| `src/ratelimit.ts` | Token buckets and in-flight caps in front of every route that spends anything |
| `contracts/PolicyGuard.sol` | Mandate, policy, exit triggers, and the binding check |
| `contracts/FairValueOracle.sol` | On-chain observations plus `checkExecution` |
| `contracts/Executor.sol` | Permit2 pull, swap, settle, submit: one transaction |
| `contracts/V3Swapper.sol` | Direct pool swaps; derives the pool rather than trusting a router |
| `contracts/ReceiptRegistry.sol` | Append-only execution history |
| `contracts/FeeCollector.sol` | Fee on notional, ceiling fixed in code |
| `app/` | Next.js front end; renders `src/pipeline.ts` and computes nothing |

Pool state is prefetched into two multicalls, so the simulation is pure and synchronous.
`capacity()` runs its bisection across every fee tier without a single network call.

## What the market can actually absorb

`pnpm capacity` reports how much USDG the market can absorb before price impact exceeds a limit, per
asset and in total, measured against live pool state and in-range liquidity only.

**We publish that number with the date it was read, and we re-read it rather than quote it.** It is
a reading of the pools, not a property of them. It has moved by multiples inside a single week with
nothing launched in between, and it does not only go up: the deepest asset in the universe one week
had almost nothing left in its USDG pool the next. Run the command and you will get a different
number again. That is the point being made, not a risk to the claim: an allocator that quotes any of
these as a standing fact is the thing this repo exists to argue against.

**It is also one venue's number.** Each figure is that asset's USDG pool on Uniswap V3. Where a
pool empties before the impact limit is reached, the report marks it, because that number is the
pool's depth rather than a measured impact and the asset can be deeper than it. Some of these
tickers also trade against USDC in pools the report does not count, and it says so rather than
presenting one venue as the market.

Depth is not uniform even though TVL nearly is, which is the whole argument for measuring absorbable
size rather than reading TVL off a dashboard. Two consequences:

1. **This cannot be an AUM business.** Fees come from execution quality, published theses, and the
   fair-value feed, not from assets gathered.
2. **Telling the user the truth is the product.** Every competing allocator will show a clean pie
   chart and hand the user the haircut.

## The refusals

The three moments that make the case, each one a real state of the running app:

```
allocate  a company with no token -> unmapped, "no matching asset"
capacity  the amount asked -> the amount executable, and the difference handed back
guard     an asset quoting above fair value -> rejected before gas is spent
```

The middle one is the product. The last one is the one to dwell on, because it was once right for
the wrong reason. An asset was refused at a large negative gap against a foreign listing, and the
oracle marked it unpublishable rather than printing a basis it could not defend. **That refusal was
correct. The reason was not.** The token tracks a US depositary receipt, and the gap was a DR ratio
rather than a broken pool. Referencing the issuer found in one query what no amount of care with the
exchange mapping would have found, because the exchange mapping was the thing that was wrong.

Every asset in the universe is admitted by a reconciliation rather than by a judgement that the
ticker looked obvious. One of them is priced and carries a caveat no other asset does: the company
is private, so the issuer's mark is the **only** opinion in existence and nothing can falsify it. A
thesis about Apple maps to the wrapped token, is sized against its real depth, and where it is
refused, it is refused for the true reason rather than the false claim that the asset does not
exist.

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
  consumed. The RWA lending protocols are not here either; the largest lender is Aave V3.
- **There is no market-hours problem to ignore.** These tokens trade 24/7 while their reference
  markets are open a fraction of the week. Index futures cover weeknights; nothing covers weekends.
  The band has to say so.
- **Do not scale daily volatility across calendar time** to size an overnight band. The asset does
  not move over a weekend. Sampling the security's own realised close-to-open jumps, weekend gaps
  separately from overnight ones, took the bands down by roughly a factor of four.

## How it maps to the judging criteria

- **Application of AI.** The compiler is bounded by a **schema rather than a prompt**, so the model
  can only name quantities the chain can measure; unmeasurable conditions are surfaced to the user
  instead of quietly becoming rules that never fire. A red-team suite runs hostile and
  prompt-injected theses through the whole path on every commit, and it has found real defects.
- **On-chain data.** Receipts in an append-only registry on mainnet, carrying evidence hashes anyone
  can re-derive; fees actually collected; a 2-of-3 Safe as admin; every deployed address verified on
  Sourcify.
- **Code quality.** Foundry and TypeScript suites in CI on every push, arithmetic mirrors pinned
  against **real mainnet receipts** rather than invented vectors, and one source per kind of fact:
  addresses in `src/deployments.ts`, ABIs in `src/abi.ts`, and never a second copy.
- **Innovation.** Bounded agent execution is commodity by now. Bounding on **market conditions**,
  whether the price is defensible and the depth is there, inside the trade's own transaction is not,
  and neither is a receipt the executing system cannot author.
- **User value and product completeness.** Thesis, mandate, sized fill, track record, exit: end to
  end, from the browser, on mainnet, with real money. Plus the refusals, which are the reason to use
  it.
- **Contribution to the ecosystem.** A fair-value feed and a capacity measurement for every xStock
  on X Layer, on a chain that has neither. The discipline layer is deployed *before* the liquidity
  arrives.

## Roadmap

None of this exists yet. Everything that does exist is described above, in the present tense.

The phases are in the order a company has to do them, and each one says what would prove it
worked. A roadmap nobody can check is a wish list, and this product does not let its users get
away with that either.

### 1. Safe enough to hand to a stranger

Every trade so far was placed by the people who built it. Other people's money is a different
thing, and three gaps stand between here and there: the contracts have never been reviewed by
anyone outside the team, the app does not yet say that out loud, and when your own exit rule
fires the system stops you buying more but still leaves the selling to you.

*Worked when: a stranger has traded through it without us in the room, and an independent audit
sits next to the code.*

### 2. Findable, and honest about who actually uses it

Most of the trading in these markets is machines closing a price gap between OKX and the chain.
They will never use a tool that checks anything first. So the real question is not how big the
market is, it is which slice of it can ever be ours, and nobody has measured that.

Being findable means being in the places an X Layer user already looks: OKX's wallet directory and
the ecosystem listings.

*Worked when: people we have never met are trading through it, and we can say how large the
reachable market is with the same discipline we apply to everything else.*

### 3. Getting paid for judgement, not for volume

We take a small fee per trade today. That is not the business: it grows only as fast as our own
trading does. The business is the track record. Every position and every refusal is recorded where
nobody can quietly edit it afterwards, and a record like that is worth paying to follow.

So: paid access to a published thesis. It needs no assets under management, which matters, because
these markets are too thin for that model to ever work.

*Worked when: somebody pays for access rather than for execution.*

### 4. Selling the discipline, not the trades

The most durable product here has nothing to do with us trading at all. This chain has no
trustworthy price for a tokenised stock, and we built one that publishes what it knows, how sure
it is, and when it refuses to answer. Other builders need exactly that and have nowhere to get it.

*Worked when: a product we did not build turns down a trade because of our number.*

### Not on this list, deliberately

No token. No fee on assets held, because our own measurements say a business built that way could
not survive here, and a roadmap that quietly revived it would contradict the argument on the front
page. No promise about how fast this market grows. The bet is that tokenised stocks get bigger and
the safety layer is already in place when they do. That may be wrong, and the timing was never
ours.

## Tech stack

Next.js (App Router), React, TypeScript, Tailwind CSS, `viem`, `zod`, Foundry and Solidity, Permit2,
Uniswap V3 ported to BigInt, Gemini for the thesis compiler, Vercel Blob for evidence, X Layer
mainnet (196) and testnet (1952).

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

MIT, in [`LICENSE`](LICENSE) and in the SPDX header of every contract. The deployed contracts are
verified on Sourcify, so their source is readable on chain whether or not you clone this.
