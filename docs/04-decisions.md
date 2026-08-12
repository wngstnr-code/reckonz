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

---

## D49 — The competitive landscape, checked instead of assumed

`02-product.md` opens with three claims about what nobody else does. They were written from
reasoning, not from a search, and they had never been re-checked. On 2026-08-11 they were.
Two survive, one is dead, and one has become the opposite of a moat.

Method note, because D2 happened exactly this way: the X Layer numbers below come from
`curl https://api.llama.fi/protocols | jq`, parsed, not from anyone's prose summary of it. The
off-chain items come from press and are labelled as such — several of them are single-source and
marked so.

### The X Layer claim holds, and now has a number behind it

X Layer TVL **$116,395,074**. **56 protocols** listed, by category:

```
26  Dexs                     3  Launchpad          1  Bridge Aggregator
10  Bridge (incl. x-chain)   3  Liquidity Manager  1  CEX
 6  Lending                  2  Yield              1  CeDeFi
 3  Derivatives                                    1  Onchain Capital Allocator
```

A filter for `RWA|Asset|Index|Portfolio|Yield Agg` returns **nothing**. Top of book:

```
Aave V3       $81,808,601        PotatoSwap V2  $5,262,804
Uniswap V3    $22,938,900        Curve DEX      $2,695,851
Gate           $6,753,538
```

The four things closest to an application layer are all dead on this chain: Spark Liquidity Layer
(`Onchain Capital Allocator`) **$0**; Steer **$81**, DefiEdge **$133**, Gamma **$3** — and those
three manage Uniswap LP positions, not portfolios; Satori Perp **$0**, D8X **$0.0002**, Fufuture
**$0**, so there is no live hedging venue either. Dolomite **$746**, ZeroLend **$7,181**:
multi-chain deployments that arrived automatically and were never used.

So "no application layer" is not a rhetorical flourish. Nobody has tried and failed here either.
The primitives are complete — Uniswap landed 19 Jan 2026, Aave 30 Mar 2026 (v3.6) — and the layer
above them is empty. The chain's DeFi ecosystem is about seven months old, which is the actual
explanation.

### The market-hours claim is half dead

`02-product.md` says these assets spend ~80% of the week with "no reference price and **no way to
hedge or redeem**". The redeem half is no longer true of the category. **Ondo** — renamed from Ondo
Global Markets to **Ondo Stocks** — crossed **$1B TVL on 11 May 2026**, the first tokenised-equity
platform to do so, and launched **24/7 mint and redemption in June 2026**. 430+ assets across
Ethereum, BNB Chain and Solana, bridgeable to HyperEVM, distributed through MetaMask. On 27 Jul
2026 they abandoned their planned L1 and shipped **Ondo Network**, an execution layer splitting
execution, verification and settlement.

The gap is therefore a *venue* condition, not an industry one. It is still true on X Layer, where
the only route is a ~$200k AMM pool. Sell it that way. Selling it as a structural fact about
tokenised equities invites a judge who has read the Ondo release to discount everything else.

### "We publish uncertainty" was never the differentiator

**Pyth** ships an aggregate confidence interval with every update, and on **30 Jun 2026 Nasdaq
selected Pyth to distribute the TotalView order book across chains**. Publishing a fair value with
its uncertainty is table stakes and about to be tier-1 sourced.

What no one does is *act* on it. Two 2026 events show the cost of that gap:

- **22 May 2026** — Pythnet validators halted, block production stopped for **over four hours**,
  feeds went stale across 100+ chains simultaneously. Pythnet is proof-of-authority with a small
  validator set: one failure point at the aggregation layer.
- **Ventuals** fell **~45%** on faulty oracle data and liquidated hundreds of positions.

Both are arguments *for* this codebase, and better ones than the current framing. The claim to
make is not "we produce a fair value" — Pyth produces a better one. It is **we refuse to execute
against a number we cannot defend**, which is the layer that was missing in May and cost real
money. `guard.ts` / `FairValueOracle.checkExecution` is the product; the estimate is an input.

### The pitch line no longer separates us from anything

`02-product.md` closes on "the AI's key can only call `proposeRebalance()`… that single sentence
separates this from every AI agent that trades for you". As of 2026 it separates us from nothing:

- Non-custodial smart account + **session keys** + a policy engine enforcing limits, whitelists
  and spend ceilings, with an audit log and a user kill-switch, is the **default** agent pattern.
- **Giza**: session keys and smart accounts, guardrails that never touch principal —
  **$3.96B of agentic volume as of March 2026**.
- **Almanak**: peak TVL **$132M** (Dec 2025), 100k+ users, ~$6M annualised vault revenue.
- **Coinbase** shipped **Agentic Wallets** as a developer-platform product.
- **Safe + Zodiac Roles** has offered call-level, parameter-bounded permissions for years.

What is still ours is not *that* execution is bounded but *what* it is bounded on: every product
above bounds destination and size. None bounds on **price defensibility and market depth**. Rewrite
the pitch line around that, or it will be met by a judge who has integrated one of these.

### The venue arrived before we did — and it belongs to the host

This is the finding with the most consequences, and none of it was known when `02-product.md` was
written.

**xStocks** shipped **xChange**, described by them as a *"multi-chain execution layer for tokenized
equity trading"*: 70+ tokenised stocks, liquidity through **0x RFQ straight to market makers**
rather than aggregators, running **24/5**. Ethereum and Solana; **X Layer is not mentioned**.
Platform totals: **$3.5B onchain volume, $25B across exchanges, $225M tokenised assets onchain,
80,000 unique onchain holders**. (The one article found gave internally inconsistent launch dates,
so no date is recorded here.)

RFQ matters more than the name does. Our entire capacity argument — ~$48k across 30 assets at 0.5%
impact — is an argument about **AMM pool depth**. Market-maker RFQ is not bounded by pool depth. If
xChange reaches X Layer, the sizing half of the product loses much of its reason to exist while the
gap-risk half survives intact. Worth watching as an early-warning signal, not a reason to change
anything now.

**And OKX has already built the custodial version.** `Unified Tokenized Stocks` is live: 40+
tokenised US stocks and ETFs (XNVDA, XAAPL, XTSLA) against USDT, on a **shared order book that
merges different issuers' versions of the same stock into one market, "starting with xStocks"**,
trading 24/7, with deposits and withdrawals on **X Layer and Solana**. US and EU users excluded;
eligible regions are SEA, Northeast Asia, CIS, MENA and Türkiye.

Behind it sits a real partnership, not a rumour. **X Layer × xStocks** brings tokenised equities and
a **Fast-Listing Mechanism** — high-demand stocks and thematic ETFs tokenised and tradable 24/7
without waiting on brokerage onboarding — into the OKX Wallet ecosystem, on top of xStocks' **$31B
cumulative issuance**, with assets integrated into X Layer progressively. OKX's CEO, on the record:

> *"Looking forward to seeing xStocks on X Layer, bringing tokenized equities and RWA assets into
> the ecosystem."* — and separately, *"tokenized stocks are one of the most important use cases
> for RWA."*

The hardest confirmation is ours, though, and it predates the search: **32 assets in `ASSETS` carry
`admittedOn: 2026-08-11`**, meaning each wrapper's on-chain price reconciled against its reference
under `pnpm reconcile`. The partnership is not a press question. The tokens price correctly on our
own chain reads.

### ICE, NYSE and OKX — the strategic context

Around **23 Jun 2026**, **ICE — the parent of NYSE — invested in OKX at a $25B valuation and formed
a joint venture to put tokenised NYSE stocks on-chain.**

This cuts both ways and both need saying.

**For us:** the judges are OKX. This project is the non-custodial application layer for tokenised
equities on OKX's own chain, in the exact category where OKX has just made its largest strategic
bet with the parent of the NYSE. That is a slide, and it was not available a month ago.

**Against us:** OKX's own order book gives retail 24/7 trading of the same assets with market-maker
depth, no gas and no fees. For an ordinary buyer that is strictly better than a $200k AMM pool. And
because X Layer deposits and withdrawals are open, arbitrage flows between the two, which over time
deepens the pools and erodes the $48k premise the product is built on.

### What actually changes

Nothing in `src/` or `contracts/`. Three things in how this is described:

1. **Stop selling the market-hours gap as an industry problem.** Ondo closed the redemption half.
   It is a condition of this venue.
2. **Rewrite the pitch line.** Bounded agent execution is commodity. Bounding on price
   defensibility and market depth is not.
3. **Never position against the venue.** OKX's order book beats us on price, depth and gas, in
   front of the people who built it. The four things it structurally cannot offer are: custody
   stays with the user, execution bounded by a contract rather than an internal policy, an
   unfakeable on-chain receipt, and a refusal to trade in a high-gap-risk window — an exchange
   will never decline a user's trade, because that trade is its revenue.

The honest one-line position: **not a competing venue, the discipline layer above one.**

### Not verified

Recorded so nobody repeats the search believing it was done. The fee-free / zero-gas tokenised
stock trading via X Layer story returned HTTP 403 and was never read. The exact date of the
X Layer × xStocks announcement is unconfirmed — the primary write-up 403s, and it is corroborated
only by secondary coverage plus the CEO post. Whether **dHEDGE**, **Enzyme** and **Reserve Index
DTFs** are still live as comparables for the thesis-subscription model is unchecked; they are cited
from memory, not from a source.

---

## D50 — Follow copies the fills, not the thesis text; auto-DCA is dropped

Simple mode was one line in the build order — "browse published theses with real on-chain track
records, one-tap follow in USDG, auto-DCA" — and it hid two very different problems.

### The basket comes from `ReceiptRegistry`, not from IPFS

Every thesis published so far carries `cid = ""`. `thesis-publish.ts` writes an empty CID on
purpose: there is nowhere to pin, and publishing a CID that resolves to nothing is worse than
publishing none. That looked like a blocker for Follow — a follower cannot copy reasoning they
cannot read.

It is not one. Every `Fill` records its `asset` and `amountInUsdg`, so the set of fills under a
`thesisHash` **is** the basket, and its weights fall out of the notional. A follower copies what
was actually executed rather than what was claimed, which is both the cheaper implementation and
the stronger one: the text is a claim, the fills are the half that cannot be rewritten.

`src/track-record.ts` therefore derives weights from settled entry fills, and pinning becomes an
enhancement to the *display* rather than a dependency of the *feature*.

Two rules fell out of writing it. Weights are computed over **entries only** — an exit is a
decision to leave, not a smaller allocation, and putting it in the denominator misreports what a
follower is being asked to copy. And slippage is weighted by notional, not averaged per fill: a
$0.25 fill and a $2,000 fill are not one datum each.

`performance()` on `ReceiptRegistry` is not used, because it is keyed by `mandateId`. It answers
"how did this mandate do". Simple mode asks "how did this *thesis* do", across every mandate that
followed it — so the aggregation groups by hash and ignores mandates entirely.

### Follow needs no new contract

The mandate architecture already is what Follow wants. A follower calls `createMandate` from their
own wallet, so they are `owner`; their funds never move to us; `PolicyGuard` bounds them under
their own `Policy`, not the author's. The agent sizes legs to *their* notional through the planner
— mandatory, not ceremonial, since the original thesis executed at $0.50 and the depth that
absorbs $0.50 is not the depth that absorbs $2,000. The resulting receipt carries the same
`thesisHash`, so a follower's execution lands back in the same track record. The loop closes.

`Policy` has no weights field. It holds bounds. Anyone reading "copy the weights into the policy"
has the wrong model.

### Auto-DCA is dropped, and the reason is infrastructure

`Executor._pull` uses Permit2 **SignatureTransfer**: single-use nonce, deadline, a fresh EIP-712
signature per execution. `execute.ts` sets a 20-minute deadline. Recurring unattended execution
cannot sit on that.

The fix is *not* migrating to AllowanceTransfer — that trades a per-execution spending cap for a
standing allowance, which is a real weakening of the one safety property this system leads with,
in a contract with live mainnet fills. The cheaper path is pre-signing: Permit2 nonces are an
unordered bitmap and deadlines are free, so a user could sign twelve permits in one sitting with
staggered deadlines, each capped in amount, each revocable by invalidating its nonce.

That path needs somewhere to store twelve signatures and a worker to spend them. This repo has no
database, and the publish worker — the one scheduled process we already planned — is not running
yet. Building storage plus a scheduler before 21 Aug, to serve a feature whose UX is "sign twelve
times" rather than the "one-tap" the architecture doc promised, is the wrong use of the remaining
days.

**Consequence:** Simple mode for this submission is *browse a track record, then follow it once at
your own size*. Auto-DCA leaves the build order and becomes a roadmap item. `03-architecture.md`
is corrected accordingly — it had promised one-tap follow and auto-DCA in the same breath, and only
the first is real.

### What the chain actually holds, as of 2026-08-12

Worth writing down, because the feature was scoped against an imagined dataset and the real one is
thinner: **one** thesis, and of four receipts only **#2** carries its hash — a single wSPYx entry
of 0.49925 USDG at 45 bps. The other three were executed before there was a thesis to bind them to,
and `loadRegistry()` reports them as `unattributed` rather than folding them in. A track record
page that showed only the attributed fills would claim more discipline than the chain shows.

---

## D51 — The executor could never sell, and the guard's own comment said that was unacceptable

Found 2026-08-12 while trying to prove an exit with $0.10 of wSPYx.

`Executor` had no exit path at all. Not a bug in one — there was none:

- `Leg` carries only `amountInUsdg`, "settlement currency to spend". No field ever named a
  quantity of the asset.
- `_pull` reverts `PermitMismatch` for any permitted token that is not `cash`.
- `_swap` calls `_swapHop(cash, leg.asset, …)` — the direction is written into the call.
- `fill.isExit` was the literal `false`.

Everything *around* it was built for exits and had been for weeks. `ReceiptRegistry.Fill` has
`isExit`. `ExitTriggers.applyFill` decrements a position when it is set. `PolicyGuard.
validateAndRecord` accepts it, and skips the trigger check for exits with this comment already in
the file:

> Exits are never blocked: a mandate whose triggers fire but which cannot sell would be worse than
> having no triggers at all.

Which is exactly what we had shipped. The triggers fired into `firedTriggers()` and nothing could
act on them. A guard that can only ever say *do not buy more* is not risk tooling, and the page
header has been claiming "enforces the exits on chain" throughout.

**Consequence:** `Executor.exit()` — the mirror of `execute()`. `ExitLeg` denominates the amount in
the asset; `_pullAssets` permits the asset and explicitly refuses `cash`, so an exit signature can
never move the user's settlement currency; proceeds route through the contract so the fee can be
split off them, and the residual-balance assertion that already existed now covers a path that
genuinely does hold cash for an instant. `PolicyGuard` needed no change. Nine tests, suite 89 → 98.

### The inverted comparison, which would have been invisible

`_shortfallBps` returns 0 when `priceE8 <= fairValue`. That is right for a buy — paying *above*
fair value is the harm. Reused for an exit it is exactly backwards: a position dumped 30% under
fair value would have recorded **0 bps** of slippage, and `PolicyGuard`'s `maxSlippageBps` would
never once have bound on an exit while appearing to work. `_exitShortfallBps` inverts it, and
`test_ExitShortfallIsMeasuredBelowFairValue` is the regression.

Third defect of the same family after D31 and D36: the code was reachable, plausible, and wrong in
a direction no test was looking in.

### Still open, and worse than it looks: the oracle can block an exit

`validateAndRecord` calls `oracle.checkExecution` for **every** fill, exits included. So an exit is
refused when the observation is `STALE`, `NO_REFERENCE`, or `gapRisk > maxGapRisk`.

Two consequences we have not fixed:

1. **A gap-risk trigger fires precisely when the gap-risk check refuses the exit.** The mandate
   tells you to leave and the guard will not let you.
2. **When the publisher runs dry, nobody can sell.** D47 called running dry "a degradation rather
   than an outage" because the guard refuses *new* fills. That was only half the story: after
   `maxAge` the exits stop too. The funding date in `05-status.md` is therefore not just about
   entering positions.

Fixing this means changing `PolicyGuard`, and `guard` is `immutable` in `Executor` — so it is a
two-contract redeploy plus a `setWriter` on the registry and a `setExecutor` on every live mandate.
Recorded here rather than done in the same change as the exit path, and rather than being
discovered by a user who could not get out.

**Observed the same hour it was written down.** The first real exit attempt — $0.10 of wSPYx on
mainnet, 2026-08-12 — never reached the guard. `FairValueOracle.observation` reverted `Stale`:

```
updatedAt 1786440877   now 1786493595   age 14.7h   maxAge 900s
```

The value itself was in good shape — `hasValue`, fair value 772.93, gapRisk 9, confidence 20 bps.
Only its age was wrong, because nothing publishes yet: the worker is written, the publisher key
`0x40101A49…` holds 0.00287 OKB and is authorised, and it has simply never been brought up.

So the position could not be sold, and the reason had nothing to do with the market. `pnpm
capacity` says the pool absorbs $1 at a flat 40 bps with zero ticks crossed. The chain was ready;
our own oracle was the thing standing in the way.

That is the argument for funding the publisher stated more sharply than D47 or D48 managed:
**an oracle that stops publishing does not merely pause new positions, it traps the open ones.**

`src/exit.ts` now reads through `peek` and refuses with that sentence rather than letting viem
throw a stack trace — a refusal this system is supposed to explain is not an exception.

### Then it worked, on mainnet

One `pnpm oracle:publish` later — 30 observations, one transaction, 893,360 gas — the same command
went through. **Receipt #4**, tx `0x769edd3b…`:

| | |
|---|---|
| `isExit` | **true** — the first exit fill that has ever existed here |
| sold | 0.000129742860900606 wSPYx |
| received | 0.100466 USDG gross, **0.100316 net** of the 15 bps fee |
| price | 774.347 against a fair value of 770.755 — *above* it |
| `slippageBps` | **0**, and that is the correct answer: selling above fair value is not a shortfall |
| executor residuals | 0 USDG, 0 wSPYx — the non-custodial assertion held on the new path too |

The inverted comparison earned its place immediately: this fill landed above fair value, and
`_shortfallBps` would also have returned 0 here. The two only disagree below fair value, which is
exactly where a test rather than a lucky first trade has to be the evidence —
`test_ExitShortfallIsMeasuredBelowFairValue`.

**One thing this did not prove.** The position it decremented was already zero: the wSPYx was
bought under mandate #1 and sold under mandate #3, and `ExitTriggers.applyFill` clamps rather than
underflowing. So the execution path is proven end to end on mainnet; the position accounting for
this particular fill was a no-op, and it is the unit tests that cover that half.

---

## D52 — A sweep for more exits: what is claimed, what is reachable, what is fiction

D51 was found by trying to do something the docs said the system did. That is a bad way to find
out. So on 2026-08-12 every external contract function was checked against whether any product
path reaches it, and every load-bearing claim in `README.md`, `CLAUDE.md` and `03-architecture.md`
was checked against the code. Method, so it can be repeated: enumerate `function` declarations per
contract, grep `src/` and `app/` for each name, and treat "only referenced in `abi.ts` and tests"
as unreachable.

### Fiction — described in the docs, never in the code

**`proposeRebalance()` does not exist and never did.** It is named in `CLAUDE.md` under
**Non-negotiables** — "Agent keys call `proposeRebalance()` only" — and in `03-architecture.md` as
the invariant of the whole agent design. `grep -rn proposeRebalance contracts src app test script`
returns nothing.

The security property it describes is real, and is arguably stronger than the sentence claimed.
What enforces it is Permit2: `execute` and `exit` pull against a signature the **owner** produced,
scoped to one token, capped in amount, expiring in twenty minutes. An agent key holding no fresh
signature can move nothing whatsoever. But an auditor reading our own non-negotiables would go
looking for a function that is not there, and finding it missing is a worse first impression than
never having claimed it.

Two more of the same kind, both in `03-architecture.md`:

- The `PolicyGuard` field list named `maxTradesPerEpoch`, `maxOracleStaleness` and
  `maxGapRiskScore`. The real names are `maxFillsPerEpoch`, `maxGapRisk`, and *nothing* — staleness
  is `maxAge` on the oracle, global rather than per-mandate. `maxDeviationBps` and `enforceWeights`
  were missing entirely.
- The `ReceiptRegistry` entry was described as `basketId, epoch, actionType, targetWeights[]`. None
  of those four fields exist. The real record is per-fill.

### Built, but no product path reaches it

Not bugs. Each is a capability the contracts have and no user can invoke, which is precisely the
shape D51 had before anyone tried.

| Function | Why it matters |
|---|---|
| `PolicyGuard.setCircuitBreaker` | The **owner kill switch**, and its own comment calls it that. Reachable from tests only. A user who wants to stop their mandate right now cannot. |
| `FeeCollector.withdraw` | **The revenue has no way out.** 0.0024 USDG has accrued and there is no script or button that collects it. |
| `FeeCollector.setFeeBps` / `setTreasury` | No path. Related: **`treasury` is still the deployer EOA** while admin is the Safe — the control moved and the payout address did not. |
| `PolicyGuard.closeMandate` / `updatePolicy` / `setAgent` / `setAssetAllowed` | Mandates are create-only from the UI. Every later adjustment is a `cast send`. |
| `PolicyGuard.getPosition` / `getTriggers` | Nothing surfaces a user's own position or the rules bounding it. `pnpm mandate` prints them once at creation and never again. |
| `ReceiptRegistry.performance` / `receiptsOf`, `ThesisRegistry.thesesOf` / `authorOf` | Unused view surface. Harmless, but `performance()` in particular reads like the track-record API and is not the one Simple mode uses — see D50 for why. |

`setTriggers` is reachable from `pnpm mandate` only, so **exit triggers cannot be installed or
changed from the web app** — the rules that bound a mandate are CLI-only.

### Stale claims, now corrected

- `README.md` listed the **old executor address**, "four real fills", and "89 tests".
- `05-status.md` said the **Safe mainnet handover was pending**. It is done — read back
  2026-08-12, `admin()` on the oracle, the receipt registry and the fee collector all return the
  Safe. The doc was claiming *less* than the truth, which is rarer and still wrong.
- `05-status.md` said the capacity trigger was "already firing for wMUx". `firedTriggers(3)`
  returns empty after the 2026-08-12 publish, because capacity on every allowed asset is above the
  1,000 USDG threshold.
- `03-architecture.md` promised "Evidence: IPFS, hash on-chain". `evidenceHash` is zero and
  `evidenceCID` is `''` in every receipt ever written.
- `03-architecture.md` said Yahoo "must be replaced before mainnet". Mainnet has been live since
  2026-08-11 on Yahoo-derived values. The rule was broken rather than kept, and now says so.

### Checked and sound

Recorded so the next sweep does not redo them. All seven `ExitTriggers` metrics are implemented,
not just enumerated. `src/guard.ts` still mirrors `checkExecution` faithfully — it models no
`isExit` because `checkExecution` itself does not branch on direction. Every `pnpm` command in
`CLAUDE.md` exists in `package.json`. `pnpm verify` passes against live pool state and
`pnpm verify:abi` reports every exported selector present.

**Consequence:** the kill switch and the fee withdrawal are the two that should not ship
unreachable — one is a safety control we advertise, the other is the revenue story. Both are small
scripts. Neither is done yet, and they are listed in `05-status.md § Not done` rather than left
implied by a contract that happens to have the function.

---

## D53 — The kill switch stops exits too, and that is the right answer

Making `setCircuitBreaker` reachable (D52) raised the question D51 had just made unavoidable: does
the breaker block exits? It does — `if (m.circuitBreaker) revert Tripped();` sits at the top of
`validateAndRecord`, above the loop that skips the trigger check for exits.

The first instinct was that this is D51 again. It is not, and the difference is worth stating
because someone will later be tempted to "fix" it.

**A fired trigger must never block an exit.** The trigger is the mandate saying *leave*. A rule
that fires and then prevents you acting on it is worse than no rule, which is what `PolicyGuard`'s
own comment has said all along.

**A tripped breaker is the owner saying stop everything**, and the threat it exists for is an
agent that has gone wrong — compromised key, prompt injection, a bug in our sizing. An attacker
who can only sell is still an attacker: they can dump a position into a market of their choosing
at a moment of their choosing. A breaker that let exits through would leave that door open in
exactly the situation it was pressed for.

What makes it acceptable is custody, and only custody. The assets are in the owner's own wallet
(D6). Any DEX will still trade them. The breaker stops *this system* acting on the owner's behalf;
it does not stop the owner. That sentence is now printed by `pnpm breaker` at the moment of
pressing, because a user tripping a switch deserves to know what it does before the transaction
rather than after.

Pinned by `test_CircuitBreakerStopsExitsToo`, which also asserts that releasing it puts the exit
back within reach. Suite 98 → 99.

**Consequence:** two safety semantics that look identical from outside are now distinguished in
the tests and in the docs. Trigger fires → exits always allowed. Breaker tripped → nothing allowed,
and the owner keeps their tokens regardless.

**Proven on mainnet the same day.** `pnpm breaker 3 on` then `off` — `0xd205be47…` and
`0xd57d1756…`, 30,593 and 30,581 gas, each confirmed by reading the state back rather than
trusting the receipt. `pnpm fees withdraw` swept `0x5004b6fa…`: the collector went to **0 USDG**
and 0.0024 landed at the treasury. Small money, and the first this project has collected rather
than merely accrued — the revenue path is now closed end to end, from a 15 bps fill to a balance
somewhere that is not a contract.

---

## D54 — A mandate you cannot see or change is not a mandate

D52 listed five owner-only functions with no caller — `closeMandate`, `updatePolicy`, `setAgent`,
`setAssetAllowed`, `setTriggers` — and two views nothing read, `getPosition` and `getTriggers`.
Together they meant a mandate was **create-once**: the rules bounding it could never be tightened,
the agent could never be rotated, it could never be shut, and its owner could not see what it held
or what governed it. `pnpm mandate` printed the triggers at creation and never again.

**Consequence:** `pnpm mandate:show` (read-only, never sends a transaction), `pnpm mandate:edit`
(every mutation, owner-checked before gas, state polled back after), and
`app/components/MandateManage.tsx` for the browser. The read/write split is two files on purpose —
a typo while looking at a mandate should not be able to change one.

### `setTriggers` replaces wholesale, so "add" had to mean add

The contract has no append. A naive `setTriggers(id, [newOne])` silently deletes every rule already
installed, and the user's mandate quietly stops having exit rules at the moment they thought they
were adding one. Both the CLI and the panel read the existing set first and write it back with the
new entry appended. `trigger clear` is the only path that removes anything, and it prints what it
is about to remove.

### The encoder that was never written

The larger find. `compileMandate` produces `ResolvedTrigger[]` — metric *name*, a `number`
threshold, and entity *symbols*. `setTriggers` takes `{uint8 metric, uint8 comparator, int256
threshold, address[] assets}`. **Nothing in the repo converted between them.** `mandate-demo.ts`
hand-wrote `{ metric: 5, comparator: 1, threshold: 1_000_000000n, assets: [] }`, and the second
caller would have hand-written its own.

So the product's central claim — *the same LLM output produces the entry and the risk rules* —
stopped one step short of the chain, in the same way `Executor` stopped one step short of an exit
(D51). Same shape: two sides built, no join.

`src/triggers.ts` is that join, and it is the only place a threshold is scaled. **Only
`capacityUsdg` is denominated in the settlement currency**; every other metric in
`ExitTriggers.evaluate` compares against a raw integer — a 0–100 score, basis points, hours. A
capacity threshold scaled wrong is off by a factor of a million and simply never fires, which is
the worst failure mode available: a rule that exists, reads correctly in the UI, and does nothing.

One deliberate refusal in the encoder: a compiled trigger scoped to assets that are all outside the
mandate's allowlist is **dropped and reported**, never emptied to `[]`. An empty `assets` array
means basket-wide to the contract, so quietly emptying one would widen a rule from a single asset
to every asset — the opposite of what the thesis said.

### Verified

`pnpm mandate:show 3` against mainnet reads the live policy, all five allowed assets with their
recorded positions, the one installed trigger decoded back to `basket: exit when capacityUsdg <
1000 USDG` — which round-trips the scaling against a threshold written by a different code path —
and the D51 staleness warning, which was already true again an hour after publishing. Every refusal
path in `mandate:edit` was exercised: unknown action, closed mandate, unknown metric, an asset off
the allowlist, an unknown policy key.

---

## D55 — The fee now lands in the Safe, and the multisig is no longer decorative

`FeeCollector.setTreasury` and `setFeeBps` are `onlyAdmin`, admin became the 2-of-3 Safe in D42,
and nothing in this repo could produce a Safe transaction. So the payout address was never moved:
D42 relocated the *control* and left the *money* pointing at the deployer's EOA, and D52 found it
only by enumerating functions nobody called.

Worse than the gap itself was what the chain showed underneath it. **The Safe's `nonce()` was 0.**
It had administered three contracts since 2026-08-11 and had never executed a single transaction.
A multisig that has never been exercised is a multisig nobody has proved they can still sign with —
and both co-owner addresses were undocumented in `docs/`, `src/` and `script/`, while
`safe-prove.ts` builds its co-owners from `generatePrivateKey()`. If mainnet had been set up the
same way, two of three keys would have been gone and every admin function frozen for good. It had
not been; the owner holds all three. The question was worth asking before assuming.

**Consequence:** `pnpm safe:admin status|treasury|feebps`. It reads the Safe *from the contract it
administers* rather than from a constant, so it cannot approve hashes against a Safe that is no
longer the admin. Owner keys come from the environment only — a private key on a command line
survives in shell history. Whatever keys are present approve on chain; when that is not enough it
prints the exact hash a co-signer must approve and changes nothing, which is the real multisig
workflow rather than a pretence that two keys on one laptop are two people.

Run 2026-08-12, and it is the Safe's first mainnet transaction ever:

```
setTreasury(0x98d19BE6…)   safe nonce 0 -> 1
approve owner 1  0xe4170827…
approve owner 2  0xf3830dee…
execute          0xb49827b1…
FeeCollector.treasury = 0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e   (the Safe)
```

`withdraw()` stays callable by anyone, so fees can still be swept by anybody — they now land in
the 2-of-3 rather than in one key. The cost is symmetric and worth stating: getting money *out*
of the Safe needs two signatures too. That is the trade, and it is the right one for an address
that accumulates other people's fees.

`setFeeBps` was left at 15, which is where it should be. It shares this path exactly; the refusal
cases are covered instead — over `MAX_FEE_BPS` it refuses before spending the Safe's nonce on a
transaction that would revert, and setting the value it already has does nothing.

### The part that is still not solved

Both keys used above sat in one `.env` on one machine. For the duration of that run the 2-of-3 was
a 1-of-1: one compromised laptop is the whole threshold. The multisig's value comes entirely from
the keys being in different places, and nothing in the code can enforce that. `SAFE_OWNER_2_KEY`
should come out of `.env` and live somewhere else between admin actions — recorded here because it
is an operational discipline, and those are exactly the ones that quietly lapse.

---

## D56 — The oracle stops being able to trap a position, and one incident on the way

D51 recorded that `validateAndRecord` ran `oracle.checkExecution` on every fill including exits, so
a stale or high-gap-risk observation refused the sale as well as the purchase. Two consequences
were named there: a gap-risk trigger fires exactly when the gap-risk check blocks the exit it is
demanding, and an unfunded publisher stops people getting **out**, not merely in. This is the fix.

**The rule now:** the oracle binds on entry and is advisory on exit. What still bounds an exit is
`maxSlippageBps` against the shortfall the executor measured, `maxNotionalPerTrade` against the
proceeds, the allowlist, the circuit breaker, and the `minAmountOutUsdg` floor the owner signed
into the leg. That last one is the only protection that does not depend on the oracle at all, and
when there is no defensible fair value it is the whole of the price protection — a weaker guarantee
than an entry gets, and a far better outcome than being unable to sell.

### Three versions of the same trap, found by writing the tests

1. **`peek` hands back a stale value with `hasValue` still true.** The first draft of
   `_exitShortfallBps` measured against it, which computes a shortfall from a price the oracle
   refuses to stand behind. If the value is stale *because the market moved*, that shortfall is
   enormous and false, and `maxSlippageBps` locks the position in. The trap rebuilt one layer down.
   Now `try observation()`: if the oracle will not vouch for it, nothing is measured against it.
2. **`_checkWeights` prices the portfolio through `fairValue`, which reverts on stale.** Left
   running, any mandate with `enforceWeights` on would still have been unable to exit. It is now
   skipped when every fill is an exit — selling reduces an asset's weight and raises cash, so
   neither bound can be breached by leaving. A mixed batch still runs it.
3. **An entry against a stale oracle reverted with a raw `Stale()` from inside the executor**,
   before the guard could produce `OracleRejected(asset, "STALE")`. Same refusal, worse sentence.
   `_shortfallBps` now tolerates the revert and lets the guard do the rejecting.

`IFairValueOracle` gained `peek()`. The deployed oracle has always implemented it — only the
interface omitted it — so **the oracle does not move**. `PolicyGuard` and `Executor` do, because
`guard` is `immutable` in the executor.

Suite 99 → 105. The tests that matter are `test_ExitSurvivesAStaleOracle` and
`test_ExitSurvivesGapRiskAboveTheMandateCeiling`: both assert the entry is *still* refused in the
same conditions, because a fix that opened the entry path would be a much worse bug than the one
being fixed.

### The incident: production broken by a command typed to read output

While testing the new `pnpm safe:admin writer` action, `writer <liveGuard> off` was run to inspect
its output. It was not a dry run. Both Safe keys were in `.env`, the threshold was met, and it
executed: **the live `PolicyGuard` lost its append rights on `ReceiptRegistry`** (Safe nonce 1 → 2).
For the minutes that followed, every fill and every exit on mandate #3 would have reverted inside
`receipts.append`.

Restored with `writer <liveGuard> on` (`0xbcb1c1c9…`, nonce 2 → 3), confirmed by reading
`isWriter` back. `receipts.count()` was 5 before and 5 after — the append-only history was never at
risk, only the ability to add to it.

Two things follow, and only one of them is about the tool. The script did exactly what it was told;
the mistake was running a mutating command to look at its output. But a destructive action that
executes straight from arguments, with no second word, is a loaded tool — so `writer … off` now
requires `--yes`, and when the target is the current writer it prints what revoking does before
refusing. Nothing else here is gated, because nothing else here breaks a working system in one
transaction.

The general rule this earns: **in this repo, a command that can write is never a way to inspect
output.** Read with `status`, `mandate:show`, or a `--dry` path; if none exists, add one.

---

## D57 — Evidence: record the hash now, admit there is no CID

`ReceiptRegistry.Fill` has carried `evidenceHash` and `evidenceCID` since it was written and
`03-architecture.md` promised "Evidence: IPFS, hash on-chain". Every receipt through #4 records a
**zero hash and an empty string** (D52). So the audit claim was not true: a reader could see what
was traded and never why that size, at that moment, was the right one.

The two halves are separable and only one of them needed infrastructure.

**Integrity is free.** `src/evidence.ts` assembles the numbers the decision actually used — the
quote and its impact, the oracle's published value *and its age in seconds*, the guard's `dryRun`
verdict, the leg's floor — hashes them with the same `canonicalise` that `thesisHash` uses, writes
`evidence/<hash>.json`, and puts the keccak on chain in the same transaction as the fill. The
bundle is assembled **before** signing, because the interesting claim is what was known beforehand;
rebuilding it afterwards from the receipt would prove nothing.

**Retrievability is not.** `evidenceCID` stays empty, for the reason D50 already gave for
`ThesisRegistry.cid`: a CID names content on a network that will serve it, and writing one we
cannot pin is a pointer to nothing. When there is somewhere to pin, the same bundle produces the
same hash and the CID can be added for fills from then on. Nothing has to be recomputed.

`pnpm evidence` walks every receipt and reports honestly: today **0 of 5** carry a hash, because
every fill so far predates this. `pnpm evidence <hash>` re-derives the hash from the stored file, so
a bundle edited after the fact fails the check rather than passing quietly. Sharing `canonicalise`
with `thesisHash` is deliberate — two hashing conventions in one repo is one convention that will
drift.

### A coupling this exposed

`src/exit.ts` refused outright when the oracle was stale. After D56 that is wrong: the new guard
lets the position out. The script now **warns and continues**, and `dryRun` gives the authoritative
answer — because deciding in the script which guard is deployed is the script guessing at the
chain's rules. It also says plainly that sizing used a stale estimate and that the real protection
on such a fill is the min-out floor, not the oracle.

---

## D58 — D56 deployed, and the seed that gave the track record something to show

The guard change from D56 is live, and the seed it unblocked is done. Recorded together because
the order mattered: seeding before the migration would have left every position orphaned in the
old guard's storage, so the baskets would have shown weights the new mandate knew nothing about.

### The migration

```
PolicyGuard  0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be   new, exits survive a stale oracle
Executor     0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2   new, guard is immutable in it
```

Both `exact_match` on Sourcify, creation and runtime. 7,033,727 gas, ~0.00028 OKB. The oracle did
not move — it always implemented `peek`; only the interface omitted it. The registry did not move,
which is the whole point: `count()` was 5 before and 5 after.

Write permission was handed over as two separate Safe transactions, **grant first, then revoke** —
a moment of two writers is safer than a moment of none, and a guard with no write access reverts on
every fill. Old guard `0x3F58df45…` is now `isWriter = false`, so mandates #1–#5 on it are dead by
decision rather than by accident.

Mandate #1 on the new guard replaces #3: 1 USDG per trade, 12 fills per day, allowing wTSLAx,
wNVDAx, wQQQx, wSPYx, with `capacityUsdg < 1,000` basket-wide. Created with `pnpm mandate:create`,
which resolves symbols through `addressBySymbol()` and sets the executor at creation — `pnpm
mandate` does neither, and that is why it stays a demo.

### The seed, and the fill that was refused

Two theses, compiled live by Gemini and published before any money moved:

| Thesis | Basket, derived from settled fills | Weighted slippage |
|---|---|---|
| #1 — index plus the AI layer beneath it | 55.55% wQQQx, 44.44% wNVDAx | 34 bps |
| #2 — autonomy and the silicon under it | 60.00% wTSLAx, 40.00% wNVDAx | 10 bps |

Thesis #1 names three beneficiaries — S&P 500, Nasdaq 100, NVIDIA — and its basket holds **two**.
wSPYx quoted 59 bps above fair value against the mandate's 50 bps ceiling, `dryRun` returned
`SLIPPAGE`, and the script refused without spending gas. That is not a gap in the seed data; it is
the clearest demonstration in the repo of what this system is for, and it happened on its own.

Loosening `maxSlippageBps` would have filled it. Doing that to make demo data look tidier would
have meant weakening the exact guarantee the product is sold on, which is worth naming as a
temptation that was declined rather than a thought nobody had.

### Evidence, proven rather than claimed

All four seeded fills carry an `evidenceHash` and all four verify against the bundle on disk
(`pnpm evidence`): **4 of 9 receipts**, the other five predating D57. Each bundle records what the
oracle said *and how old it was at the moment of decision* — 27s, 50s, 16s, 38s. `evidenceCID`
stays empty, as D57 decided.

The track record page now has two browsable baskets with real weights instead of one thesis holding
a single ticker at $0.50. Cost: 0.95 USDG of the 1.87 available, plus gas.

---

## D59 — The Claude provider is deleted, because an unexercised path is chosen automatically

Owner's decision 2026-08-12: Gemini is the provider. That settles which model runs and raises a
second question the status docs had been carrying since the beginning — what to do with a provider
that is typechecked, looks finished, and has never once executed.

Deleted, and the reason is not tidiness. `pickProvider` selected **whichever credential happened to
be present**: `GEMINI_API_KEY` won when set, `ANTHROPIC_API_KEY` won otherwise. So the hazard was
never the dead code, it was the selection. One environment variable in the wrong place — a Vercel
project, a shell profile, a teammate's machine — would have routed the thesis compiler through a
path nobody had ever run, silently, and the first sign would have been a failed compile in front of
a judge.

Removed: `claudeProvider()` from `src/thesis.ts` (63 lines), the branch in `src/provider.ts`, and
`@anthropic-ai/sdk` from `package.json`.

`pickProvider` now **refuses an unknown `LLM_PROVIDER` out loud** rather than falling through to the
fixture — `LLM_PROVIDER=claude` returns *"not a provider this build has"*. Falling back silently
would swap a live model for a recorded fixture, which is the same class of failure the deletion
exists to prevent: a system quietly answering from somewhere other than where the operator thinks.

The fixture stays the floor, so the pipeline runs with no credential at all. `ThesisProvider` stays
an interface, so a second provider can be added when there is a reason to run one — the objection
was never to having a choice, it was to making the choice implicitly on the strength of an
environment variable.

---

## D60 — Second sweep: the testnet stack had drifted two generations behind

D52's sweep checked contract functions against callers and doc claims against code. This one
re-ran that and added the angle it had missed: **the things changed since**. Findings, in order of
how much they mattered.

### The testnet stack is not the mainnet stack

Measured from deployed bytecode rather than inferred from dates:

```
Executor      testnet  7,491 bytes    mainnet 10,221   — no exit() (D51)
PolicyGuard   testnet 13,626 bytes    mainnet 14,170   — no exit fix (D56)
```

Mainnet moved twice on 2026-08-12 and testnet did not. This matters because of what testnet is
*for*: `05-status.md` tells the reader to exercise wallet connect there, where gas is free. That
advice is still right — `createMandate`, `setTriggers`, `setCircuitBreaker`, `closeMandate` and
`updatePolicy` are untouched by D51 and D56, so testing them on 1952 is valid. What cannot be
tested there is anything to do with exits: the function is not on that executor, and the guard
would refuse it regardless.

A rig that differs from production in a way nobody has written down is worse than one that differs
openly. Now written down — and, later the same day, closed. See D61.

### Four smaller ones

- **`src/thesis-fixture.ts` and `src/thesis-gemini.ts` still referred to "Anthropic" and "the
  Claude one"** hours after D59 deleted that provider. Comments describing a file that no longer
  exists are how the next reader learns something false.
- **`03-architecture.md` still said "LLM: Claude with structured output"** — the same lag, in the
  document most likely to be read first.
- **"Public basket page" was listed as a product surface with no marker.** It is not built.
  `GET /api/theses` already returns everything it needs, so it is a page rather than a system —
  but an unmarked line in a surface list reads as shipped. Same defect class as the Evidence/IPFS
  claim D52 found.
- **The "Pro" surface claimed `execute → receipt` in the browser.** The browser can compile, map,
  size, show the guard's verdict, and now create and govern a mandate — it has never placed a fill.
  Execution is `pnpm execute` / `pnpm exit`.
- **Test count was stale in five files** (89/98/99 against an actual 105). Trivial individually and
  the reason it is listed: it drifted in five places at once because nothing checks it.

### Checked and clean

`pnpm` scripts all resolve to files that exist. No `TODO`/`FIXME`/`XXX` anywhere in `src/`, `app/`,
`contracts/`, `script/` or `test/`. No stale contract addresses outside deliberate historical
mentions. `evidence/` is tracked rather than ignored. The `RunEvent` contract frozen in
`08-parallel.md` is intact. The unreachable-function list is unchanged from D52 and is the same
benign set: contract-to-contract calls, the reverting oracle variants the UI correctly avoids, and
interface members that are not functions of the contract they appear in.

---

## D61 — Testnet realigned with mainnet, and the check that was refusing to let it happen

D60 measured the deployed bytecode on 1952 and found the rig two generations behind production.
This is the fix, and the reason it had not already happened.

### The migration script refused to run on the chain that needed it

`MigrateGuard.s.sol` is the script that made the mainnet move, and it opened with:

```solidity
require(V3_FACTORY.code.length > 0, "V3_FACTORY has no code");
```

On 1952 that is a permanent revert. The X Layer v3 factory has no code there and is not going to
grow any, so every path to a matching testnet stack went through editing the script first —
which is the kind of small obstacle that turns "cheap and worth doing" into "not done".

`Deploy.s.sol` had already worked out the right rule under D36: **require on mainnet, warn
elsewhere.** A factory with no code on 196 makes the deployment worthless. On a testnet it is
expected, and the oracle, the guard and the whole mandate lifecycle are still worth exercising on
a chain that cannot swap. `MigrateGuard` now applies the same rule and prints the same warning.

Refusing everywhere looks like the stricter, safer choice. It was the one that produced a stale
rig — a check that cannot distinguish "this is broken" from "this chain is like that" does not
buy safety, it buys a stack nobody updates.

### What moved

```
PolicyGuard  0x92aF161A… → 0xD9d04Bc1324ed4fb23D171893BFACb1c99FD581b   28,343 bytes
Executor     0xE127C363… → 0xf1b73Fb49CEfcB7CEd27b667c8Ea14bD8f3871D9   20,445 bytes
```

Both byte-for-byte the size of their mainnet counterparts, both `exact_match` on Sourcify for
creation and runtime bytecode. Only those two: `guard` is `immutable` in `Executor`, which is why
the executor came along, and the oracle did not move because it already implemented `peek` — the
same shape the mainnet migration had.

The old guard's `nextMandateId` was still 1 and the registry's `count()` is 0, so the loss
`MigrateGuard` warns about — mandates do not migrate, and positions reset — cost nothing here.
That is luck about timing, not a property of the migration.

### The Safe step, and the owner who could not pay to sign

`ReceiptRegistry.setWriter` is `onlyAdmin`, and admin on 1952 is a 2-of-3 Safe exactly as it is on
mainnet (D42). So the handover ran through `pnpm safe:admin writer`, new guard granted before old
guard revoked — a moment of two writers is recoverable, a moment of none is a guard that reverts
on every fill.

Owner 2 held **zero OKB on testnet**, so its `approveHash` could not pay its own gas and the first
attempt failed with `gas required exceeds allowance (0)`. Approvals are recorded on chain rather
than collected as signatures, which is deliberate — it is what lets a co-signer on another machine
approve the same hash — and the cost is that every owner needs gas of its own, on every chain the
Safe exists on. Funding it took one transfer. Worth stating because a 2-of-3 whose second owner is
broke is a 1-of-3 that fails closed, and it fails at the moment you need it.

### What this does and does not buy

Testnet is now the same contracts production runs, so exercising wallet connect, `createMandate`,
`setTriggers`, `setCircuitBreaker`, `closeMandate`, `updatePolicy` and the exit *interface* there
tests what mainnet will actually do — and it was exercised, not assumed: mandate #1 was created on
the new guard with `TestUSDG` allowed, and its circuit breaker toggled on and off. `mandate:create`
still cannot be pointed at 1952, because it resolves symbols through `addressBySymbol()` and no
xStock exists there; the mandate above went in by direct call. It still cannot swap — no factory, no pools — so a real fill
and a real exit remain mainnet-only, as they always were. The boundary did not move; the drift on
the near side of it did.

The recurrence is the part worth naming: this gap opened because mainnet moved twice in a day and
nothing re-measured testnet afterwards. Nothing checks it now either. The cheap habit is the one
D60 used — compare `code.length` on both chains — and it belongs immediately after any mainnet
redeploy, not in a sweep some days later.

### The four smaller ones from D60, closed

Three of them were text and were fixed where they were written: the provider comments in
`src/thesis-fixture.ts` and `src/thesis-gemini.ts` no longer name a provider that does not exist,
`03-architecture.md` says **Gemini** with a line recording that a Claude provider was deleted, and
both unmarked surface claims now carry markers — "Public basket page" is **Not built** and the
"Pro" surface says plainly that execution is `pnpm execute` / `pnpm exit` and the browser has never
placed a fill. Marking beats deleting: a reader who saw the old sentence needs to know it was
superseded.

The stale test count got a script instead of an edit. `pnpm check:tests` runs `forge test`, takes
the total from its output, and compares it against every count stated in `CLAUDE.md`, `README.md`,
`05-status.md`, `06-assessment.md` and `08-parallel.md` — six claims today. It scans by pattern
rather than by a list of known sentences, so a seventh claim is checked from the moment it is
written, and it stops at each file's `## Log` heading because a log entry saying "45/45 tests" on
2026-08-10 is *correct*.

The count itself was never the problem. Five copies of one number with nothing comparing them is
the problem, and it is the same shape as D5: derive it, do not recall it. Verified by breaking it
on purpose — a doc edited to claim 98 fails with the file, the line and both numbers.

While in there, `05-status.md` was still naming `0x09af5194…` as the current mainnet executor. That
address was superseded hours later by D56 and is now two behind. Same defect class, same sweep.

---

## D62 — The price source has no licence to point at, and the issuer does have the data

`src/marketdata.ts` calls `query1.finance.yahoo.com/v8/finance/chart/…`. Every fair value this
project has ever published to a chain came from there: the reference close for all 28 admitted
assets, the intraday carry signal, the year of daily bars behind every beta, and the session
windows. It works, it is free, and there is **no licence to point at** — the endpoint is not a
documented API, so there is no terms page to accept. Absence of a stated prohibition is not
permission.

That is survivable for a demo and not survivable for a product moving user funds on mainnet. The
risk is not a lawsuit. It is (1) an IP block, which for datacentre ranges is routine, and after D56
means entries stop while exits keep working; and (2) being unable to answer *"where does your price
come from, and are you licensed for it?"* — the question that ends a conversation with an exchange,
an issuer, or anyone doing diligence.

### Pyth is not the escape, measured twice

The obvious answer is Pyth, and it fails on both legs.

**Its terms are as restrictive as Yahoo's.** Verbatim: a *"limited, nonexclusive license to display
and otherwise use portions of the Site solely for your own private, non-commercial informational
purposes"*, plus *"You shall not extract or copy Pyth Network price feed data, including asset
prices, confidence intervals, or related metadata, from the Site in amounts exceeding what a human
could reasonably manually achieve"*. Swapping Yahoo for Hermes changes the hostname and nothing
else. The licensed tier is **Pyth Pro at $10,000/month**.

**And Pyth is not on X Layer.** Three canonical addresses probed against RPC 196 — `0x4305FB66…`,
`0x2880aB15…`, `0xff1a0f47…` — all zero bytes, and chain 196 appears nowhere in their contract
address list.

Worth keeping from the dig: Hermes lists **1,772 equity feeds**, 27 of our 28 references live and
publishing. **EWY is listed and has never published** — price 0, publish time 0 — which is D35's
lesson in a new costume: listed is not live. Every `.ON` overnight equity feed is marked
`DEPRECATED`, so Pyth would not have solved the 24/7 carry problem either.

### Neither is OKX

`GET /api/v5/public/instruments?instType=SPOT` returns 1,337 instruments and **zero** tokenised
equities. Whatever settles on X Layer, the public spot API does not expose it.

### What a licence actually costs, and why it is the wrong question

Exchange redistribution fees, from the published schedules: **Nasdaq enterprise $34,990/month**,
**NYSE display redistribution $20,000/month**, non-display $4,500/month per category. These are paid
to the exchange and are vendor-agnostic — paying a vendor does not substitute. Polygon.io's terms
make that explicit: data is *"strictly for display use only"*, with redistribution, commercial use,
non-display use and derivative works all prohibited absent a separate licence. A $79/month plan buys
the right to put a number on a screen, not to publish it to a blockchain.

Publishing to a public chain is the most aggressive redistribution there is: unbounded recipients,
anonymous, permanent, irrevocable. It is priced accordingly.

Which is why the answer is not to buy a cheaper licence. It is to **stop consuming exchange data at
all** — take the number from the party that issues the token.

### The issuer has it, and has more than we do

`api.backed.fi` and `api.xstocks.fi` are public, need no key, and publish their rate limit in the
response headers. Pulled and verified rather than read about:

- **A two-sided quote per token** — `bid`/`ask`, not a proxy listing.
- **The issuer's own spread per session** — 10bp open, 15bp extended, 25bp overnight, 50bp closed.
  That is the uncertainty this oracle models as gap risk, published by the party taking the other
  side of it.
- **The corporate-action multiplier**, with history and reasons.
- **`wrapperAddressV2` per chain** — the `w…x` token `ASSETS` already holds, from the issuer rather
  than from our own guess. Four spot-checked against RPC 196: `0x9d275685…` is `AAPLx` and
  `0x943bf64d…` is `wAAPLx`, likewise TSLA.
- **717 xStocks with an X Layer deployment.** Our universe of 30 is the set with a *pool*, which is
  the more useful question — but "30 xStocks exist on X Layer" was never the true sentence.

What it does **not** give: no timestamp on the quote, and no history at all. So it replaces the
reference leg, not `marketdata.ts` entirely. The beta regression has no source there, and
`observedAt` in `src/issuer.ts` is stamped by us on receipt — a weaker fact than
`lastRegularPrintAt`, named so that nobody confuses the two.

### The multiplier: a defect we have been absorbing since D38

An xStock dividend is not paid to holders in cash. It is reinvested, and each token becomes a claim
on slightly more stock, tracked as a multiplier. **Nothing in this repo knew that number existed.**
`pnpm reconcile` compares the on-chain price against an unadjusted reference, so the entire dividend
history has been landing in `basisBps` and being read as market noise.

It is not small. `IBMx` is at **1.02040**. `SPYx` 1.00571, `MSFTx` 1.00458, `AAPLx` 1.00327 — larger
than the 100bp deviation tolerance in `checkExecution`. The field is believable before any of that,
because it behaves: dividend payers move (AAPL, SPY, MSFT, IBM), non-payers read exactly 1.0 (TSLA,
GLD, COIN, MSTR).

**The direction was measured, not read.** Both treatments are computed against the same on-chain
price and printed side by side, because guessing which way to apply someone else's multiplier is how
a 33bp error becomes permanent. Across the 16 assets whose multiplier is not 1.0:

```
per-asset vote        15 ×  versus  1 ÷
mean |basis| × mult   0.73%
mean |basis| ÷ mult   1.55%
untreated             1.10%
```

Multiply. The per-asset vote is not unanimous and should not be: where the multiplier is 1.0009 the
two treatments differ by 9bp and the winner is whichever way the pool is leaning that minute. The
mean is the honest statistic, and it is dominated by the assets that carry real information.

### The result that changes what is publishable

The chain agrees with the issuer far more closely than it agrees with Yahoo. Chain versus issuer mid
is inside ±0.7% for **every** asset that has a pool. Chain versus Yahoo reference runs to 2.7%.

Including the two we withhold:

```
wSKHYx   chain 145.12   issuer 145.29   -0.10%      vs Yahoo/000660.KS: -86.3%
wSPCXx   chain     —    issuer 134.08        —      no listing exists
```

D39 rejected `wSKHYx` on an 86% basis and concluded the wrapper does not track one SK Hynix share.
That conclusion was right. What was missing is that **the issuer publishes a mark for it, and the
chain matches that mark to 10bp**. The asset is not unpriceable; our reference for it was wrong.
`wSPCXx` is the same story — SpaceX is private, no listing exists, and the issuer marks it anyway.

An issuer-referenced oracle would have a defensible number for 30 of 30, where the exchange-
referenced one has 28.

### The unit trap, and why it is worth a paragraph

The two issuer endpoints publish the same price in different units: `quotes/assets` in minor units,
`price-data` in dollars. Nothing in either response says so. The first run reported every issuer
quote at 100× the reference, which is the useful kind of wrong.

A wrong scale here would be catastrophic and quiet, because **every proportional check in the guard
compares ratios** — a fair value 100× too high passes deviation, band and gap-risk tests that are
all expressed as percentages, and fails only at the point where real money moves. So the constant is
derived across two assets three orders of magnitude apart (AAPLx at $305, BANKCx at $0.66; both
×100), and `quoteScaleCheck` re-measures it at runtime rather than trusting the constant. D5, in a
new place.

### Status: observed, not adopted

`src/issuer.ts` is read-only and `pnpm reconcile` prints a third column beside the first two. **No
verdict depends on any of it**, every issuer call is swallowed on failure, and nothing from this
source has been published on chain. The 28 admitted assets are admitted on exactly the evidence they
were admitted on yesterday.

The licence question is not settled and is not being pretended settled. The docs describe the API as
being for *"integrators such as exchanges, protocols, and developers"* — a statement of intent, not
a grant. No explicit redistribution clause was found. The difference from Yahoo is that this one is
answerable: it is their data about their own product, and the ask is one email. Until it is answered
in writing, this stays a measurement tool.

What it would take to adopt: freeze the betas as recorded constants with their measurement date and
delete `marketdata.ts` (the issuer has no history, and a beta moves over months, so re-fitting on
every publish was always overkill); replace direction-guessing overnight with the issuer's published
spread, which is the oracle stating uncertainty instead of predicting — the shape it should have had
anyway; and apply the multiplier. That is a real migration and it is not started.

### Applied: the multiplier is now in the fair value

The measurement above settled the direction, so the correction landed rather than waiting.

```
FV = P_close × (1 + Σ βᵢ · rᵢ) × shares/token
```

`AssetSpec.multiplier` records shares per token for all thirty assets, measured 2026-08-12 and
rounded to 1e-6 — 0.01bp on a $300 share, below anything this system can act on. The fourteen assets
sitting at exactly 1.0 are recorded explicitly rather than omitted, because *measured and unchanged*
and *never measured* must not look the same in a file that is read as evidence.

**Recorded, not fetched at publish time.** This was the design decision worth arguing about. Reading
the multiplier live would keep it perfectly fresh and would also make the oracle unable to price
anything when someone else's API is down — and the measurement run that produced these numbers had
**three transient failures out of thirty**, which settles it. It is a slow-moving fact that changes
on dividend dates, so it belongs in the repo with a date beside it, exactly like `admittedOn`.
`pnpm reconcile` re-reads the live value and warns on drift, with the size of the error stated in
bps of fair value, because a stale multiplier is not a matter of taste like signal drift — it is a
wrong number being multiplied into a published price. Verified by breaking it deliberately:
`wIBMx` set to 1.0104 prints `recorded 1.010400 → issuer 1.020403 (99.0bp of fair value, on every
publish)`.

It is applied in both branches, open and closed, because it is a property of the wrapper rather than
of the session — a token does not stop holding 1.0204 IBM shares because New York is open.

The effect, on the same run: mean |basis| across the sixteen assets that carry a multiplier goes
from **1.12% untreated to 0.73%**. On `wIBMx` specifically the basis moves from roughly 2% to
−0.20%. `anchorPrice` still reports the price of one share and `sharesPerToken` is reported beside
it, so "the share moved" and "the token holds more shares" stay two different sentences.

All 28 admitted assets still reconcile. Nothing about admission changed — this corrects the price of
assets that were already publishable, and it corrects it downward toward the chain.

### Applied: β and the gap distribution are recorded, not re-fitted

Step one of the reference-leg migration, and it changes nothing about what is published — it moves
two statistics from *computed on every run* to *written down with a date*.

Both came from the same place: a year of daily bars from Yahoo. β is the OLS slope of the
reference's daily returns on its signal's. The band is the standard deviation of that security's own
realised close-to-open jumps, sampled separately for weekends. **The band's source was the thing
missed in the first plan for this migration** — it was described as freezing one number per asset
and it is two, because a band built from history is history whether or not it is called a beta.

`MEASURED` in `src/fairvalue.ts` now holds `{ fits, gaps }` for the 29 assets that have a reference,
beside `ASSETS` rather than inside it: `ASSETS` is a table a human scans and four statistics per line
would ruin it, so `pnpm reconcile` checks the two stay in step instead.

Proof that recording changed nothing, from runs nineteen minutes apart across the swap:

```
                band before    band after
wAAPLx            1.68%          1.68%
wAMDx             4.16%          4.16%
wQQQx             0.28%          0.28%
wINTCx            5.71%          5.71%
wSKHYx            8.19%          8.19%
```

Fair values moved only by the signal's own movement in between, which is the point.

**The cost is staleness, so staleness is measured.** `pnpm reconcile` re-fits against live data every
run and reports how far the recorded copy has moved — β past 0.05, gap σ past 10% — and says which
way the error runs: a σ that has grown means the published band is that much too narrow, which is the
direction that matters. Neither is a failure and neither exits non-zero, because a beta genuinely
drifts and a recorded one stays usable long after it stops being exact. What must not happen is
nobody knowing by how much.

There is also a completeness check, because the failure mode here is silent: an admitted asset with
no entry in `MEASURED` falls back to a live regression, which is the dependency this was meant to
remove, back again and invisible. All three checks were verified by breaking them deliberately —
β forced to 0.4 reports `+0.3445`, σ forced to 0.5% reports `+85% — the band is that much too
narrow`, and a removed entry reports `Admitted but not in MEASURED: wTSMx`.

What remains for the migration proper: point the reference leg at the issuer's quote, add the
issuer's per-session spread as a **floor** on the band, and delete `src/marketdata.ts`.

### Correction: the issuer's spread is not the band

The plan for this migration said the overnight direction guess would be replaced by the issuer's
published per-session spread. That was wrong, and it is worth recording because it is the kind of
wrong that looks like a simplification.

They are different quantities. The issuer's spread is a **transaction cost** — the gap between the
price they will buy at and the price they will sell at. The band is a **forecast uncertainty** — how
far the price may jump before the market reopens. Side by side:

```
              our band     issuer overnight spread
wAAPLx          1.68%              0.15%
wINTCx          5.71%              0.25%
wQQQx           0.28%              0.15%
```

Substituting one for the other would narrow wAAPLx's uncertainty roughly sevenfold, and narrow it
**precisely while the market is shut** — making the guard most permissive at the hour it should be
least. That is the opposite of what the change was supposed to buy.

The correct shape is a floor, not a substitution: uncertainty is never narrower than the spread the
issuer is itself quoting. The band stays what it is — the empirical distribution of the jump being
predicted.

"The oracle is a guard, not a forecaster" still holds. It guards by stating how far the price could
jump, which is a measurement, not by copying somebody else's dealing spread.

### Applied: the reference leg is the issuer, and the prediction is gone

```
FV = issuer mid × shares/token
```

Two measurements settled the shape before any of it was written.

**Does the issuer's quote already contain the multiplier?** If it did, applying ours would double
count. Regressing (chain vs issuer mid) on (multiplier − 1) across all thirty assets:
**slope 1.090, R² 0.816, intercept −4.1bp.** The issuer quotes *one share*; the chain prices *one
token*; the multiplier is exactly the difference. wIBMx is the anchor of the fit — multiplier
204bp, chain 230bp above the issuer's mid — and the fourteen assets at 1.0 cluster at zero.

**Is the issuer's overnight mark live, or an echo of the close?** Sampled 91 seconds apart at 04:20
New York time, four of eight names moved more than a basis point (MSFTx −5.3, IBMx +4.0, AAPLx +2.3,
GLDx +2.3). Over twenty minutes AAPLx moved 24bp. It is a live two-sided market, not a stored close.

That second answer **retires the carry-forward**, and this is a correction to what was promised.
The plan said the overnight direction guess would be lost. It is not lost — it is replaced by
someone doing the same job better, with money behind it. Regressing index futures onto an eleven-
hour-old close was re-deriving, badly and from an unlicensed source, a number a dealer publishes
continuously at a 25bp spread and will transact in from $1,000 to $20M.

So the signal machinery is deleted rather than left dormant: `classifySession`, `loadSignal`, the
signal cache and the whole `alignedReturns → regress → moveLog` path. D59's lesson is that an
unexercised path gets chosen automatically; a dormant Yahoo fallback would have been exactly that.
`MEASURED.fits` stays recorded — evidence, drift-checked, and ready if a licensed futures feed ever
justifies putting the prediction back on top — but nothing prices from it.

**The band and gap risk stopped being the same measurement.** This is the part worth understanding:

- The **band** is uncertainty about the value *now*. While the issuer quotes, it is that market's
  own spread: 10bp open, 15bp extended, 25bp overnight, 50bp closed. Anything inside it is a price
  the issuer itself treats as fair. When nobody quotes, there is no spread and the recorded jump
  distribution becomes the band, unshrunk — there is no carry-forward left to explain any of it away.
- **Gap risk** is what the *position* is exposed to, and it keeps the jump distribution in the score
  even while the mark is live. Buying at 3am carries the open however good the price is.

The old model conflated them and paid for it twice: it inflated the band with a jump the guard was
comparing a live price against, and it scored 0.16 of staleness at 3am purely because New York had
shut eleven hours earlier, while a dealer was quoting the token the entire time. `staleness` is now
binary — is anyone making a market — and `displacement` carries the open-gap term.

`WIDEST_RECORDED_BAND_BPS = 853` normalises that term, derived as the widest band across admitted
assets (wSNDKx) rather than picked. At the 300bp the old displacement used, half the universe pinned
at maximum and the score could not tell wQQQx from wSNDKx — 98bp against 853bp.

Measured effect, same minute, before and after:

```
             basis before      basis after      band before   band after
wAAPLx          -0.12%           +0.09%            1.68%        0.10%
wSNDKx          +2.09%           -0.04%            6.90%        0.15%
wMRVLx          +2.28%           -0.15%            5.12%        0.15%
wEWYx           +1.51%           -0.09%            3.76%        0.15%
```

Every asset now sits inside ±0.40% of fair value, against up to 2.7% before. The guard got
**tighter**, not looser: tolerance is `maxDeviationBps + band`, and the band collapsed because the
fair value stopped being a forecast.

**`MarketState` did not change**, deliberately. The contract's enum has six members and
`src/guard.ts` mirrors it line for line; a seventh would move the whole stack, because `oracle` is
`immutable` in both `PolicyGuard` and `Executor`. The issuer says `extended` without saying which
side of the day, so the side comes from the clock in New York — an extended session never straddles
noon, and what hour it is there is not licensed data.

**Nothing newly publishes.** `admittedOn` still gates, and the admission test is still the
exchange-referenced one, so wSKHYx and wSPCXx remain withheld. The interesting part: under the
issuer, wSKHYx now sits **2bp** from the chain rather than −86%. Its withholding note said "the pool
quotes ~86% below the share", which was true and has stopped being the reason — so the note now says
the rejection is about the mapping and the test rather than about the token. A refusal that gives a
stale reason is worse than one that gives none.

Yahoo now has exactly one consumer: `src/reconcile.ts`, the offline admission test. Nothing that
publishes touches it. Deleting it entirely means re-running admission against the issuer, which
would newly admit two assets — a product change, not a cleanup, and it is not being smuggled in
here.

### Applied: admission moves to the issuer, and the universe becomes 30 of 30

The last step. `pnpm reconcile` no longer asks "does this wrapper reconcile with a listing on an
exchange?" — it asks **"does the chain agree with the mark the issuer is making for this token?"**

Two gates disappear entirely, and neither is a relaxation:

- **`FX_REQUIRED` is gone.** The issuer quotes every token in USD, including the Seoul listing that
  needed a live KRW leg and the conversion logic behind D39. That whole class of error — a price
  wrong by three orders of magnitude in one direction and plausible in the other — no longer has
  anywhere to happen.
- **`NO_HISTORY` is gone**, because there is no beta to fit. It was a gate on having enough data for
  a model that no longer exists.

What remains is sharper than what it replaced: is the token carried, is it quoted, is it halted, is
there a pool, and does the chain agree. And the comparison is now like-for-like — issuer mid ×
shares per token against the chain — where the old test compared a token against one share and
called the dividend history basis.

**30 of 30 admitted**, every basis inside ±0.4%. The two that were withheld:

```
wSKHYx   issuer × shares 146.28   chain 146.16   -0.1%     (was -86.3% against 000660.KS)
wSPCXx   issuer × shares 134.69   chain 134.34   -0.3%     (was: no listing exists)
```

D39's rejection of `wSKHYx` was right about the mapping and wrong as a statement about the token.
The wrapper is not a claim on one SK Hynix share at the KRW rate; it is a claim the issuer marks
directly in USD, and the chain agrees to ten basis points. `wSPCXx` is the cleanest case for
referencing the issuer at all: SpaceX is private, no exchange can price it, and the party that mints
the token marks it anyway.

That is the argument for this whole change in one line. The exchange-referenced oracle could defend
28 of 30. The issuer-referenced one defends all 30, with tighter basis on every single asset.

### The bug that admitting wSPCXx exposed

It priced at **gap risk 2 out of 100** — the safest asset in the universe — because it has no
recorded open-gap statistics, its underlying having never had a listing to measure, and a missing σ
multiplied out to a zero open-gap term.

Missing data is the least safe state, not the most. Unmeasured now scores as maximum on that term
and says so in the notes, and where nothing is quoting *and* nothing is recorded, the band is null
and the value is unpublishable rather than zero-width. A zero band is a lie the guard would act on.

### Yahoo is quarantined rather than deleted

`src/marketdata.ts` has exactly one importer: `src/measure.ts`, a bench tool run by hand as
`pnpm measure`. Nothing on any path that publishes or admits touches it.

Deleting it outright was the plan and is the wrong call, for a reason worth recording. The open-gap
distribution behind every band has no free licensed replacement — the issuer publishes no history at
all — so removing the code would leave the recorded σ values permanently unauditable: magic numbers
nobody could re-derive, which is D5 in reverse. Quarantining keeps them checkable and keeps the
unlicensed source strictly off production.

The header on that file now says so in the first line, along with what to import instead. The real
fix is to stop borrowing history and build it: sample the issuer's own marks into a store and derive
σ from those. That is the indexer already named in `03-architecture.md`, and it does not exist yet.

### What is left of the old model

`AssetSpec.signals` is deleted — nothing carries anything forward. `MEASURED.fits` stays recorded,
drift-checked by `pnpm measure`, and prices nothing; it is there for the day a licensed futures feed
makes putting the prediction back on top worth doing. `classifySession`, `loadSignal`, the signal
cache and the whole aligned-returns path are gone rather than dormant, because D59's lesson is that
an unexercised path gets chosen automatically.

### The new model published to mainnet, and the read-back lied about it

First publication of the issuer-referenced oracle: **30 observations in one transaction**, block
67756404, 968,736 gas, status success. On-chain bands came back at **10–25bp** against the 168bp the
previous observation carried for the same asset.

The script then reported three assets as `REJECT STALE`. They were not stale. Read directly a minute
later, all four sampled assets showed `hasValue: true` with `updatedAt` under a minute old — the
write had landed for all thirty.

**D18 again, through a guard that was already there.** `publish.ts` waits for the write to become
readable before reading it back, because the public X Layer RPC load-balances and a read issued
straight after a confirmed write can hit an unsynced node. The wait's predicate was
`updatedAt !== 0`, which is the wrong question: an asset that has ever been published has a non-zero
`updatedAt` forever, so the wait passed instantly against a node still serving the *previous*
observation. The first three assets were then read from that node — returning values 12.9 hours old,
which the contract correctly called stale.

The bound is now the timestamp of the block the write landed in, and every asset waits on its own
read rather than only the first, because the RPC balances per request: asset 3 can hit a lagging
node after asset 1 did not.

Worth recording for the shape rather than the size. The check existed, ran, and passed — against a
condition that could not fail. A guard whose predicate is always true is worse than no guard,
because it is also reassuring, and this one produced a false `REJECT STALE` on the single condition
the script exists to verify.

### D39 was right to refuse and wrong about why — `wSKHYx` tracks a US depositary receipt

The last thing the issuer's metadata settled, and the sharpest argument in D62's favour.

D39 rejected `wSKHYx` at −86% against `000660.KS` and concluded: *"whatever that pool is pricing,
the test cannot call it a claim on an SK Hynix share."* The refusal was correct — publishing that
basis would have been indefensible. The reason was not.

```
SKHYx   underlyingSymbol SKHY   underlyingIsin US78392B2060
```

A **US** ISIN. The token references the US-listed depositary receipt, not the Seoul ordinary share,
and a DR ratio is exactly what a ~7× price difference looks like — $146 against $1,061. There was
never anything wrong with the pool.

The field is called `underlyingIsin` and it was public, free and one request away for the entire
day this asset was called unpriceable. Nothing about the exchange-referenced mapping could have
found it, because the exchange-referenced mapping was the thing that was wrong: `wSKHYx → SKHY →
000660.KS` came from stripping a ticker and then a human override that made the guess *more*
confident. `REFERENCE_OVERRIDES` was invented precisely to handle this asset, and it encoded the
error rather than the fix.

That is the case for referencing the issuer, stated in one asset. The mapping between a wrapper and
what it is a claim on was never inferable from a ticker. It is a fact the issuer knows and
publishes, and every version of this system that tried to derive it instead was doing archaeology on
a string.

`ASSETS`, `README.md` and `03-architecture.md` are corrected. The old text is struck through rather
than deleted, because a reader who saw "wSKHYx does not reconcile, −86%" needs to know it was
superseded and why.

**`wSPCXx` is not the same situation and should not be treated as one.** Every other asset has two
independent opinions — the issuer's mark and the chain's price. SpaceX is private, so the issuer's
mark is the only opinion in existence, and the pool almost certainly quotes *because of* it. Two
numbers from one source are not two pieces of evidence. It also has no recorded open-gap statistics,
because there has never been a listing to measure, so its risk score is a conservative guess rather
than a measurement — which the notes now say out loud. If any asset warrants a tighter mandate —
smaller size, lower `maxGapRisk` — it is that one.

---

## D63 — Closing the gaps D62 opened, and deleting the last unlicensed source

D62 moved the oracle onto the issuer's mark and left five loose ends. Four are closed here. The
fifth — the licence question with Backed — is not an engineering problem and is not pretended to be.

### `PUBLISH_SYMBOLS`, and the number that turned out smaller than claimed

The publisher wrote all thirty assets every cycle while the live mandate held four. That is the same
trade the worker's own schedule was set to avoid — *"running it from now so that nothing observes it
is the wrong trade"* — one level down.

`PUBLISH_SYMBOLS` narrows the set, defaulting to all thirty because a demo with a blank asset is
worse than a slightly expensive one. An unknown symbol is a **hard error**, not a silent skip: a typo
that quietly publishes twenty-nine instead of thirty is exactly the drift nobody notices until a
mandate cannot execute.

Measured on chain rather than estimated:

```
30 assets   919,563 gas
 4 assets   142,872 gas      6.4x, not the 8x the first comment claimed
```

The saving is under-linear because the first write pays for the transaction. Three weeks of runway
on $5 becomes about four and a half months. The runway printed each run now scales with the set
being published — a runway computed for thirty while publishing four is wrong in the reassuring
direction, which is the worst direction.

### The gap σ now comes from our own history, and Yahoo is deleted

`src/marketdata.ts` is **gone**, not quarantined. Quarantine was the previous answer and the owner's
instruction was clearer: stop using it. What made that possible was building the thing it was being
borrowed for.

The band, when nobody is quoting, is the security's close-to-open jump distribution. The issuer
publishes a live mark and no history, so that σ had no source but Yahoo. It has one now:
`pnpm sample` writes the issuer's marks to `observations/issuer-marks.jsonl`, append-only, one line
per asset per pass, and `pnpm measure` derives σ from that store. It runs beside the publish worker,
costs no gas and needs no key.

**It refuses to guess, and that is the design.** A close-to-open jump needs a session boundary, and a
store six hours old has watched none. Below thirty jumps per asset `pnpm measure` reports how far
along it is and leaves the recorded σ in force — dated, stale, and visible. A σ derived from a short
series would look fresher than the number it replaced and be worse. Thirty is roughly six weeks of
weeknights, the point at which one more observation stops moving the answer.

The store is committed on purpose. A σ derived from a file nobody else holds is not reproducible, and
this repo's argument is that its numbers can be checked.

### `MEASURED.fits` deleted

The recorded betas priced nothing once the carry-forward was retired. A recorded number that nothing
reads is a number nobody checks, so they are gone — D59's lesson applied to data rather than code.
`MEASURED` is now gaps only.

### The browser can produce a Permit2 signature — the half that was actually missing

`07-team.md` said the follow flow was gated on wallet connect. Wallet connect shipped on 2026-08-12
and the flow did not move, which meant the stated blocker was not the real one. It was this: nothing
in `app/` could produce a Permit2 signature, so the browser could create a mandate and never place a
fill.

`src/permit.ts` is that piece, and only that piece — deliberately not an execute helper, because
quoting and `dryRun` already work and already have one implementation each. Browser-safe under the
same rule as `abi.ts`, `deployments.ts` and `chain.ts`: no `node:`, no `process.env`, no client
construction.

Two objects come back rather than one, because the signed struct carries `spender` and the calldata
struct does not — Permit2 fills that field from `msg.sender`. Handing callers one object and hoping
they drop the right field is how a signature ends up authorising the wrong contract.

**`src/execute.ts` was rewired through it**, which is the part that matters. The browser half is
proven by the CLI: every mainnet fill now exercises the exact code the web app will run. Verified by
placing one — receipt #14, 0.6 USDG into wTSLAx, `dryRun ALLOW`, nonce 14, 614,433 gas.

`describePermit` lives there too, so the copy that tells a user what they are signing cannot drift
from the struct it describes. A typed-data prompt is unreadable to almost everyone; the four facts
that bound it — one token, one cap, one spender, twenty minutes — have to be said in words.

### Still open

**The FE wiring for a browser fill.** The signature is the hard half and it is done and exercised;
what remains is a component that quotes, shows the guard's verdict, calls `signTypedData`, and sends.
That is FE work on an FE file and it is not built. **The browser still has never placed a fill**, and
nothing in the docs may say otherwise until it has.

**`Mandate.tsx` against a real wallet extension.** Cannot be done from here — it needs a browser with
a funded extension. It is a person-with-a-laptop task, not an engineering one.

**The licence.** Unchanged and unchangeable by code.

### Two defects a third sweep found, both introduced by D63 itself

**The sampler would have written the same mark forever.** `issuerBook()` cached its promise until
the process exited, which was correct while everything here was a script that exits. `publish-loop.ts`
is not: it lives for days and calls the sampler every cycle. It would have been handed the same book
each time, so `observations/` would have filled with identical rows, every close-to-open jump would
have been exactly zero, and the σ derived from it would have been **zero** — a zero band, which is
the one thing `computeFairValue` explicitly refuses to publish.

Found by sampling twice three seconds apart: 30 of 30 rows identical. Both caches now carry a TTL —
30 seconds for the book, an hour for the catalogue — chosen from how fast each fact actually changes
rather than from a round number. Verified in both directions: reused inside the window, refetched
past it.

The shape is worth more than the fix. A cache with no expiry is correct in a script and wrong in a
daemon, and D63 turned one into the other without revisiting anything it had been true of.

**An issuer outage threw instead of withholding.** Pointing `fetch` at a dead host made
`computeFairValue` raise `simulated outage`. This module has exactly two ways to answer — a value it
can defend, or a withheld one — and an exception is a third that propagates out of the per-asset
loop in `publish.ts` and takes down the whole run, including assets whose data had already arrived.

An outage now looks exactly like a token the issuer does not carry: no value, gap risk 100, and a
note that says which of the two it was. And `publish.ts` refuses to spend ~900k gas publishing thirty
withheld observations: the existing ones go stale inside `maxAge` on their own, at which point the
guard rejects on staleness — the same outcome, for free. It exits non-zero so the loop's failure
counter escalates a real outage rather than logging a cycle that looks like it worked.

### Known and left alone

`ReceiptRegistry.receiptsOf` / `performance` and `ThesisRegistry.authorOf` / `thesesOf` are public
views with no off-chain caller. Listed rather than deleted: they are what a Simple-mode surface will
read, and `src/track-record.ts` already documents why it does not use `performance()` — it is keyed
by mandate and the join needed is by thesis. A view with a reason is not the same as a function
nobody could reach, which is what D52 was about.

**`src/` has no unit tests.** 105 Foundry tests cover the contracts; the TypeScript side is covered
by `pnpm verify`, `pnpm reconcile` and `pnpm check:tests`, which are regression checks against live
state rather than unit tests. That has been enough to catch real defects — including both above —
but it means a pure-function bug in `src/issuer.ts` or `src/permit.ts` has nothing standing in front
of it except the next live run.

---

## D64 — The browser can fill; the quote stays on the server, and one ABI comment was backwards

Simple mode's browse surface (`app/components/Theses.tsx`) and the fill path
(`app/components/Fill.tsx` + `POST /api/fill`) close the last two items that were "built but
unreachable". `src/permit.ts` could produce the authorisation and `Executor.execute` could spend
it; nothing joined them outside a Node script holding a key. That is now joined.

### Where the work is split, and why that is the security claim

The obvious shape — quote in the browser — does not survive contact with this chain. A quote is
thousands of pool reads over an RPC that throttles, and the evidence bundle needs a filesystem.
So `POST /api/fill` quotes, checks the pool the executor will actually derive, reads the oracle,
asks `PolicyGuard.dryRun` and hashes the evidence, and the browser does the three things that must
happen in the user's own wallet: approve Permit2 once, sign an authorisation scoped to one token,
one amount, one spender and twenty minutes, and send the transaction.

**The server holds no key and what it returns cannot move anything.** That is not a convenient
division of labour, it is the non-custodial claim expressed as an architecture: the only artefact
that can move funds is produced by the owner's wallet and by nothing else.

`src/fill.ts` is the shared implementation. `executionPriceE8` and `shortfallBps` were written out
inline in `execute.ts`; they mirror `Executor._priceE8` and `_shortfallBps`, they decide whether
the guard rejects, and a second copy in an API route would have been a third place for them to
drift from the Solidity. `execute.ts` now imports them.

### The evidence bundle is written only when the guard allows

A rejected plan is never signed. Writing its bundle would fill `evidence/` with reasoning for
trades nobody made, which makes the directory worth less rather than more. The hash is returned
either way, and on a serverless runtime with no writable filesystem the write fails and is
reported — the hash still binds, which is the half that mattered (D57).

### `peek` and `observation` are the opposite of what the ABI said

`src/abi.ts` carried a comment saying `peek` reverts on stale or withheld values and `observation`
returns the raw record. **It is the other way round.** `FairValueOracle.peek` is a plain getter;
`observation` reverts with `NoData` and `Stale`. The browser fill path followed the comment and
got a revert where it expected a record — on a *correct* refusal, which is exactly the failure
mode `09-design.md` warns about: the oracle doing its job, rendered as a bug.

Corrected in place, with the line numbers, because the name that sounds safer is the one that
throws. `checkExecution` returns its reasons and never reverts, which is why `dryRun` answers
`STALE` instead of failing.

### What the chain says right now, 2026-08-12

A quote for 0.5 USDG into wSPYx returns `REJECT · STALE`: the last published observation is
~1.9 hours old against a 900-second `maxAge`, because the publish worker is deliberately not
running until 18–19 Aug. This is the guard working, and the surface renders it as a verdict with
its reason rather than as an error. **A browser fill will not go through until a fresh value is
published** — one `TARGET=mainnet PUBLISH_SYMBOLS=… pnpm oracle:publish` is enough for a demo.

**The browser has still never placed a fill.** The server half is exercised against mainnet; the
wallet half — approve, sign, send — is typechecked and built and has not been run against a real
extension. That is the one claim not to make until someone presses the button.

### Swept afterwards, same day — seven gaps the first pass left

Written down because five of the seven would only have surfaced with a wallet holding real funds,
which is the most expensive place to find them.

1. **The permit has to be signed by the mandate's `owner`, and `prepareFill` only checked `agent`.**
   `Executor.execute` calls `_pull(permit, signature, m.owner, legs)` and sends the bought asset to
   `m.owner` too. A caller who was the agent but not the owner would have approved Permit2, signed,
   sent — and reverted on an invalid signer, having paid gas to find out. The CLI splits the two
   roles across two keys and never hit this; the browser has one wallet, so it must hold both, and
   the server now says so before anything is signed.
2. **The approval was not polled before the transaction that depends on it.** `execute.ts` waits
   for the Permit2 allowance to become *readable* (D18) and the browser did not — it awaited the
   receipt and went straight on. On this RPC that is a gas estimate against a node that has not
   seen the approval: a revert with no useful message, on a first-time user's very first fill.
3. **A stale plan could be signed.** Changing the asset, size or mandate after quoting left the
   previous plan on screen with a live "sign & fill" button, which would have executed something
   other than what the form said. The plan is now cleared whenever any of its three inputs change.
4. **Following a thesis and filling a different asset would have stamped its hash on the trade.**
   A receipt pointing at reasoning that says nothing about the asset is worse than an untethered
   fill, because it looks like evidence. The hash now rides along only when the asset is in that
   thesis's basket, and the panel says which case it is in.
5. **A failed read left the panel reading forever.** `load()` had no `catch`, so a throttled RPC
   produced an unhandled rejection and a permanent "Reading your mandates…". A throttled RPC is
   not an empty list of mandates — the same distinction `/api/theses` already makes.
6. **Nothing re-read the chain after anything changed.** Creating a mandate left the fill panel
   saying no mandate existed; a fill left the positions and the track record showing pre-trade
   state. Three one-way events (`reckonz:follow`, `:mandates-changed`, `:filled`) now join the
   panels, so a fill that carries a thesis hash appears in that thesis's record without a reload.
7. **A fill whose balance had not become readable reported "received 0".** Exactly the D18 defect
   that once made a working fill print zero. It now says the balance is not visible yet and points
   at the transaction.

Also: the user's USDG balance is read up front and a size larger than it is refused with the reason
— Permit2 authorises a pull, it does not create the balance — and `describePermit` takes a deadline
rather than a built payload, because the UI has to say what is about to be signed *before* the
permit exists rather than after.

---

## D65 — The browser placed a fill, and two bugs stood between it and ever doing so

2026-08-12. **Receipt #15 on X Layer mainnet**: 0.49925 USDG into wSPYx at 776.8877 against a fair
value of 776.9450 — **0 bps slippage**, gap risk 4 — carrying `thesisHash`
`0xc3cd487e…` (thesis #0, published 2026-08-11) and `evidenceHash` `0xf0e8df15…`, which `pnpm
evidence` re-derives from the stored bundle. Quote, oracle read and `dryRun` from `POST /api/fill`;
approval, Permit2 signature and transaction from the OKX extension. **No key on the server, and
the browser had never done this before.**

The loop is now visible in one screen: the fill appears under thesis #0's track record, which went
from one settled entry to two, 0.49925 → 0.9985 USDG deployed, 45 bps worst slippage against 22 bps
weighted.

Getting there took a publish — the guard answered `STALE` until `PUBLISH_SYMBOLS=wSPYx pnpm
oracle:publish` (tx `0x099d6e19…`, 53,739 gas). Worth recording: the publisher's runway is **1,532
runs** at 0.02 gwei on its current 0.00276 OKB, not the ~21 days at $5 that `07-team.md` assumed.
The funding note there was written before `PUBLISH_SYMBOLS` existed and is now wrong in the
expensive direction.

### `useWallet` gave every component its own connection

The hook kept its state in `useState`. Four components call it — `Wallet`, `Mandate`,
`MandateManage`, `Fill` — so each had its **own** connection, and only the header ever called
`connect()`. The address rendered in the header while all three panels below sat on
`address === null` and asked the user to connect a wallet that was already connected.

**Every wallet-dependent surface on the page was unreachable, from the day wallet connect shipped
until the first time a real extension was pointed at it.** Not a regression from this week's work
— D54 shipped it that way, and `05-status.md` recorded "not yet exercised against a real wallet
extension" without anyone drawing the conclusion. A hook that owns connection state is a hook that
cannot be called twice, and nothing said so.

The state now lives in a module-level store that `useWallet` subscribes to via
`useSyncExternalStore`: one connection, one set of provider listeners, every panel reading the same
snapshot. A context provider would also have worked and would have put a client boundary around a
server-rendered page; this changes nothing at any call site.

### `waitForTransactionReceipt` never returned through the injected provider

The fill was mined in block 67767995 and confirmed on chain while the page still said `mining…`.
Whatever the OKX provider does or does not support behind viem's `custom()` transport, the page
cannot depend on being told — a successful trade that never finishes rendering reads as a failed
one, and the expensive version of that mistake is a user who retries a fill they already made.

`app/components/awaitReceipt.ts` polls `eth_getTransactionReceipt` on a bounded loop instead. A
miss is not a failure: viem throws while the transaction is pending, and on this chain a read can
also land on a node that has not seen the block (D18). Both mean *ask again*. It gives up loudly
after 90 seconds with the hash, because "we stopped looking" and "it failed" are different
sentences. Applied to all three write paths, since `Mandate` and `MandateManage` had the same call.

Exercised rather than assumed, and deliberately without spending anything: the mandate's circuit
breaker was tripped and released from the browser — two writes, no funds moved, `getMandate` back
to `active: true, circuitBreaker: false` — and both completed, re-reading the chain each time.
That is the same write path the fill takes.

### Two smaller things, closed the same day

- **The connection now survives a reload.** `eth_accounts` returns what has already been authorised
  and shows no dialog — unlike `eth_requestAccounts`, which asks — so a refresh picks the session
  back up silently. Only the wallet's `rdns` is remembered, never an address: the wallet is the
  authority on which account is selected, and a stored address goes stale the first time the user
  switches account. `disconnect` clears it, because a disconnect that undoes itself on refresh is
  not a disconnect.
- **Following a thesis now re-points the asset** at that thesis's basket even when one is already
  selected. Following wSPYx and leaving wTSLAx in the box is a fill that cannot carry the hash, and
  the user had to notice and fix it. Applied once per follow, tracked by object identity, so the
  next chain read does not overrule a choice made afterwards.

---

## D66 — The indexer, and what it costs to keep a second copy of a fact

`05-status.md` has carried "indexer — blocked on volume" since before there were any receipts.
The block was real and it has now cleared, but not because volume arrived: **the cost is per
read, not per record.** `loadRegistry()` enumerated both registries on every call — `count()`,
one `get()` per thesis and per receipt, then a token read per distinct asset to resolve symbols —
and every page load of the Simple mode surface paid it, over an RPC that throttles.

Measured before building anything, on the same 16 receipts: **4.97s** for `pnpm track-record`.
With the index, **1.05s**. The ratio is not the point — the shape is. The old path is O(receipts)
RPC round trips on every read; the new one is two `count()` calls plus whatever is new. The number
it scales with is the one number in this system designed only ever to go up.

### An index breaks the repo's own rule, so it pays for it

CLAUDE.md: one source per kind of fact, because the copy is what drifts. An index *is* a second
copy. Three things make that affordable rather than reckless:

- **The chain still decides how much exists.** `count()` is read every time, and the store is only
  consulted for ids below it. A store that is missing, stale, truncated or deleted makes reads
  slower and never wrong, and can never invent a receipt the chain does not have. Deleting
  `observations/registry.jsonl` is a supported operation.
- **Only settled history is indexed.** A record is written once it is 12 blocks deep. Ids in both
  registries are assigned by append-only contracts so an indexed record cannot change — but a
  reorg at the tip could drop the transaction that created it and renumber everything after, so
  the tip is not indexed. Held-back records are reported, not silently skipped.
- **`pnpm index --verify` re-reads every stored record from the chain**, field by field, and exits
  non-zero on disagreement. A full re-read rather than a spot check, because the failure worth
  catching — a store written against a different deployment or chain — is invisible in a sample.
  Run against the first store: 3 theses, 16 receipts, every field matched.

### A file, next to the issuer marks

Same answer as `observations/issuer-marks.jsonl`, which it sits beside: append-only NDJSON,
readable with `tail`, diffable, no infrastructure this project does not have. Duplicate ids are
tolerated on read (last wins) so a re-index or an overlapping run cannot corrupt it, and a
truncated final line — what a killed writer leaves — costs one record rather than the store.

**The writer is the CLI, and deliberately not the publish worker.** The worker's filesystem on
Railway is ephemeral, so an index built there would die with the container and never reach Vercel.
The store is committed instead, which means a deploy ships the history. The cost of that choice is
a manual step someone will forget — and the reason it is acceptable is the first bullet above:
forgetting costs latency, never correctness.

`outputFileTracingIncludes` in `next.config.ts` is what actually gets the file into the
deployment. Without it the store is committed, works locally, and is simply absent in production —
degrading correctly and silently costing every request the enumeration it exists to avoid. The
worst kind of regression is one that only shows up as latency.

---

## D67 — The worker samples onto a volume, and nothing pushes to the repo

Found while answering a plain question — *are `observations/` and `evidence/` committed, and why?*

Both are, deliberately. `evidence/` **is** the pinning: `evidenceHash` goes on chain in the same
transaction as the fill and `evidenceCID` stays empty because nothing pins it (D57), so a bundle
that is not in the repo is a hash pointing at something nobody can produce. `observations/` is what
makes σ re-derivable now that Yahoo is gone (D63) — a number derived from a file nobody else has is
a magic number, which is D5 in reverse.

The gap is what happens to `observations/` **once the publish worker runs**. `publish-loop.ts`
samples every cycle, `railway.json` mounts no volume, and a container filesystem is wiped on
redeploy. So from 18 Aug the one scheduled process that exists to accumulate history would collect
~4,000 marks a day onto a disk that evaporates, and nothing would carry them back. D62's whole
argument — build the history rather than borrow it — executed by a process that throws the result
away.

**Decided: a Railway volume at `/data`, pointed at by `OBSERVATIONS_PATH`, merged back by hand.**

- **Not a repo token on the worker.** The obvious fix is to have the worker commit what it collects.
  That gives repo-write to a process already holding the publisher's hot key, which raises the blast
  radius of that key for data nothing consumes yet. D41 and D42 both chose the other direction.
- **Not mounted over `observations/`.** An empty volume there shadows the copy that ships in the
  image, so the worker appends to an empty file and the 30 committed marks look lost. The volume
  goes somewhere else and `OBSERVATIONS_PATH` points at it.
- **`pnpm sample --merge <path>` folds it back**, deduplicating on `symbol` + `observedAt` — the
  same asset cannot be received twice at the same instant, so two overlapping runs collide exactly
  there. It is idempotent by construction, which matters because it is a manual step and the hand
  that runs it is the one most likely to run it twice. Verified: 30 marks + 12 incoming of which 4
  were new → 34, and a second run → +0.

### The part worth saying out loud

**This store cannot replace σ before judging, and that is not a failure.** What `pnpm measure`
counts is not samples but *session boundaries crossed* — each one is one close-to-open jump. Three
days of sampling gives at most three. So what is being preserved in this window is evidence that
the mechanism works and accumulates, not a statistic anyone should use yet. Sampling at 600s is
over-sampled for the statistic and correctly sampled for bracketing a boundary tightly, and it
costs one HTTP call and no gas, so it stays.

The growth is worth knowing before it is a surprise: ~113 bytes per mark × 28 assets × 144 cycles a
day ≈ **455 KB/day, ~14 MB/month**. With the volume, none of that reaches git until someone merges
on purpose.
