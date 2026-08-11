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

Measured capacity across the whole xStock universe: **~$11k at 0.5% impact**
(`pnpm capacity`). A vault that gathers assets has nowhere to put them.

**Consequence:** users hold their own assets. The system decides what/how much/when/
whether. `PolicyGuard`, `ReceiptRegistry`, `ThesisRegistry` are unchanged; only custody
of funds was dropped.

---

## D7 — Revenue is execution fees → subscriptions → oracle feed, never AUM

Direct consequence of D6. AUM fees on an $11k ceiling are not a business. See
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

Not done before the deadline unless the mainnet fill lands early. Recorded so it is a choice
rather than an oversight.
