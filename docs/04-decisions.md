# Decision log

Decisions and the evidence behind them, newest last. Includes corrections — they are the
most useful entries, because each one is a mistake a fresh session would otherwise repeat.

---

## D1 — Target the AI-RWA track, not the general track

The Liquidity Grant (50k) exceeds first place (30k) and is competed for only within one
track, while most AI+crypto entrants will build trading agents. Launch Grant (200k) is
unreachable: 10M USDT of OKX-DEX-interface volume within ten days of submission.

**Consequence:** aim for AI-RWA + Hackathon Grant. Do not shape the product around
trading volume.

---

## D2 — CORRECTION: Morpho and Ondo are not on X Layer

A WebFetch prose summary of DefiLlama's `/protocols` endpoint claimed "Morpho Blue
$84M on xLayer" and "Ondo Yield Assets on xLayer". Both false. Direct JSON parsing shows
the $84M lender is **Aave V3**, and Morpho's own GraphQL API does not list chain 196.
Zero RWA-category protocols exist on X Layer.

**Consequence:** the original "AI curator over Morpho + Ondo" plan had no foundation and
was discarded. **Never trust a prose summary of a large JSON API for these facts.**

---

## D3 — The real opening is tokenised equities, not tokenised treasuries

GeckoTerminal + on-chain `name()` calls confirm ~18 xStocks live on X Layer mainnet,
all quoted against USDG: wSPYx "Wrapped SP500 xStock", wNVDAx "Wrapped NVIDIA xStock",
wSPCXx "Wrapped SpaceX xStock", and the rest. ~$1M/day of real volume. **Zero application
layer on top.**

The listing skews hard to AI/semiconductors — the same sector the previous hackathon's
Finance Copilot winner (Serenity) did research on.

---

## D4 — CORRECTION: the Uniswap V3 factory is not at the canonical address

`0x1F98431c8aD98523631AE4a59f267346ea31F984` has no code on X Layer. The factory is
`0x4b2ab38dbf28d31d467aa8993f6c2585981d6804`, resolved by reading `factory()` on a live
pool. Permit2, Multicall3 and the Universal Router *are* canonical.

**Consequence:** SDK defaults fail silently. Always override.

---

## D5 — CORRECTION: TickMath constants must be derived, not recalled

The magic-constant table written from memory dropped the `0x400` entry, shifting every
subsequent constant. Symptom: correct prices at small ticks, garbage above ~±10,000 —
a bug that looks like it works. The table is now generated as
`2^128 · 1.0001^(-2^(k-1))` and validated against `slot0` (drift 0.0016%, within one tick).

**Consequence:** `src/verify.ts` exists specifically to catch this class of error before
anything is built on top.

---

## D6 — Non-custodial, no vault

Measured capacity across the whole xStock universe: **~$48k at 0.5% impact**
(`pnpm capacity`, re-measured across all 30 assets 2026-08-11 — the original figure was
~$11k and covered only the eight the oracle prices; see D34). A vault that gathers assets
has nowhere to put them, and 4.4× nowhere is still nowhere.

**Consequence:** users hold their own assets. The system decides what/how much/when/
whether. `PolicyGuard`, `ReceiptRegistry`, `ThesisRegistry` are unchanged; only custody
of funds was dropped.

---

## D7 — Revenue is execution fees → subscriptions → oracle feed, never AUM

Direct consequence of D6. AUM fees on a $48k ceiling are not a business. See
`02-product.md` for the full table.

---

## D8 — CORRECTION: do not scale daily volatility across calendar time

First fair-value implementation sized the confidence band as
`dailyResidual × √(calendarDays)`, giving ±19% for wSNDKx — useless. An asset does not
move over a weekend.

Fixed by sampling the security's own realised close-to-open jumps, splitting weekend gaps
from overnight gaps, and shrinking by `√(1−R²)`. Bands went ±19% → ±5%, and are now
grounded in the empirical distribution of the exact quantity being predicted.

---

## D9 — The oracle refuses to publish rather than invent

Two live refusal cases:

- **wSPCXx** — SpaceX is private, no reference market exists. Value withheld by design,
  gap risk 100.
- **wSKHYx** — the reference `000660.KS` quotes in KRW and does not reconcile with the
  on-chain price. Marked unpublishable, and the *basis* component of gap risk scores 1.0
  (not 0), because not knowing whether the pool is mispriced is the riskiest state.

**Consequence:** `FairValueReport.publishable` gates on-chain publication, and
`checkExecution` returns `NO_REFERENCE` before any deviation check runs against a number
we do not trust.

---

## D10 — Frame the oracle as a guard, never as truth

The contract publishes an estimate, its uncertainty, and a risk score — so consumers can
*refuse to execute*. It never claims to be the price. The mandate's deviation tolerance is
widened by the oracle's own admitted uncertainty.

**Consequence:** the "is your oracle right?" question in judging becomes "our oracle tells
you when it does not know", which is a much stronger position.

---

## D11 — Private-market price discovery stays out of scope

The wSPCXx problem is the highest-innovation idea surfaced and the most likely to fail
(pre-IPO secondary data is scarce). Merging it would dilute both products. The oracle
already handles it correctly by withholding.

---

## D12 — PolicyGuard validates *after* the swaps, in the same transaction

`validateAndRecord` is called at the end of the execution transaction, once fills have
settled. If any rule fails it reverts, and the swaps revert with it.

The alternative — pre-authorising a plan — was rejected because it forces the guard to
trust predicted prices. Validating realised fills means the numbers written into the
receipt are the numbers that actually happened.

`dryRun()` provides the same checks as a view call, so a rejection costs no gas.

---

## D13 — Enforce only what is verifiable on-chain

Notional caps, slippage, the oracle gate, rate limits and the allowlist are all checked
against data the contract can see. Portfolio weights are enforced by reading the **owner's
actual wallet balances** priced by the oracle — not by trusting weights the agent asserts.

Where an allowed asset has no publishable oracle value, the weight check **reverts rather
than skipping the asset**, since skipping would leave a hole exactly where the risk is
highest. Weight enforcement is opt-in (`enforceWeights`) because it costs a balance read
per allowed asset.

---

## D14 — via_ir is required, and it breaks time-based tests

`publishBatch` hits stack-too-deep without `via_ir = true`. With it enabled, the Yul
optimiser hoists `block.timestamp` out of loops **in test code**, so
`vm.warp(block.timestamp + 2 hours)` inside a loop silently warps to the same instant
every iteration. Use absolute timestamps in tests that advance time in a loop.

---

## D15 — The observable-metric enum is the contract between the LLM and the guard

`disconfirmingConditions` is not free text. Each condition must compile to a trigger naming a
metric from `OBSERVABLE_METRICS` — the closed set of quantities the oracle and planner actually
produce (`gapRisk`, `basisBps`, `confidenceBps`, `stalenessHours`, `drawdownBpsFromEntry`,
`capacityUsdg`, `priceVsThesisEntryBps`).

A condition the system cannot measure is marked `observable: false` and surfaced as a manual
watch item. **It is never mapped to a proxy metric.** A rule that silently never fires is worse
than an acknowledged gap, because the user believes they are protected.

**Consequence:** one LLM output feeds both the entry and the risk rules, and the schema — not
the prompt — is what stops the model inventing unenforceable triggers.

---

## D16 — The compiler never names tickers or on-chain symbols

`compile()` returns beneficiaries as commonly-known entity names ("Micron", "SK Hynix"); a
second call maps them onto the universe **discovered from the factory at runtime**, and may only
use symbols from that list. Unmapped beneficiaries are reported, never substituted with a
loosely related asset.

**Consequence:** the model cannot hallucinate a tradable asset, newly listed xStocks are absorbed
without a code change, and the mapping step is auditable on its own.

---

## D17 — A deterministic provider ships alongside the live one

`ThesisProvider` has two implementations: `claudeProvider()` (structured outputs on
`claude-opus-5`) and `fixtureProvider()` (a recorded output that ignores its input and says so).
Selection is by credential presence.

**Why:** the rest of the pipeline — universe discovery, depth-aware sizing, mandate compilation —
is reviewable and testable without a key, and tests stay hermetic. The fixture is labelled in the
demo output so it can never be mistaken for a live run.

---

## D18 — The X Layer RPC load-balances, so reads after writes can be stale

`pnpm publish` read back three assets as all-zero immediately after a **confirmed** write, while
`checkExecution` on the same asset in the same loop saw the data — and `cast` later showed all
eight written correctly, with eight `Published` events in the receipt.

The contract was never wrong. The public RPC round-robins across nodes, and a read issued right
after a confirmed write can land on one that has not synced that block. It returns **zeroes, not
an error**, which is the dangerous part: it looks like missing data rather than a stale node.

**Consequence:** `publish.ts` polls until the written state is visible before reading anything
back. Anything that writes then immediately reads on X Layer needs the same guard — never treat
a zero read straight after a write as authoritative.

**It also affects writes.** `mandate-demo.ts` hit the same lag between two *dependent
transactions*: `setTriggers` reverted `NotOwner` because its gas estimation landed on a node that
had not seen the `createMandate` that preceded it, and read the mandate owner as `0x0` — while
`cast call` from the same address succeeded. A confirmed receipt is not sufficient to sequence
dependent transactions on X Layer; confirm the state is visible first.

---

## D19 — The compiler is provider-agnostic; Gemini is the default free path

`ThesisProvider` now has three implementations: `geminiProvider()` (free tier, `@google/genai`,
`responseJsonSchema`), `claudeProvider()` (`claude-opus-5`, structured outputs), and
`fixtureProvider()`. `LLM_PROVIDER` forces one; otherwise whichever credential is present wins.

The schema is what enforces the observable-metric contract (D15), so it holds whichever model is
behind it. Zod stays the single source of truth — `z.toJSONSchema` derives the Gemini wire schema
so the two cannot drift — and **every response is re-validated against Zod** rather than trusted,
since a wrong metric name would silently produce a guard rule that never fires.

---

## D20 — CORRECTION: `appliesTo` holds entity names, not symbols — resolve it explicitly

The first live Gemini run produced:

```
✓ SK Hynix, Micron, Samsung Electronics: exit when drawdownBpsFromEntry > 1500
```

Company names, not on-chain symbols — so the guard could not resolve what the trigger governed.
This is correct behaviour from the compile step (D16 forbids it from knowing symbols) but the
schema never said which namespace `appliesTo` lived in, and the fixture happened to use symbols,
which hid the gap.

**Fix:** `appliesTo` is documented as beneficiary entity names matching `beneficiaries[].entity`.
`compileMandate(thesis, allocation)` resolves them to symbols via `allocation.legs[].expresses`,
and returns `ResolvedTrigger { trigger, symbols, unresolved }`. An entity with no leg — Samsung
Electronics, in that run — lands in `unresolved` and the demo prints it as `⚠ … not covered`.

**Why it matters:** a trigger that silently governs fewer assets than the user believes is
exactly the "rule that never fires" failure D15 exists to prevent. Caught only because a live
model named an entity the fixture never did — the fixture agreed with the bug.

---

## D21 — Capacity is published to the oracle, not asserted by the executor

`capacityUsdg` requires walking Uniswap V3 tick liquidity — far too expensive on-chain, and the
pools are on mainnet while the guard may be elsewhere. Two options: let the executor report it in
the fill, or publish it alongside fair value.

Publishing wins. Taking it from the executor would let the agent assert its own liquidity and
defeat the trigger; publishing puts it behind the same trust boundary, staleness rule, and
publisher allowlist the mandate already accepts for fair value. One trust boundary, not two.

`basisBps` moved to the oracle for the same reason. `FairValueOracle.Observation` now carries
both, and `publish`/`publishMany` take a `Publication` struct rather than seven parallel arrays —
which also removed the stack-too-deep that forced `via_ir`.

**Consequence:** all seven metrics in `OBSERVABLE_METRICS` are now evaluable on-chain. A metric
the compiler can emit but the guard cannot evaluate would be D15's failure mode wearing a
different hat, so `ExitTriggers.Metric` mirrors the TypeScript enum exactly and the two change
together.

---

## D22 — `decimals()` must not gate mandate creation

`createMandate` reverted on testnet because `_allowAsset` called `decimals()` on xStock addresses
that have no code there. `decimals` is only needed for portfolio-level weight checks, so coupling
every mandate to it was wrong.

Now probed with a **low-level staticcall** — Solidity inserts an `extcodesize` check before a
high-level call to a non-contract and reverts in the *caller's* frame, where `try/catch` cannot
reach it, so `try/catch` does not work here. Unknown decimals record as 0, and `_checkWeights`
reverts `DecimalsUnknown(asset)` rather than pricing a position with a guessed scale.

**Consequence:** the capability degrades loudly instead of silently. A mandate works without
weight enforcement on an asset the chain cannot describe; turning weight enforcement on against
that asset fails with a named error.

---

## D23 — Exits are never blocked; entries into a fired position are

`validateAndRecord` checks triggers only for entry fills, against the position as it stood
*before* the fills — a post-fill blended cost basis would mask exactly the case being caught
(adding to a position the thesis says to leave).

Exits are exempt. A mandate whose triggers fire but which cannot sell would be worse than having
no triggers at all. `ReceiptRegistry.Fill` gained an `isExit` flag so the two are distinguishable
in the record as well as the check.

---

## D24 — The Executor exists to make the guard binding, not to be convenient

Everything happens in one transaction: Permit2 pull → swaps → residual assertions →
`validateAndRecord`. The guard call is **last**, so a mandate violation reverts the pull and every
swap with it. There is no state in which a rule was broken and the trade stood — which is the
difference between a guard and a warning.

Non-custodial in the strict sense: funds are pulled per execution against a signed,
amount-bounded, expiring Permit2 authorisation rather than a standing allowance, swap output goes
straight to the owner (`recipient` is the owner, never this contract), and the call reverts if the
contract holds anything when it returns.

---

## D25 — Every number in a receipt is derived, including shortfall

`executionPriceE8` comes from the owner's measured balance delta, not from the router's return
value and not from anything the agent passes in.

`slippageBps` was going to be measured against an agent-supplied quote — until it became clear
that an agent could understate its own quote to make a bad fill look clean, corrupting exactly the
`performance()` figure the product sells. It is now **realised shortfall against the oracle's fair
value at execution**, zero when the fill was at or better than fair value. Slightly less precise
as a definition of "slippage"; entirely underivable by the agent, which matters more.

Distinct from the mandate's `maxDeviationBps`, which is widened by the oracle's confidence band —
this figure is not.

---

## D26 — Funds handed to the router are outside the residual check

A unit test that made the mock router keep 10% of the input passed the executor's end-of-call
residual assertion, because the retained funds sat at the **router**, not in the executor. The
user's money would have silently left the wallet without becoming a position.

`_swap` now measures the router's settlement-currency balance before and after and reverts
`ResidualBalance` on any increase. The lesson generalises: an invariant that only inspects
`address(this)` says nothing about value handed to a contract you called.

---

## D27 — Testnet cannot prove the swap path

The Universal Router has **no code** on X Layer testnet (0 bytes; it is deployed on mainnet), and
no xStock pools exist there. Permit2 *is* deployed on both.

The Executor therefore deploys and verifies on testnet, but its swap path is covered only by unit
tests against a mock router. Settling a real fill requires mainnet — this is a gap in the
evidence, not something to describe as working.

The deploy script now stands up a `TestUSDG` when the configured `CASH` address has no code, since
the Executor genuinely needs `decimals()` for its price math (unlike `PolicyGuard`, see D22).

---

## D28 — The web app is a shell over the engine, never a second implementation

The Next.js app added on 2026-08-11 (App Router, Tailwind 4, `app/`) computes nothing. Every
number it shows comes from `src/pipeline.ts`, which is a thin generator over the same modules the
CLI demos call — `planBasket`, `computeFairValue`, `checkExecution`. The page and the terminal
cannot disagree, because there is only one calculation.

Two consequences worth keeping:

- **The run is streamed, not buffered.** Each stage is slow for an honest reason (an LLM call, the
  throttled public RPC, a reference market), so `/api/run` is server-sent events and the page
  renders each stage as it lands. A spinner would hide exactly the part that is worth showing.
- **The page must be as honest as the contract.** When the oracle marks a value unpublishable the
  UI shows *withheld*, not the number — displaying it would quietly undo the refusal. wSKHYx is
  the live case: it holds a KRW figure the system refuses to publish.

Relative imports in `src/` dropped their `.js` extensions in the same change: Turbopack does not
apply the `.js` → `.ts` extension alias to these files, and `tsx` resolves extensionless
specifiers fine, so this is the one form that works for both the CLI and the bundler.

---

## D29 — Quote every leg at its own fill, not the basket's largest

The first end-to-end web run returned `0/3 would execute`. The cause was in the new pipeline, not
the planner: it priced every leg at a single test size — the largest leg's notional — so wMUx,
whose capacity is ~815 USDG, was asked about a 1,560 USDG fill and rejected for 92bp of impact
against a 50bp limit.

The planner had sized each leg to its own capacity correctly all along. The lesson is that a
guard check is only meaningful against the trade actually proposed; asking about a trade nobody
proposed produces a rejection that means nothing. Each leg is now quoted at
`floor(line.notional)` — floored so float conversion cannot land a microdollar above the capacity
the bisection solved for.

---

## D30 — Steps 7–8 stay unstarted until the loop closes on mainnet

`ThesisRegistry`, `FeeCollector`, the indexer and the ASP/x402 registration are all deferred, and
the reason is the same for each: they operate on something that does not exist yet.

- A registry of followable theses sells an **unfakeable track record**. With zero real fills there
  is no record, so the registry would list theses whose performance is exactly as trustworthy as a
  screenshot — the thing this product exists to replace.
- A fee collector takes bps of executed notional. Nothing has been executed.
- An indexer reads receipts. There are none.
- An ASP registration needs a stable hosted endpoint. There isn't one.

Depth over breadth was chosen deliberately and remains the right call for a judging criterion
called "product completeness": one alignment that holds up beats five that do not. The cost is
stated plainly rather than hidden — **the revenue model is currently a claim, not a demonstration**.

Order once a mainnet fill exists: `FeeCollector` first (smallest, and it makes the execution-fee
claim concrete in a block explorer), then `ThesisRegistry`. The indexer and the ASP registration
are roadmap items for the submission form, not build items for these ten days.

---

## D31 — Pre-mainnet audit: three defects, one missing limb

Audit of the whole system before putting real money on chain (2026-08-11). Everything below was
found by reading the code against the question "what happens when this is wrong", and every fix
carries a test that fails without it.

**1. The mandate allowlist was a list, not a set.** `_allowAsset` appended whenever
`isAllowedAsset` was false, so allow → disallow → allow pushed the asset twice. `_checkWeights`
then read the same balance twice: the doubled portfolio total shrinks every computed weight, so
the concentration cap stops binding at exactly the moment someone is toggling assets around. Fixed
with a separate `_listed` membership map. Tests: `test_ReAllowingAnAssetDoesNotDuplicateItInTheList`,
`test_WeightCapStillBindsAfterAToggle`.

**2. A published fair value of zero passed as a value.** `publish` accepted `hasValue == true`
with `fairValueE8 == 0`, and `checkExecution` then divided by it. The guard would revert with a
panic — no reason code, no way for a caller to tell "rejected" from "broken". Withholding is
expressed by `hasValue == false` and now that is the only way to express it, enforced at publish
time with `checkExecution` hardened as well for observations written earlier.

**3. `uint128(received)` was an unchecked cast.** Solidity does not check explicit casts. A
truncated amount would have been written into the receipt *and* into the position that exit
triggers measure against — wrong numbers that look deliberate. Now reverts `AmountOverflow`.

**The missing limb: nothing could call `Executor.execute`.** No Permit2 signature, no V3 path
encoding, no leg construction existed anywhere in the repo. The contract had never been called
outside a unit test, and "one real fill on mainnet" had no tooling behind it at all. `src/execute.ts`
is that tooling: quote from live depth, `dryRun` against the guard before spending gas, a Permit2
authorisation scoped to one amount and one spender with a scanned unused nonce, then execute.

Verified against the live chain rather than assumed:

- Universal Router `0x66a9…` has 39,001 bytes on 196 and exposes `execute(bytes,bytes[],uint256)`.
- Permit2 `0x0000…78BA3` has 18,307 bytes, and its on-chain `DOMAIN_SEPARATOR` equals the one
  viem computes for our signing domain — a mismatch here would fail only at execution, after gas.
- USDG at `0x4ae4…` answers `USDG` / 6 decimals.
- The V3 path encodes to 43 bytes with the fee in the middle three, for every tier.

**Also fixed:** `src/wallet.ts` centralises the chain choice behind `TARGET`, so no script can
write to testnet while believing it is on mainnet — previously each one imported `xLayerTestnet`
directly. And `src/guard.ts` no longer carries `maxOracleAge`, a field that implied a staleness
check the mirror never performed; the divergence from the contract is now stated in the file.

**Accepted, not fixed:** the oracle admin key can publish any value, and PolicyGuard trusts it.
That is the system's central trust assumption, already stated in `02-product.md`. A multisig or a
publish-time sanity bound is the real answer and it is out of scope for these ten days.

---

## D32 — Every write picks its chain from `TARGET`

`publish.ts` and `mandate-demo.ts` imported `xLayerTestnet` directly, so pointing them at mainnet
meant editing them. Both now go through `walletFor()` in `src/wallet.ts`, which reads `TARGET`
(`mainnet` | `testnet`, default testnet) and resolves the chain, the deployment addresses and the
signing key together. A script can no longer write to one chain while printing another.

Both were re-run against testnet to prove the migration, and that surfaced two things worth
keeping:

- **`pnpm publish` no longer runs our script.** Once this became a git repo, pnpm's own
  package-publishing command took the name and refused with `ERR_PNPM_GIT_UNCLEAN`. Renamed to
  `pnpm oracle:publish`. A script name that collides with a package-manager builtin is a trap for
  whoever reads the docs next.
- **The mandate demo priced its fills from hardcoded constants**, which had gone stale: wNVDAx was
  rejected for sitting 231bp from fair value — a truthful rejection of entirely the wrong thing,
  in the demo whose whole point is the capacity trigger. It now reads the oracle's current fair
  value and prices the fill there, and decodes `OracleRejected` rather than printing a raw
  selector.

Refreshing eight observations costs ~186k gas; the ~582k figure in the status doc was the first
write into cold storage slots.

---

## D33 — We model 8 of 30 xStocks, and part of that is a defect

Asked directly on 2026-08-11: do we use every xStock, or a subset? The answer needed checking
rather than recalling. Enumerating every USDG pool GeckoTerminal indexes on `x-layer`, then
spot-checking `symbol()`/`name()` on-chain, gives **30 xStocks**. `XSTOCK_SEEDS` holds **8**.

The comment in `src/chain.ts` claimed the rest were discovered from the factory at runtime. They
are not. `universe()` in `src/pipeline.ts` maps the eight seeds and stops. The comment described
an intention as though it were behaviour, which is the kind of thing that survives for months
because nobody re-reads a comment that sounds finished. Corrected.

**Why eight was the right number for the oracle.** Each asset in `ASSETS` (`src/fairvalue.ts`)
needs a *verified reference market*: which listed security the wrapper actually tracks, plus the
24/7 instruments used to carry its last close forward, plus enough return history to fit a beta.
That mapping is hand-made and it is not free — wSKHYx is the standing proof, quoting in KRW and
still not reconciling, which is why the oracle withholds its value. Adding an asset with an
unverified reference would mean publishing a number nobody can defend, which the whole design
exists to prevent.

**Why eight is wrong for the universe.** The allocator is shown only what the oracle can price,
so a thesis about Apple, TSMC, Broadcom or ASML is told *"no matching asset found"*. That is
**false** — wAAPLx, wTSMx, wAVGOx and wASMLx all exist with ~$200k pools. The system is currently
making an honest-sounding refusal that is factually untrue, which is worse than the refusals it
was designed to make.

**The fix, when there is time for it.** Separate the two questions the system is conflating:

- *What trades?* — all 30, read from the chain. That is the investable universe.
- *What can we defend a price for?* — the curated `ASSETS` list. Everything else has no
  observation, and `PolicyGuard` already rejects those with `NO_DATA`.

Then a thesis about Apple maps to wAAPLx, gets sized against its real depth, and is refused at
execution for the true reason — *we cannot yet defend a fair value for this wrapper* — instead of
the false one. Cost: 30 `loadToken` reads instead of 8 on a cold cache, and a demo that shows more
rejections. Both acceptable; the second is arguably the point.

**Done 2026-08-11.** `XSTOCKS` in `src/chain.ts` now holds all 30 and `universe()` reads every
one from the chain; `specFor()` in `src/fairvalue.ts` hands back a withheld report for any symbol
outside `ASSETS`, carrying its own note — *"tradable on X Layer, but no verified reference market
yet"* — so the refusal states the real reason instead of the private-security one. The oracle
stage no longer drops legs it cannot price, which was hiding the most interesting verdict the
guard produces.

Verified live: *"Apple and TSMC benefit as on-device AI drives a smartphone replacement cycle"*
now finds 30 assets, maps to wAAPLx 60% / wTSMx 40%, sizes them against real depth ($2,191 of
$250,000 executable), and both are refused at the guard with `NO_REFERENCE` and that sentence
attached. Before this change the same thesis was told "no matching asset" about two tokens with
~$200k pools.

---

## D34 — A search bound was being reported as a measurement

Found while re-running `pnpm capacity` over all 30 assets for D33. wGLDx printed exactly
**1,000,000** at the 5% impact limit — a round number where every other cell was ragged.

`capacity()` bisected between 0 and a hard-coded `hi = 1_000_000` USDG and opened with
`if (impactAt(hi) <= maxBps) return hi`. So for any pool deeper than the guess, the function
returned the guess. Gold's pool is ~$406k, twice a typical wrapper's, and it was the first asset
deep enough to reach the ceiling — with eight seeds, all of them thin, the bug could not surface.
It had been there since the first capacity run.

This is precisely the failure the product claims not to commit: publishing a number it cannot
defend. The real figure is **115,189**, and the universe total at 5% falls from a fictional
1,400,320 to a measured 515,340.

**The fix, and the second bug inside it.** Replacing the ceiling with "double until the pool
cannot absorb it" hangs. `simulateExactInput` only walks the tick window it prefetched, and on
running out it breaks early and returns the input it actually consumed — so impact *plateaus*
rather than rising without bound, and the doubling loop never terminates. Confirmed by watching
the run stall on wGLDx and nowhere else.

So the loop treats an exhausted window as infinite impact. A truncated swap is a **lower bound**
on impact, and a lower bound cannot justify a size. The capacity now reported is the largest size
we can prove from the state actually loaded — which is the only kind of number this system is
allowed to print.

**Consequence:** the headline capacity figure changed from ~$11k to ~$48k at 0.5%, but for two
unrelated reasons stacked together — 22 more assets (D33) and one honest ceiling (this). Both are
corrections to the same habit: describing a partial measurement as a complete one. The business
conclusion in D6 and D7 does not move.

---

## D35 — The Universal Router on X Layer cannot swap, and we shipped against it anyway

Found 2026-08-11 while trying to swap OKB into USDG to fund the mainnet deployer. Every
`V3_SWAP_EXACT_IN` through `0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af` reverts with no data —
single hop, multi hop, `payerIsUser` either way, every fee tier.

**The cause.** Uniswap's router does not look a pool up; it *derives* the address, CREATE2 from a
factory and an init-code hash both fixed at deploy time. Grepping the router's own bytecode:

```
PRESENT  canonical v3 factory  0x1F98431c8aD98523631AE4a59f267346ea31F984
PRESENT  uniswap init code hash
absent   X Layer v3 factory    0x4b2ab38dbf28d31d467aa8993f6c2585981d6804
```

X Layer uses the standard init-code hash but a **non-canonical factory** — the fact already
recorded in D1. Confirmed by deriving the WOKB/USD₮0 pool address both ways: the X Layer factory
reproduces the live pool `0xe3BE6A01…` exactly, the canonical factory produces
`0xf429D6ED…`, which has no code. So the router computes an empty address and the call reverts
with nothing to read.

**This router cannot execute a V3 swap on this chain at all.** Not a configuration we can pass
around; it is baked into deployed bytecode.

**Why it survived until now.** `01-xlayer-reality.md` listed it as "✅ canonical" and D31 recorded
it as verified. What was actually checked was that the address holds 39,001 bytes and exposes
`execute(bytes,bytes[],uint256)`. Both true, and neither is evidence that a swap works.
`Executor.t.sol` passes 9/9 against a **mock** router, which was known and written down — the gap
was treating "deployed and shaped right" as "works".

This is D1 and D5 for the third time: on this chain, a canonical address is a hypothesis. The
rule has to be that an external dependency is unverified until a call that *does the actual work*
succeeds against it — not a selector, not a codesize.

**Consequence — this blocks the mainnet fill.** `Executor._swap` funds this router and calls
`V3_SWAP_EXACT_IN`. On mainnet it will revert 100% of the time. The contract is deployed on
testnet where the router has 0 bytes, so the failure has never had a chance to appear.

**The fix, done the same day.** `contracts/V3Swapper.sol` derives the pool and answers the
callback; `Executor` inherits it and no longer knows what a router is. A `Leg` now carries a fee
tier instead of an encoded path, so there is no route left to get wrong. The constructor takes the
factory in the router's place.

Proven on mainnet before touching `Executor`: `PoolSwapper` (the same base class, deployed at
`0x20a0fB089094c6b11A7b2de5c042E1f2f50D41f5`) swapped **0.0001 OKB → 0.009506 USDG** through
WOKB/USD₮0/USDG, against a simulation that said 0.009507. One unit of USDG apart, which is the
smallest disagreement the token can express.

`Executor.t.sol`'s mock router became a mock **pool**, etched at the derived address — it pays the
recipient first and then calls back for payment, because that ordering is the reason the callback
has to exist at all. 53 tests pass.

**Also worth keeping:** `SWEEP` (command `0x04`) *does* work, because it never touches a pool.
That is how 0.0396 WOKB was recovered after a funding transfer landed and the swap did not. Any
value sent to that router is sweepable by anyone, so it must never sit there between transactions
— which is exactly the invariant `Executor`'s residual-balance check already enforces.

---

## D36 — Second pre-mainnet audit, after the swap path changed

D31 audited the stack before the first mainnet attempt. D35 then replaced the swap path, so the
audit was run again over what changed and what mainnet touches. Six gaps, all closed before any
deployment.

**1 — `Deploy.s.sol` accepted dependencies that do not exist on the target chain.** `V3_FACTORY`
and `PERMIT2` were constants, unchecked. The X Layer v3 factory has **no code on testnet**, so
deploying there produced an `Executor` that reverts on every swap and explains nothing — the exact
shape of D35. The script already applied this discipline to the settlement token and nowhere else.
Now: `require` on chain 196, a loud warning elsewhere, and a `V3_FACTORY` env override.

**2 — `int256(amountIn)` was an unchecked cast in `V3Swapper`.** The sign of `amountSpecified` is
what distinguishes exact-input from exact-output, so a wrapped amount would silently become a
request to *buy* that much. Unreachable from `Executor`, whose amounts are `uint128` — which is
also what was said about the `uint128` cast D31 found. Bounded explicitly.

**3 — `execute.ts` would price a fill from a truncated simulation.** A quote whose tick window ran
out stopped early and priced only the input it consumed, so `minAmountOut` derived from it is far
too low: slippage protection that protects nothing. Identical to the D34 defect in `capacity()`.
The quote is now refused.

**4 — Nothing checked that the pool we quoted is the pool the executor will use.** The script
found a pool through the factory; the contract derives one from the pair and fee tier. They should
agree, and if they ever did not the fill would happen somewhere the quote never looked. It is a
free read, and it is the check that would have caught D35 before it cost a transaction.

**5 — `pnpm mandate` hard-coded a 5,000 USDG blast radius.** `maxNotionalPerTrade` and
`maxFillsPerEpoch` are the ceiling on what a leaked key or a misbehaving agent can spend. Fine on
testnet, absurd on mainnet against a $3.76 balance. Now chain-aware: **25 USDG and 3 fills per day
on mainnet**, raised only on purpose via `MAX_NOTIONAL_USDG`.

**6 — wSPYx was not on the mandate's allowlist**, though it is the asset a first mainnet fill
should use: lowest gap risk of the eight priced assets. The guard would have rejected it correctly
and confusingly.

**Deliberately left as-is:** the callback does not check ERC-20 return values. The pool re-reads
its own balance after the callback and reverts if it was not paid, which is a stronger guarantee
than a bool — a token that fails silently still cannot get a swap through. Written down so it
stays a decision.

Mainnet deploy dry-run passes: settlement resolves to the real USDG, both dependencies have code,
8,328,625 gas at 0.04 gwei — about 0.00033 OKB against a 0.00998 balance.

---

## D37 — The fee is an event, not a receipt field

`FeeCollector` had to take 10–20 bps without touching `ReceiptRegistry`, because receipt #0 is the
first mainnet fill and lives in the registry already deployed. Changing the `Fill` struct would
mean a new registry and a track record split across two contracts — the opposite of the point.

So the fee is a `FeeTaken` event, indexed on mandate, and the registry is untouched.

**The subtler decision is what `amountInUsdg` records.** The fee never reaches a pool. Recording
the full pulled amount would make `executionPriceE8` describe a price no pool quoted, and — worse
— feed the guard a `slippageBps` inflated by our own fee, so `maxSlippageBps` would start
rejecting fills for a cost that is ours rather than the market's. A risk limit that trips on the
operator's own margin is not measuring risk.

So the receipt records **what was traded**: 0.49925 USDG of a 0.5 USDG notional, priced at 777.49
with 44 bps of shortfall. Confirmed on chain — 44, not the 59 it would have shown otherwise. The
0.00075 USDG fee is in the event and in the collector's balance, where it can be read and summed
without pretending to be part of the trade.

`MAX_FEE_BPS` is a `constant`. An admin who can raise the fee without limit can take the whole
trade, and a user should be able to bound their worst case from the source rather than from our
intentions. 50 is already more than twice the top of the published range. The fee rounds down so a
dust trade pays nothing rather than a rounded-up minimum, and `withdraw()` is open to anyone
because the destination is fixed.


---

## D38 — The oracle universe is now measured, not curated: 8 → 28 of 30

D33 left the oracle modelling 8 of 30 xStocks and said so honestly. But "honestly" was doing a
lot of work: 22 of those assets were withheld not because their fair value is indefensible, but
because nobody had hand-written a mapping for them. *Not yet mapped* and *cannot be defended* are
different statements, and printing the second when the first is true is the same dishonesty the
oracle exists to prevent — just pointed inward.

**The wrong way to close it** is to add `wAAPLx → AAPL` because it is obviously Apple. That is an
assertion, and the whole design rests on not publishing assertions. It would also have no answer
for wSKHYx, which is *also* obviously SK Hynix and is *also* wrong to publish.

**The fix is an admission test** — `src/reconcile.ts`, run by `pnpm reconcile`. The candidate
reference is generated mechanically from the ticker (`w<TICKER>x` → `TICKER`, two overrides), and
being mechanical is the point: naming a candidate is worthless, and the candidate then has to
survive six gates. It resolves and prints a price; it quotes in USD; the wrapper has a live pool;
**the chain's price reconciles with the reference**; there is enough aligned history to fit a
beta. The carry-forward signal is picked the same way — fitted against NQ=F, ES=F and BTC-USD,
best R² wins — so signal choice stops being a human's guess too.

**Measured 2026-08-11: 28 of 30 admitted.** Widest reconciling basis 2.0% (wIBMx). The two
rejections are the two that should be:

- **wSKHYx** — `FX_REQUIRED`. Correct reference, correct security, quotes in KRW, so the basis
  against a USDG pool is not computable. Blocked on one FX leg, and now says so.
- **wSPCXx** — `NO_CANDIDATE`. SpaceX is private.

Nothing failed on basis, which is the strongest thing the run says: admitted assets cluster inside
2% and the failures are out by orders of magnitude. `MAX_IDENTITY_BASIS_BPS` is 2,000 and the same
partition falls out anywhere between 5% and 50%, so the threshold carries no weight — a property
the script prints rather than a claim the comment makes.

**What makes a value publishable changed.** It is no longer "the symbol appears in `ASSETS`" but
`admittedOn != null` — evidence, not membership. wSKHYx sits in `ASSETS` with its reference
recorded and no `admittedOn`, so it is a documented refusal rather than a gap. `pnpm reconcile`
re-runs the test against live data and exits non-zero if an admitted mapping stops reconciling:
a wrapper that quietly stops tracking its listing is exactly what the oracle must not sleep
through, so it is a regression check on the same footing as `pnpm verify`.

**Deliberately not a gate: how well the beta fits.** wIBMx fits ES=F at R² 0.05 and wGLDx fits
NQ=F at 0.10. Both are admitted. A weak fit is not a broken mapping — it produces a wide band, a
high uncertainty term in gap risk, and a refusal at the guard on its own merits. Rejecting it here
would hide a measurable answer behind a missing one, which is the D33 mistake again.

**One behaviour regressed on purpose.** wCRCLx carried `['NQ=F', 'BTC-USD']`. The engine sums
*univariate* betas, so two correlated signals count the same move twice. The test picks one, and
for wCRCLx, wCOINx, wHOODx and wMSTRx that one is BTC-USD — the data choosing the signal, not a
human deciding Coinbase is a crypto stock.

**Verified live.** `pnpm oracle 2000` over all 30: every admitted asset now clears the oracle
gate, and the rejections are `PRICE_IMPACT` — a real, measured, chain-side limit — instead of
`NO_REFERENCE`. A 2,000 USDG buy of wSPYx, wQQQx, wNVDAx, wIWMx and wGLDx is allowed; the rest are
refused for depth, at 86–121 bp against a 50 bp mandate. Before this change, 22 of those refusals
said we had no reference market, and that was not true.

Also removed while here: `ADDRESS_BY_SYMBOL` was copied into `src/publish.ts` and
`src/oracle-demo.ts`, eight entries each. Both now call `addressBySymbol()` in `src/pool.ts`,
which joins `XSTOCKS` to the symbols the chain reports — one source, and it cannot drift.

---

## D39 — The FX leg is built, and wSKHYx still does not reconcile

wSKHYx was the one asset D38 left blocked on infrastructure rather than on evidence: the reference
was correct, the currency was KRW, and the basis against a USDG pool was not computable. That is a
real, sized piece of work, so it was done.

**The FX leg.** `toUsd()` in `src/marketdata.ts` re-expresses any foreign-quoted series in USD, and
the engine is currency-blind after it. Two details are load-bearing:

- **Yahoo quotes `C=X` as units of C per USD** — `KRW=X` is ~1418, `EUR=X` is ~0.87. Prices are
  divided by it, never multiplied. Getting that backwards is wrong by six orders of magnitude in
  one direction and plausible-looking in the other.
- **History converts at each bar's own rate; the last print converts at the rate now.** When Seoul
  is shut the equity leg is stale and the FX leg is not, so a Seoul close marked at the current
  rate is the honest USD anchor and only the equity component is carried forward.

**A daily-bar alignment defect, found and fixed while measuring.** A timestamp walk pairs a Seoul
equity bar stamped `D 00:00` with the FX bar stamped `D−1 23:00` — one session behind. Checked
rather than assumed: a daily FX bar's close matches the intraday rate at *its own* timestamp
(bar `2026-08-09 23:00` closes 1407.00, intraday there is 1407.45; 24h later it is 1417.90), so
the bar stamped `D 23:00` is the session *ending* on D, which is the one containing the Seoul
session of D. Daily conversion now matches on the date label, the same rule `alignedReturns` uses.

An earlier reading claimed this fix doubled the R² of 000660.KS against NQ=F. It did not — that
number came from a smaller sample, not a better alignment. Measured like for like, KRW returns fit
at R² 0.058 and USD returns at 0.060. **The FX conversion is correct and it barely moves the fit.**
Recorded because the wrong version is the more flattering one.

**The result the work was for: wSKHYx still fails, at −86.4%.** X Layer quotes it at **$136.93**
against an SK Hynix share worth **$1,004.97** — 1,425,000 KRW at 1417.95/USD. The reference is not
the doubtful part: Seoul and Frankfurt (`HY9H.F`, EUR) agree within **1.6%** on ~$1,008–1,025.

What that pool is pricing, we do not know, and the honest position is not to guess. One
observation, offered as evidence and not as an explanation: the wSKHYx pool holds a **single
full-range position** between ticks 210640 and 242840 with no tick structure from trading, at ~$137
— while wSPCXx, a pool with 31 initialised ticks, sits at ~$136.79. A price nobody has arbitraged
is consistent with what we see; so are other things.

**Why this is a better outcome than closing the gap.** wSKHYx moves from *"blocked on an FX leg we
have not built"* to *"converted, compared, and refused at −86.4%"*. It is the first asset to fail on
the gate that actually matters, and it makes D38's threshold argument checkable rather than
rhetorical: the widest reconciling basis is **2.0%** and the narrowest failing one is **86.4%**, a
factor of 43. `MAX_IDENTITY_BASIS_BPS` could sit anywhere across more than an order of magnitude
and admit exactly the same 28 assets.

`FX_REQUIRED` survives as a rejection reason and now means what it says — no USD rate exists for
that currency — rather than "we did not build the leg".

**Anyone holding wSKHYx on X Layer should read the number.** The system's job is to refuse, and it
does: `PolicyGuard` rejects with the sentence above attached, and `pnpm reconcile` re-checks it
every run.

---

## D40 — A multisig closes the admin half. It cannot close the publisher half.

Asked while planning the publish-time bounds: why not just use a multisig and close the
"oracle has a single admin key" gap properly? The answer needed separating two powers that
`FairValueOracle` treats as one key today but which have nothing in common:

| Power | Who calls it | How often | Multisig? |
|---|---|---|---|
| `admin` — `setPublisher`, `setMaxAge`, `setAdmin` | a human | rarely, deliberately | **yes, ideal** |
| `publisher` — `publish()` | a machine | every ~15 minutes | **no** |

Publishing is automated. Put it behind human co-signing and the oracle stops working; automate
the co-signers and their keys sit on the same box as the publisher's, which is a multisig in name
and nothing else. **So the multisig and the publish-time bound close different halves, and only
one half can be closed by a multisig.** The bound is the defence for the power that has to stay
automated — which is also the power that can permit a bad fill.

**The ordering was wrong, though, and the multisig should have come first.** `setAdmin` already
exists, so handing admin to a Safe costs **one transaction and no redeploy**. The bound needs a
new `FairValueOracle`, and `oracle` is `immutable` in both `PolicyGuard` and `Executor`, so it
drags a three-contract redeploy, new published mainnet addresses and fresh Sourcify verification
behind it. Cheap first.

**The bigger finding, which neither item was about.** Read on mainnet: `admin` == `deployer` ==
`isPublisher` == the key that holds the funds. One key is every role. Splitting them — Safe for
admin, a dedicated hot key for publishing — is a few transactions, no redeploy, and shrinks the
blast radius more than either change on its own.

**Safe is proven on X Layer, not assumed.** Bytecode exists at the canonical 1.4.1 addresses on
both 196 and 1952. That proves nothing: the Universal Router was deployed, correctly shaped and
carried the exact selector, and could not do the one thing we needed (D35). So `pnpm safe:prove`
does the actual work on testnet, and all five steps passed:

1. deploy a 2-of-3 — owners 3, threshold 2 read back from the proxy
2. hand the oracle's admin to it
3. **one approval, then execute → reverted `GS020`** — the count binds
4. **claim two approvers with one approval recorded → reverted `GS025`** — approvals are
   *verified*, not counted. Without this, step 3 alone would only prove Safe does arithmetic.
5. two real approvals → `setMaxAge` executed by the Safe, read back changed; then the Safe handed
   admin back to the deployer

Step 5's handback is deliberate: a proof run that fails halfway must never cost us admin of the
testnet oracle.

**No Safe SDK, no transaction service, no web UI.** None are proven to support X Layer and the
whole point of this entry is not to assume. `src/safe.ts` calls the singleton directly and uses
pre-validated signatures — each owner records consent on-chain with `approveHash`, and
`execTransaction` gets `r = owner, s = 0, v = 1`. More gas, zero off-chain dependencies, works
from any wallet that can send a transaction. `singletonL2` is chosen over the plain singleton
because it emits an event per executed transaction: with no transaction service on this chain,
logs are the only audit trail a Safe has.

**What this does not do.** A 2-of-3 whose three keys are held by one person is not a multisig, it
is a number in a document. The owners here are Wangsit, Nabil, and a third key held separately.
And even with it done, the gap list keeps an entry: a hot publisher key still publishes
automatically, bounded by the contract rather than by consent.

---

## D41 — The oracle bounds its own publisher, because a multisig cannot

D40 split the admin key's two powers and showed a multisig only reaches one of them. `publish()`
runs every fifteen minutes from a machine, so consent cannot gate it and the contract has to.

**The rule.** A value more than `MAX_JUMP_BPS` from the last one that took effect is not believed
on sight. It is *announced*: the observation is written with the value **withheld**, an event is
emitted, and the same value republished after `JUMP_CONFIRM_DELAY` takes effect. A confirmation
must agree with what was announced, within the ordinary bound — otherwise announcing one jump
would license publishing any other and the delay would buy nothing.

**Withheld, not reverted.** `publishMany` writes 28 assets in one transaction; one asset gapping
must not throw away the other 27. Withholding is also the vocabulary the system already speaks:
when it cannot defend a number, it declines to publish one. The rest of the observation — gap
risk, capacity, state — still lands, and those are exactly what a mandate wants at the moment the
oracle stops trusting its own price.

**Every constant is measured or argued, and none is settable.**

| Constant | Value | Why |
|---|---|---|
| `MAX_JUMP_BPS` | 2 000 | Across **14 484** one-day moves (every close-to-open gap and daily return of the 29 references over a year) 20% trips **0.159%** of them — 23 events. 15% would trip 0.42%, 30% only 0.021%. Largest legitimate move in the sample: **31.86%** (AMD). |
| `JUMP_CONFIRM_DELAY` | 30 min | Twice `maxAge`, so an asset awaiting confirmation is already stale to consumers and nothing executes against the old value either. |
| `PENDING_TTL` | 2 h | An announcement is a window, not standing permission. |
| `ANCHOR_MAX_AGE` | 1 day | `MAX_JUMP_BPS` is calibrated on one-day moves. Bounding against a week-old anchor would apply a one-day tolerance to a week of movement and withhold constantly. |
| `MAX_MAX_AGE` | 1 h | An admin who sets `maxAge` to a year makes every stale observation usable — the freshness check defeated without touching a price. |

`constant`, all of them, for the reason `MAX_FEE_BPS` is (D37): an admin who can raise a bound has
no bound.

**The bypass the design exists to close.** The obvious implementation keeps the anchor inside
`Observation`. A withheld observation zeroes the value — so publish a withhold, then any price at
all, and the bound is simply gone. `Anchor` is separate storage for exactly this, and
`test_WithholdingDoesNotEraseTheAnchor` is the test that would have caught it.

**A constant that did nothing, found by its own test.** `PENDING_TTL` was first set to 1 day, the
same as `ANCHOR_MAX_AGE`. The anchor therefore always expired first and the TTL never ran — dead
code that reads as a safeguard. The expiry test failed and said so. It is now 2 hours, and the
test asserts `PENDING_TTL < ANCHOR_MAX_AGE` so it cannot quietly become dead again.

**What this is not.** `test_APatientAttackerStillGetsThere` is in the suite on purpose: twelve
confirmed steps is an 8x. The bound **caps the rate of change and forces an event trail**; it does
not prevent a compromise. That is why it is one half and the admin multisig is the other, and why
the gap list keeps an entry rather than closing.

**Cost, paid.** `oracle` is `immutable` in both `PolicyGuard` and `Executor` — deliberately, since
a guard whose oracle can be swapped is a guard whose price source can be swapped — so a new oracle
drags the whole stack. Testnet is redeployed and all six contracts are **`exact_match` on
Sourcify**. Mainnet is not done and is a separate decision.

**Proven on chain, not only in Foundry** (89 tests pass, up from 73):

```
MAX_JUMP_BPS 2000  JUMP_CONFIRM_DELAY 1800s
anchor published        fv=100
+10% inside the bound   fv=110   hasValue=true
+82% past the bound     fv=0     hasValue=false   anchor=110  pending=200
                        gapRisk 20 and capacity 5000 survive the withhold
immediate retry         hasValue=false            (delay not served)
```

---

## D42 — Mainnet migrated: the record kept, the single key retired

D41's bound and D40's Safe both landed on mainnet on 2026-08-11. Two things had to be true at the
end: the track record must be in **one** append-only history, and no single key may still be able
to do everything.

**`Deploy.s.sol` would have destroyed the first one.** It stands up every contract from nothing,
which is right for a fresh chain and wrong for a migration: it would have deployed empty copies of
`ReceiptRegistry` and `ThesisRegistry`, stranding the three real mainnet fills and thesis #0 that
receipt #2 resolves to. The only evidence this project has that the loop closes would have been
split across two contracts — the split D37 refused when the fee was added.

`script/Migrate.s.sol` redeploys only what changed and reuses what carries history. It refuses to
start unless the deployer is the registry's admin and the named old guard is the current writer,
and it asserts `receipts.count()` is unchanged at the end. It was 3 before and 3 after.

```
FairValueOracle  0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09   new — publish bound
PolicyGuard      0x3F58df45FcB5D1074bA5D046D4928CF5efde5f4d   new
Executor         0xf3a06c9f0F1AABf01080475E420DD7A1092E1e1B   new
ReceiptRegistry  0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6   kept — 3 fills
ThesisRegistry   0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E   kept
FeeCollector     0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0   kept
```

⚠️ **Two of those addresses collide with old testnet ones.** The new mainnet `PolicyGuard` is the
address the old testnet `TestUSDG` had, and the new mainnet `Executor` is the address the old
testnet `PolicyGuard` had. Nothing is wrong — the same deployer walks the same nonce sequence on
both chains — but an address alone no longer tells you which contract you are looking at. Read the
chain id with it.

**The old guard's write permission was revoked**, deliberately: two contracts able to append to one
append-only history is two places trust can leak from, and the unwatched one is the second. The
cost, accepted by the owner rather than assumed: **mandate #1 on mainnet can no longer record
fills.** Its receipts stand; new activity needs a new mandate on the new guard.

**The single key is retired.** `pnpm handover` ran the sequence in the only safe order — grant the
new publisher, **make it publish for real**, then revoke the deployer, then hand `admin` to the
Safe. Step two exists because step three cannot be undone without the Safe, and a publisher that
turns out not to work is otherwise discovered after the old one is gone. That is D35's lesson
applied to our own key management.

```
Safe (2-of-3)  0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e   admin of oracle, receipts, fees
publisher      0x40101A4932dEb95f0A5951BB7fB0fFa7c17e3Ab8   hot key, publish() only
deployer       admin of nothing, publisher of nothing
```

Verified independently after the fact, including the negative check: `setAdmin` from the deployer
now reverts `NotAdmin`. Rehearsed end to end on testnet first, with the same three owner
addresses, so the mainnet run was a repeat rather than a first attempt. Testnet Safe:
`0x7a4EadB7d951E19d097531ea3E7Cbf00BCC34Ef3`.

**The 30-minute confirmation was proven on the real clock before any of this.** A jump announced,
withheld, and then confirmed after `JUMP_CONFIRM_DELAY` on X Layer testnet — `fv=200`,
`hasValue=true`, anchor moved, announcement cleared, tx `0x05b1c38b…`. Without that, the mainnet
oracle would have been one where a legitimate gap could be refused and never published again, and
the failure would only have appeared the first time an asset actually gapped.

**What is still true.** The publisher is a hot key. The bound caps how fast it can move a value
and forces an event trail; it does not prevent a determined holder from walking the price in
confirmed steps. The Safe covers admin only, because `publish()` runs every fifteen minutes from a
machine and consent cannot gate it. Both facts stay in the gap list.

---

## D43 — Bring-your-own-key, considered and deferred

Raised as the cheap way to close the "Claude provider has never executed" gap: let users supply
their own API key, so the path runs on someone else's account. Owner declined paying for it from
our side, which is fair. The idea is good. It is deferred anyway, for reasons worth writing down
so it is not re-argued from scratch.

**It would not have closed that gap.** The gap is not "we lack a Claude option" — it is that the
code path has never been executed. A user's key running it changes who pays, not whether it has
been proven. Marking the gap closed because BYOK exists would be the exact species of claim this
project's credibility rests on not making. (For the record, the cost objection is also not the
strong argument: a thesis compilation is 2–3k tokens, well under a cent. The strong argument is
that our shared Gemini free tier can rate-limit on demo day, and BYOK is a valve for that.)

**It crosses the seam, so it is not ten minutes.** The FE streams with `EventSource`, which can
only issue a GET and cannot set headers. A key would therefore have to travel in the query
string — into Vercel's access logs and the browser's history. Doing it safely means moving to
`fetch` + a header + manual stream reading in `app/components/useRun.ts`, which is FE-owned, plus
a settings surface. That is a Nabil-sized piece of work, and **wallet connect is worth more**: it
turns the demo from "this system computes" into "this system executes, and you press the button".

**If it is picked up later, four things are load-bearing:**

1. `pickProvider()` must take credentials as an argument instead of reading `process.env`. One
   server process serves many requests; a key read from the environment can be one user's key
   answering another user's request. That bug only appears once two people use the site at
   once — which is demo day.
2. The provider must be an **enum we compile**, never a base URL from the client. Accept a URL and
   the server becomes an open proxy to anywhere.
3. Errors must be scrubbed before they reach the client or our logs. `app/api/run/route.ts`
   currently forwards `e.message` verbatim, and provider SDKs sometimes include key fragments.
4. `sessionStorage`, not `localStorage`. For someone else's paid credential the shorter-lived
   default is the correct one.

**And it sits against our own positioning.** The product's claim is that we never hold your keys.
Asking for a bearer credential that can spend money is in tension with that even when the handling
is clean. If it ships, it ships behind an "advanced" disclosure with Gemini still the default —
never as a field on the front page. We do not ask.

---

## D44 — Full-project audit, 2026-08-11: four real findings and a stale front page

Asked for a deep audit of the whole project after D38–D43. Everything below was checked against
the live chain or the code, not read back off these documents.

### What is verifiably correct

- **Mainnet wiring.** `guard.oracle`, `guard.receipts`, `guard.cash`, and all five of
  `executor.{guard,oracle,cash,feeCollector,permit2}` point where they should.
- **Write permission.** `isWriter` is true for the new guard only — false for the old guard, the
  deployer and the Safe. Receipts count 3, unchanged by the migration.
- **Admin.** Oracle, receipts and fees all read the Safe. Fee 15 bps, treasury the deployer.
- **The new executor derives the USDG/wSPYx pool to the same address the factory reports** — the
  D35 check, repeated on the replacement rather than assumed from the old one.
- **No secrets in the repo.** Every 64-hex string in tracked files is a transaction hash or the
  pool init-code hash. `.env` is ignored, the Safe owner keys live outside the repo.
- **`pnpm verify` still passes** against live pool state, and 89 Foundry tests pass.

### Finding 1 — the new guard and executor have never carried a fill 🟠

All three real fills went through the **previous** guard and executor, which no longer hold write
permission. The replacements are deployed, verified, correctly wired, and **unproven**. This is
precisely the shape of D35: the Universal Router was deployed, correctly shaped, carried the right
selector, and could not do the work.

The swap path itself is the same compiled `V3Swapper` logic and its pool derivation checks out, so
the risk is concentrated in the parts that are genuinely new — `validateAndRecord` on the new guard
against the new oracle's data. One 1 USDG fill settles it. Until then, every claim of the form
"the loop closes on mainnet" is true of contracts that are no longer the ones deployed.

### Finding 2 — the publish bound is often in genesis mode, because publishing is manual 🟠

`ANCHOR_MAX_AGE` is 1 day: past it, the next value re-anchors freely. That is correct as designed —
a one-day tolerance cannot police a week of price movement — but it assumes a feed that is actually
being published. **Ours is published by hand.** Between demo sessions the anchor expires, and the
first publication of the next session is unbounded.

So D41's protection is real while the feed is live and absent when it is not, and the honest
reading is that the bound currently protects much less than the contract makes it look like. The
fix is not a contract change: it is publishing on a schedule. Recorded rather than quietly relied
upon.

### Finding 3 — the off-chain pipeline does not model the on-chain bound 🟡

`src/guard.ts` still mirrors `checkExecution` exactly, and `checkExecution` did not change. But the
*inputs* can now diverge: the contract may withhold a value the off-chain engine considers
publishable, so the web app can show ALLOW where the chain would answer `NO_REFERENCE`. The chain
is binding and the page is advisory, so nothing unsafe follows — but the page can be optimistic,
and that should be said rather than discovered.

### Finding 4 — the previous mainnet stack is still live, with the deployer as admin 🟡

The old oracle (`0x3659E05F…`) still exists and its admin is still the deployer, not the Safe.
Nothing consumes it — the new guard points at the new oracle, and the old guard cannot write — so
the exposure is not to us. It is that a contract bearing our name can still be written to by a
single key, and a stale integrator reading the old address would see a live, publishable oracle.
Either hand its admin to the Safe or say plainly that it is abandoned. It is now said here.

### Documentation drift, fixed

The front page was the worst of it: **README listed all five mainnet addresses as the old ones**,
claimed two fills where there are three, and described an oracle covering eight assets. A judge
reads that first. Also corrected: `03-architecture` (build order and risk list), `01-xlayer-reality`
(the `*` legend on the capacity table marked the pre-D38 eight), `06-assessment` (risk 4 was still
"one admin key can publish any fair value"), `07-team` (addresses, fill count).

`docs/04-decisions.md` is append-only, so its earlier entries still describe the world as it was.
That is the design — D31 says the admin key is accepted-not-fixed, and D40–D42 are the correction.

### Watch, not yet a finding

The oracle stage now takes **55s** for 30 assets, and the universe read another 7s. The API route's
`maxDuration` is 300s. The margin is real but thinner than before D38 doubled the number of
reference markets fetched; if Yahoo slows down, the run is what breaks.

---

## D45 — Closing D44, and the RPC error that had been lying to us

All four findings from the audit, worked one at a time. Two closed on chain, one closed in code,
one is built and needs a secret and some gas.

### Finding 1 closed — the new stack has now carried a real fill

`0xc9eba0cb05da5f00d71a63486d696a90bddc4a4f7ca3ddaab6b1acdb158f74f8` — 0.5 USDG into wTSLAx
through the new executor, new guard, new oracle. Receipt **#3**: 0.49925 USDG traded at 330.907
against a fair value of 330.647, **7 bps** of shortfall, gap risk 19. The executor's wTSLAx balance
afterwards is 0. "Deployed and verified" is now "proven".

**Getting there is the more interesting part.** The first attempt was refused:

```
guard would REJECT: SLIPPAGE
Refusing to spend gas on a transaction the guard will revert.
```

wSPYx was trading 53 bps above fair value against a mandate that tolerates 50. Republishing did not
help, because the basis is real — the pool is above fair value, and a fresher fair value says the
same thing. Checking every asset the oracle prices showed **all three assets mandate #3 allowed —
wSPYx, wMUx, wNVDAx — were 52 to 68 bps out**, and a dozen others were inside 50.

So two assets were added to the mandate (wTSLAx at 3 bps, wQQQx at 33) and the fill went through
the tightest one. **The slippage limit was not touched.** Trading a market that fits the limit is
the product; raising the limit to fit the market is the thing it exists to refuse. Recorded because
the tempting one-line alternative was right there.

### Finding 4 closed — the abandoned oracle is under the Safe

The previous mainnet oracle now has the deployer revoked as publisher and admin handed to the Safe.
Nothing consumes it. The point was that a contract carrying our name should not be writable by one
key just because we stopped using it.

### Finding 3 closed — the pipeline asks the chain

`applyOnchainWithholding()` in `src/pipeline.ts` reads the deployed observation and marks a report
unpublishable when the contract is withholding a value this engine considers fine — which the
publish bound will do whenever a move is awaiting confirmation. The page can no longer answer ALLOW
where the chain answers NO_REFERENCE.

No field crosses the FE seam: `publishable` and `notes` already exist and the page renders both. A
failed chain read is swallowed and *noted*, because a tightening must never be the reason a demo
breaks.

### Finding 2 built — publishing on a schedule

`.github/workflows/publish-oracle.yml`, every ten minutes, comfortably inside the 15-minute
`maxAge`. GitHub Actions rather than a Vercel cron deliberately: no publicly reachable endpoint
holds a key that spends gas, and there is no shared secret to misconfigure.

`pnpm oracle:publish` now prints its own gas runway and **exits non-zero below 20 runs**, because a
scheduled publisher that quietly runs out of gas is worse than a manual one — the oracle goes
stale, every on-chain check fails `STALE`, and nothing says why.

Two things it needs before it runs: `PUBLISHER_KEY` as a repository secret, and gas. At ~880k gas
a run and 0.02 gwei, ten-minute publishing costs **~0.0026 OKB/day**. The publisher holds 0.0019 —
about **105 runs, or 17 hours**. Ten days to the deadline needs roughly **0.026 OKB** in
`0x40101A4932dEb95f0A5951BB7fB0fFa7c17e3Ab8`. Topping it up is a plain transfer and needs no Safe
signatures.

### The root cause behind several confusing failures

`block is out of range` had appeared three times and been misread every time. It is not a lagging
node and it is not fee estimation. **viem's `waitForTransactionReceipt` fetches candidate blocks
with their full transaction list** so it can detect a replaced transaction, and X Layer's public RPC
intermittently refuses that call — *after* the transaction has been sent.

So a confirmed write threw, and the natural reading was that it had failed. It had not. That is how
two mandates were created by runs that appeared to fail (D44's cleanup), and it would have made the
scheduled publisher flaky in exactly the way that teaches people to ignore red builds.

`waitForReceipt()` in `src/wallet.ts` polls `eth_getTransactionReceipt` instead. We never replace
transactions, so the detection it gives up was never doing anything. Every write path now uses it.

### Two smaller things the fill turned up

- **`src/execute.ts` carried the last hardcoded copy of the universe** — eight symbols. `pnpm
  execute wTSLAx` failed with "invalid address" on an asset that has traded all along. It resolves
  through `addressBySymbol()` now, like the other scripts.
- **The fill printed `received 0 wTSLAx`** while the wallet had actually received 0.0015087. Same
  read-after-write staleness, one line later. The trade was fine and the *evidence* was wrong, which
  is the worse of the two. It polls now.

---

## D46 — A schedule that can be late is not a schedule, for a 15-minute oracle

The publisher was going to run on a GitHub Actions `schedule`. Asked directly whether Actions
lags, which was the right question.

**It does, and it is documented.** GitHub describes `schedule` as best-effort: delayed during high
load, worst at the top of every hour, and occasionally skipped entirely. Against `maxAge` of
fifteen minutes, a five-minute delay is already a stale oracle — and a stale oracle does not
degrade, it fails **every** on-chain check with `STALE`. Ten-minute cron plus routine lag means the
oracle is unusable for part of most hours, which is worse than obviously broken because it looks
intermittent.

So the cadence belongs to a process that owns its own timer. `pnpm publish:loop`
(`src/publish-loop.ts`) is a long-running worker: publish, wait, repeat, measuring the interval
from when each cycle *started* so a slow publish does not push the whole schedule later and later.
`railway.json` deploys it with `restartPolicyType: ON_FAILURE`.

**Each cycle is a child process, not an in-process call.** `publish.ts` is a top-level script that
exits when the gas runway is dead; reusing it as a module would mean either rewriting it or letting
it `process.exit` the supervisor. Spawning keeps one definition of what publishing *is*, and a
cycle that dies cannot take the loop with it. Six consecutive failures and the worker exits
non-zero — out of gas, a bad key and an hour-long RPC outage look identical from inside, and
handing the decision to the host's restart policy makes the failure visible instead of looping
quietly on a broken configuration for days.

**The Actions workflow stays, with its cron removed.** It is the manual button now, and a way to
check that the key and the runner still work when the worker is the thing under suspicion. The cron
is *absent* rather than slowed on purpose: running both on a schedule would double the gas burn for
freshness the worker already provides, and gas is the binding constraint.

### Gas is the binding constraint, and it is not covered yet

At ~880k gas a cycle and 0.02 gwei, ten-minute publishing costs **~0.0026 OKB/day**. The publisher
holds **0.00289** — 160 cycles, about **27 hours**. Ten days to the deadline needs roughly
**0.026 OKB** at `0x40101A4932dEb95f0A5951BB7fB0fFa7c17e3Ab8`. A plain transfer; no Safe
signatures. `pnpm oracle:publish` prints the runway every cycle and exits non-zero below 20, so
this fails loudly rather than going quietly stale.

### The secret was never on GitHub

Checked before running anything: no repository secret, no variable, and no environment secret on
`Production`, `Preview` or `copilot`. It was almost certainly added to **Vercel**, which is a
different store with a similarly-named field. Worth writing down because the workflow would have
failed on its first line and the obvious reading — "the workflow is broken" — would have been
wrong.

---

## D47 — The worker ships with the repo and runs near submission, not now

Asked what the publish worker is actually *for*, and whether the gas is worth it. Both fair, and
the honest answer changed the plan.

**The cost, measured rather than felt.** OKB is ~$95 (USD₮0/WOKB pool). One publish is 886,895 gas
at 0.02 gwei — 0.0000177 OKB, about **$0.0017**. Ten-minute publishing is **$0.24/day**. Not
expensive in absolute terms; expensive relative to a publisher holding $0.27 of OKB, which is the
real constraint and a different problem from the one "the gas is expensive" describes.

**Continuous publishing serves two things that need completely different cadences.**

| Purpose | Needs a publish every | Cost |
|---|---|---|
| Oracle fresh enough to execute against (`maxAge`) | 15 minutes | ~$0.24/day |
| The publish bound staying bound (`ANCHOR_MAX_AGE`) | 1 day | ~$0.003/day |

The security property is nearly free. Only execution-freshness is expensive, and **the web app does
not need it** — `pipeline.ts` computes fair value off-chain, so reckonz.vercel.app is correct with
zero publishing. What needs a fresh on-chain oracle is a real fill, and those are manual.

**Decision: deploy the worker near submission, not now.** Publish by hand around demos, the video
and any real fill. The worker stays in the repo because it is the answer to "how does this run in
production", which is worth something to a judge reading it — but running it for ten days so that
nothing observes it is burning money for an empty room.

I had framed the worker as closing an audit finding, which made it read as mandatory. It closes
D44's finding 2, and that finding is a **production** concern. Correcting my own framing rather
than leaving it to imply a deadline it does not have.

### The consequence that had to be handled

With publishing manual, the on-chain observation is stale most of the time, and `pipeline.ts` now
reads it. The obvious move — mark a stale observation unpublishable, since the chain would reject
`STALE` — is wrong, and nearly shipped.

**A withheld value is a statement about the asset: we cannot defend a price for it. A stale
observation is a statement about us: nobody published recently.** Turning the second into a
rejection would have made the page refuse *every* asset for a reason no user caused, and called it
a risk verdict. The demo would have died, which is how the mistake surfaced — but it would have
been wrong even if it had looked fine.

So staleness is a **note**, never a verdict: the decision stays what the guard would say about that
market, and the note says a real fill needs a republish first. Withholding still flips the verdict,
because that one really is about the asset.

---

## D48 — The worker gets a date, a budget, and an end

D47 said "near submission" without saying when, which is how a dated item becomes an undated one.
Fixing that, with the arithmetic in the open.

**Deploy 18–19 Aug 2026**, two to three days before submission closes. **Fund the publisher with
~$5**, as a plain transfer — the publisher is not an admin, so this needs no Safe signatures.

```
886,895 gas per publish (30 warm slots) × 0.02 gwei = 0.0000177 OKB   (D47, measured)
× 144 publishes/day                                  = 0.00255 OKB/day   ~$0.24
$5 ≈ 0.053 OKB                                       → ~21 days
```

From 19 Aug that ends around **9 Sep**. Winners are announced two to four weeks after submission,
so **the four-week case is deliberately not funded.** That is a choice, not an oversight: by
September the video is recorded, the fills are on chain, and nothing is executing. A reminder sits
at 5 Sep to top up or shut it down, because the failure we refuse is not "it stopped" but "it
stopped and nobody knew".

### Two cheaper shapes, declined

**Publish only the mandate's allowlist.** The guard never reads an observation for an asset outside
the allowlist, and the web app computes fair value off-chain, so 27 of the 30 slots have no reader
once the demo is done. Three assets is ~103k gas instead of 886,895 — an 8x, and $5 would last
months. Declined because `publish.ts` iterates all of `ASSETS` with no filter, and a
`PUBLISH_SYMBOLS` env var is a code change inside the last ten days for money we can simply pay.
**This is the thing to build if the worker ever needs to run past September**, and it is written
down here so it is not re-derived from scratch.

**Stretch the interval past 600s.** `maxAge` is 15 minutes and a publish cycle itself takes a
minute or two, so 600s exists to hold a five-minute margin against RPC lag (D18). Going to 720s
saves 17% and spends the margin. The margin is the reason the number is 600; trading it for $0.40
is the wrong direction.

### What running dry actually costs

Nothing breaks. `publish.ts` prints its runway every run and exits non-zero under 20 runs left;
`publish-loop.ts` gives up after six consecutive failures and hands the decision to the host's
restart policy. Downstream, D47 already made staleness a **note rather than a verdict**, so the
page stays correct and merely says a real fill needs a republish first. An empty publisher is a
degradation with a sentence attached, not an outage — which is the only reason a funded-to-9-Sep
plan is acceptable at all.

One caveat on the warning threshold: 20 runs is ~3.3 hours at 600s. That is fine for an attended
week and thin for an unattended month. Raising `REFUEL_AT_RUNS` to a full day was considered and
folded into the same "no code changes this close to the deadline" call; the 5 Sep reminder is the
substitute, and a human diary entry is a worse mechanism than a threshold. Recorded as a known
weakness rather than pretended away.
