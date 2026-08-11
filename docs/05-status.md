# Status — resume here

Last updated **2026-08-11**. Submission deadline **2026-08-21 23:59 UTC** (10 days).

Repo: **github.com/wngstnr-code/reckonz** — private, `main`. `docs/` is **in the repo** as of
2026-08-11; it used to be gitignored, which stopped working once the project became two people.

Read this first, then `04-decisions.md` before changing direction. `07-team.md` says who owns
which files and what each side's next task is; `08-parallel.md` says how to push without
colliding. `06-assessment.md` is the honest read on whether this is a business.

---

## Start of day checklist

```bash
cd /Users/mac/Desktop/okxai
set -a && source .env && set +a     # PRIVATE_KEY, GEMINI_API_KEY, CASH
pnpm typecheck && forge test        # expect: clean, 45 passed
git status --short                  # expect: clean; docs/ is ignored, not missing
pnpm dev                            # the web app, port 3000 (falls back if taken)
```

Nothing is half-finished in the tree. Every unfinished thing is in **Not done** below, not
lurking in the code.

Deployer `0xD7360Dc3ED4fE01bEbB8477594A76CBFb5c79BA5` holds **0.1995 OKB** on testnet —
hundreds of deploys' worth. Faucet: [web3.okx.com/faucet](https://web3.okx.com/faucet) → X Layer
→ Testnet; verify with `cast balance <addr> --rpc-url https://testrpc.xlayer.tech`, never the
faucet UI.

---

## Done

### Project identity

X account **[@reckonz_xyz](https://x.com/reckonz_xyz)** — created 2026-08-11, satisfies the
eligibility requirement. Keep it active until judging; the mandatory `@XLayerOfficial` post is a
separate item and is still outstanding.

### Deployed and verified — X Layer mainnet (chain 196)

```
FairValueOracle  0x3659E05Fbbaafb7bA868171aB98327b62831Cd75
ReceiptRegistry  0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6
PolicyGuard      0x481e0A60c5E105708b86e804811F8fc98a43bEFd
Executor         0xdc2f34A220D4cd7c098D7927454F30AEf3157681
ThesisRegistry   0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E
FeeCollector     0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0   15 bps, ceiling 50
PoolSwapper      0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28
cash (real USDG) 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8
admin/deployer   0xD7360Dc3ED4fE01bEbB8477594A76CBFb5c79BA5
```

### Deployed and verified — X Layer testnet (chain 1952), redeployed 2026-08-11

```
FairValueOracle  0xCc797463921F3b623DB445d5fffAf744f3aC19E5
ReceiptRegistry  0xBb63b9733Ba33117326479F42cd66B7a1B5Fae38
PolicyGuard      0xf3a06c9f0F1AABf01080475E420DD7A1092E1e1B
Executor         0xC4df2F5e72804843DBa0931813e827C67fbE1dDF
TestUSDG (cash)  0x3F58df45FcB5D1074bA5D046D4928CF5efde5f4d
```

`Executor` on 1952 cannot swap and is not meant to: the X Layer v3 factory has no code there, so
there are no pools to derive. `Deploy.s.sol` prints that rather than deploying quietly (D36).

Checked on-chain: `PolicyGuard.oracle/receipts/cash` point at the right addresses,
`ReceiptRegistry.isWriter(PolicyGuard) == true` and `isWriter(deployer) == false` — only the guard
can append receipts. `Executor.permit2/router/guard/oracle/cash` all correct.

### Components

| Component | File | State |
|---|---|---|
| X Layer client, addresses, RPC throttling | `src/chain.ts` | ✅ |
| Uniswap V3 core math (BigInt) | `src/v3math.ts` | ✅ validated vs `slot0`, drift 0.0016% |
| Pool loader + multi-tick exact-input simulation | `src/pool.ts` | ✅ |
| Routing, capacity search, slicing, basket planning | `src/planner.ts` | ✅ |
| Market data — references, 24/7 signals, gap stats | `src/marketdata.ts` | ✅ Yahoo + Coinbase |
| Reference-market admission test | `src/reconcile.ts` | ✅ **28 of 30 admitted**, re-runnable as a regression check (D38) |
| Fair-value engine — β, band, gap risk | `src/fairvalue.ts` | ✅ |
| Off-chain mirror of the on-chain guard | `src/guard.ts` | ✅ |
| Thesis Compiler — schema, prompts, mandate compilation | `src/thesis.ts` | ✅ |
| Gemini provider (free tier) | `src/thesis-gemini.ts` | ✅ **run live**, `gemini-3.6-flash` |
| Claude provider | `src/thesis.ts` | ⚠️ typechecked only, never executed |
| Deterministic fixture provider | `src/thesis-fixture.ts` | ✅ |
| `FairValueOracle` | `contracts/FairValueOracle.sol` | ✅ + basis, capacity |
| `ReceiptRegistry` | `contracts/ReceiptRegistry.sol` | ✅ append-only |
| `PolicyGuard` | `contracts/PolicyGuard.sol` | ✅ triggers + position accounting |
| `ExitTriggers` — all 7 metrics | `contracts/ExitTriggers.sol` | ✅ |
| `Executor` — Permit2 → swap → settle → submit | `contracts/Executor.sol` | ✅ **two real mainnet fills** |
| `V3Swapper` — direct pool swaps, derived addresses | `contracts/V3Swapper.sol` | ✅ the Universal Router cannot swap here (D35) |
| `FeeCollector` — 15 bps, ceiling 50 in code | `contracts/FeeCollector.sol` | ✅ took a real fee |
| `ThesisRegistry` — append-only, no admin | `contracts/ThesisRegistry.sol` | ✅ receipt #2 resolves to thesis #0 |
| Test suite | `test/*.t.sol` | ✅ 64/64 |
| Chain selection + Permit2 helpers | `src/wallet.ts` | ✅ `TARGET=mainnet\|testnet` |
| ABIs, one source, browser-safe | `src/abi.ts` | ✅ `pnpm verify:abi` checks every selector vs bytecode |
| **One real fill, end to end** | `src/execute.ts` | ✅ **run on mainnet twice**; refuses truncated quotes and pool mismatches |
| OKB → USDG funding swap | `src/swap.ts` | ✅ resumable; used to fund the deployer |
| Streamed pipeline (one run, six stages) | `src/pipeline.ts` | ✅ shared by CLI and web |
| Web app — Next.js 16 App Router + Tailwind 4 | `app/` | ✅ **live at reckonz.vercel.app** |
| SSE endpoint | `app/api/run/route.ts` | ✅ streams each stage as it lands |

### Commands

```bash
pnpm verify                  # Uniswap math vs live on-chain state
pnpm verify:abi              # src/abi.ts vs the compiled contracts, selector by selector
pnpm plan [usdg] [maxBps]    # thesis basket: naive vs planned execution
pnpm capacity                # absorbable size per xStock, by impact limit
pnpm oracle [usdg]           # fair value, gap risk, off-chain guard decision
pnpm reconcile               # reference-market admission test over all 30 xStocks
pnpm thesis ["free text"]    # thesis -> assets -> sizing -> mandate
pnpm thesis:gemini "..."     # force the Gemini provider
pnpm oracle:publish          # run the oracle engine, publish on-chain, read back
pnpm mandate                 # create a mandate, install triggers, watch one fire
pnpm deploy                  # deploy the full stack to testnet
pnpm execute <sym> [usdg]    # quote -> dryRun -> Permit2 -> one real fill (TARGET=mainnet)
pnpm dev                     # the web app — thesis in, guard verdict out
pnpm build                   # production build of the web app (what Vercel runs)
pnpm build:contracts         # forge build
pnpm typecheck && pnpm test:sol
```

`pnpm typecheck` now covers `src/` and `app/` together.

`publish` and `mandate` honour `ORACLE_ADDRESS` / `GUARD_ADDRESS` and now default to the
addresses in `src/deployments.ts` — the same ones listed above. They previously defaulted to an
**older testnet deployment that is still live**, which reads as working while writing to the
wrong contract. Keep `deployments.ts` as the single source.

Every on-chain script picks its chain from `TARGET` (default `testnet`) via `src/wallet.ts`.
Nothing imports a chain directly any more.

The script is `oracle:publish`, not `publish`: once this became a git repo, `pnpm publish` started
resolving to pnpm's own package-publishing command instead.

### Results worth keeping

**Capacity** — the whole xStock universe (all 30) absorbs **~$48k at 0.5% impact**, ~$515k at 5%.
Full table in `01-xlayer-reality.md`. This is the fact that killed the AUM business and produced
D6. The earlier ~$11k/~$112k covered the eight priced assets and, at 5%, included a search bound
mistaken for a measurement — see D33 and D34.

**Naive vs planned** — a five-leg semiconductor basket sized naively at $250k pays **~$71,000** in
slippage (28% of the basket). Sized to capacity it pays $28, and reports the $244k it refused to
force into the market.

**Reference-market admission test** (`pnpm reconcile`, 2026-08-11) — **28 of 30 xStocks
admitted**. Every admitted asset reconciles with its reference inside 2.0%; nothing failed on
basis, so the admitted set and the refusals are separated by orders of magnitude rather than by
the threshold. wSKHYx rejects `FX_REQUIRED` (KRW), wSPCXx rejects `NO_CANDIDATE` (private). With
that in place, `pnpm oracle 2000` refuses assets for **`PRICE_IMPACT` at 86–121 bp against a
50 bp mandate** — a real chain-side limit — where 22 of those refusals used to say `NO_REFERENCE`.
See D38.

**Oracle live on-chain** (`pnpm oracle:publish` — ~582k gas for 8 cold slots, ~186k to refresh them):

```
wSPYx  fv 772.97 gap  3 cap 3872 → ALLOW     wSKHYx fv 0 gap 57 cap 804 → REJECT NO_REFERENCE
wNVDAx fv 223.21 gap  1 cap 2812 → ALLOW     wSPCXx fv 0 gap100 cap 883 → REJECT NO_REFERENCE
wMUx   fv 872.80 gap  1 cap  811 → ALLOW
```

**Exit trigger firing on real liquidity** (`pnpm mandate`):

```
trigger: capacityUsdg < 1,000 (basket-wide)
firedTriggers → 1 firing, 0 stale

wMUx     REJECT  TriggerFired — trigger #0: capacity 813.86 < 1000 USDG
wNVDAx   ALLOW
```

**Thesis Compiler, live on Gemini** — compiled a free-text HBM thesis into claim, causal chain,
and beneficiaries with evidence (`"Asserted by the user, no evidence given"` — no fabricated
citations), refused to substitute an unmapped beneficiary, and produced exit triggers resolved to
`wMUx, wSKHYx`.

**The web app, end to end** (2026-08-11, live Gemini + live RPC, ~2 min a run). Same HBM thesis:

```
compile   claim + causal chain + 3 beneficiaries (SK Hynix, Micron, Samsung)
allocate  wSKHYx 52% / wMUx 48%; Samsung -> unmapped, "no matching asset"
triggers  drawdownBpsFromEntry > 1500, flagged as NOT covering Samsung
capacity  $250,000 asked -> $1,618 executable, $248,382 refused
          naive slippage $176,174 vs $8 sized to capacity
guard     wMUx   ALLOW  (fill 814 USDG, 0.50% impact, gap risk 0)
          wSKHYx REJECT NO_REFERENCE (KRW basis withheld)
```

That single run exercises every claim the product makes. It is the demo.

---

## Not done

### Blocking for submission

| Item | Why it matters |
|---|---|
| **The submission post** | The account exists (see Project identity above); what is still required is a post from it mentioning `@XLayerOfficial` **at submission time**. Not done until that post is up. |
| ~~Mainnet deployment~~ | ✅ **Done 2026-08-11.** Addresses in `src/deployments.ts`; oracle seeded, mandate #1 live, one real fill. |
| **Google Form submission** | Required by 21 Aug 23:59 UTC. Link in `00-hackathon.md`. |
| **Repo visibility decision** | The repo is private. The rules do not demand a public one, but judges scoring "product completeness" will want to read it. Decide before submitting: make it public, or grant access. |

### Blocking for a credible demo

| Item | Notes |
|---|---|
| ~~Real fill on mainnet~~ | ✅ **Done 2026-08-11.** `0x7240759d327d468f9a7086ed439abf42dead17887105d986ca0870ebf46d6545` — 0.5 USDG into wSPYx, guard and receipt in the same transaction. |
| **Demo video / walkthrough** | Not started. The web app is now the thing to record. |
| ~~Deploy the web app~~ | ✅ **https://reckonz.vercel.app** — verified end to end in production: live Gemini, 30-asset universe, capacity-limited plan, 1/2 assets would execute. |
| **Wallet connect + mandate creation in the UI** | The page reads and decides; it cannot yet sign. Everything on-chain still happens through `pnpm mandate` / `pnpm oracle:publish`. |

### Known gaps in the work itself

- **Claude provider never executed** — typechecked only. Gemini is the default and works; this is
  a fallback path that has never run.
- **Yahoo Finance is not a production data source.** Fine for proving the model, must be replaced
  before mainnet.
- **Gemini output varies run to run** — two live runs of the same input produced 1 and 2 exit
  triggers; the fixture produces 3. Trigger coverage must be reviewed per compilation, not
  assumed.
- ~~**Reference mapping unverified for some assets**~~ / ~~**The oracle prices 8 of the 30
  xStocks**~~ — ✅ **Closed 2026-08-11 (D38).** `pnpm reconcile` is an admission test, not a
  hand-written list: it reconciles each wrapper's on-chain price against its candidate reference
  and admits the mapping only if they agree. **28 of 30 admitted**, widest reconciling basis 2.0%.
  The two refusals are now measured rather than pending — **wSKHYx** blocked on a KRW/USD leg,
  **wSPCXx** because SpaceX is private. The test re-runs against live data and fails if an
  admitted mapping stops reconciling.
- **wSKHYx still needs an FX leg.** The reference is correct and identified; the basis against a
  USDG pool is not computable in KRW. This is the one remaining unpriced asset with a public
  listing, and it is a sized piece of work rather than an unknown.
- **`.env` holds a live Gemini key** pasted in chat. Owner assessed the exposure as acceptable
  2026-08-11; the key is in Vercel's environment too. Recorded rather than re-argued.
- **No logo.** Four prompt directions were drafted on 2026-08-11 (the cut / the narrowing / the
  guard / the reckoning); none chosen, nothing drawn. The header still uses a bare `◇`.

### Deliberately not started, and why

| Component | Blocked on | Verdict for this submission |
|---|---|---|
| Consumer / simple mode | — | Browse published theses with their on-chain track records. The data now exists (`ThesisRegistry` + `ReceiptRegistry`), so this is mostly an FE question. Last item in the build order. |
| Indexer | volume | No longer blocked on receipts — there are three — but three receipts do not need an index. Real work that only pays off with volume. Roadmap item. |
| ASP / x402 registration | a stable hosted endpoint | The endpoint exists now (reckonz.vercel.app), so this is unblocked and simply not started. Worth naming on the form as planned ecosystem contribution. |

The honest summary: depth was chosen over breadth throughout, and that was the right call for
"product completeness". As of 2026-08-11 the revenue story is no longer a claim — `FeeCollector`
took 15 bps on a real fill — and the thesis → execution → record loop closes on chain. What is
left is not architecture; it is a video, a form, and a decision about who can read the repo.

---

## Suggested order

**1. Mainnet deploy + one small real fill.** The single item that unblocks the most. It satisfies
the hard mainnet requirement *and* turns `Executor`'s swap path from unit-tested into proven.

Concretely, and in this order:

- Fund a mainnet deployer with OKB for gas on chain 196. Check with
  `cast balance <addr> --rpc-url https://rpc.xlayer.tech`.
- `CASH` must be the **real USDG** `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`, not a mock —
  `Deploy.s.sol` only stands up `TestUSDG` when the configured address has no code, so on mainnet
  it will correctly leave it alone.
- `forge script script/Deploy.s.sol --tc Deploy --rpc-url xlayer --broadcast`.
- `TARGET=mainnet pnpm oracle:publish` to seed fair values. Every on-chain script now takes its
  chain from `TARGET`, so none of them can write to testnet while reporting mainnet.
- `TARGET=mainnet pnpm mandate` to create the mandate. **Decide the caps first**:
  `maxNotionalPerTrade` and `maxFillsPerEpoch` are the blast radius if anything goes wrong.
- Then the fill itself: `TARGET=mainnet pnpm execute wMUx 25` — one leg, tens of USDG. It quotes
  live depth, calls `dryRun` and refuses to spend gas on a trade the guard would revert, signs a
  Permit2 authorisation scoped to that one amount and to the executor alone, and executes.
- Expect RPC lag between dependent transactions (D18) — poll until state is visible.
- Record the addresses in `src/deployments.ts` (`MAINNET`, currently `null`); the web app header
  reads it and will show the chip automatically.

**2. Deploy the web app** so the submission is a link, not a checkout. It needs `GEMINI_API_KEY`
in the host's environment and a runtime that allows a ~2-minute streamed response.

**3. Demo video** — record one run of the web app end to end; the evidence block above is the
script.

**4. Repo visibility decision**, then the `@XLayerOfficial` post and the Google Form.

If time remains after all four: `FeeCollector`, then `ThesisRegistry`. Not before.

---

## Log

**2026-08-11 (latest, twelfth)** — `ThesisRegistry` deployed on both chains and **the loop is
closed on mainnet**:

```
thesis #0   published 05:08:46   0xc3cd487e…
receipt #2  filled    05:09:33   carries the same hash
            -> reasoning predates the outcome, checkable by anyone
```

`ReceiptRegistry` already made the executions unfalsifiable. This is the other half: a record of
trades proves what you did, not that you meant to. `thesisHash()` in `src/thesis.ts` hashes a
canonical serialisation — keys sorted at every depth, so the same thesis rebuilt from a different
code path hashes identically — and `execute.ts` refuses to send a hash the registry does not know,
because a receipt pointing at unreadable reasoning is worse than one claiming none.

Three absences do the work: no update or delete, one author per hash (first to publish keeps the
claim), and no admin at all. There is deliberately **no paid-following mechanism** — that is the
part `06-assessment.md` says needs a legal answer first.

Receipts #0 and #1 correctly resolve to *no* thesis. They were untethered fills and the registry
says so rather than inventing a link.

**2026-08-11 (latest, eleventh)** — `FeeCollector` shipped and **taking a real fee on mainnet**.

```
fill 2    tx 0x5710894e80baddfb35ab12321642b16c8cc8ab0b8f9a90a837f7c1e3ee9d1a23
in        0.5 USDG   fee 0.00075 USDG (15 bps)   traded 0.49925 USDG
out       0.000642131415566899 wSPYx
receipt   #1 — amountInUsdg 499250, price 777.49, shortfall 44bp
collector holds 750 units of USDG; executor holds 0
```

The revenue line stops being a claim. Two constraints shaped it: `ReceiptRegistry` could not
change (receipt #0 is the first mainnet fill and lives in the deployed one), so the fee is an
event and not a field; and the fee never reaches a pool, so the receipt records **what was
traded**, not what was pulled — folding it into `amountInUsdg` would make `executionPriceE8` a
price no pool quoted and push the guard into rejecting fills for a cost that is ours rather than
the market's. `shortfallBps` came back 44, not 59.

`MAX_FEE_BPS` is a constant rather than a setting, so a user can bound their worst case by reading
the source instead of trusting the admin. The fee rounds down: dust pays nothing.

`Executor` was redeployed for the immutable collector; guard, oracle and registry are unchanged,
so both fills sit in the same append-only history. Both new contracts verified `exact_match`.

The first attempt was refused by `dryRun` — the oracle had gone stale at 2117s — which cost no
gas and is the guard doing precisely its job.

**2026-08-11 (latest, tenth)** — testnet redeployed so it matches the code again (the old stack
still answers, which was the hazard), and **all nine contracts verified on Sourcify**, every one
an `exact_match` on both creation and runtime bytecode:

```
mainnet 196   FairValueOracle ReceiptRegistry PolicyGuard Executor PoolSwapper
testnet 1952  FairValueOracle ReceiptRegistry PolicyGuard Executor
```

Sourcify needs no API key and X Layer is supported on both chains. `PoolSwapper` had to be
redeployed first — the original predated the D36 audit by hours, so its source no longer matched
its bytecode. An address we publish that nobody can read is worth less than the redeploy cost.

Note this is Sourcify, not OKLink: the source is public and checkable at
`https://repo.sourcify.dev/196/<address>`, but OKLink's own explorer page may still show bytecode
unless it pulls from Sourcify. Verifying there needs an OKLink API key.

**2026-08-11 (latest, ninth)** — web app live at **https://reckonz.vercel.app**. Full pipeline
verified against production, not just a 200: six stages, `gemini-3.6-flash (live)` rather than the
fixture, 30 assets read from the chain, capacity-limited plan, one of two assets refused at the
guard. `pnpm build` now means `next build` — it pointed at `forge build`, which is what Vercel
would have run.

**2026-08-11 (latest, eighth)** — **the first real fill on mainnet.**

```
tx        0x7240759d327d468f9a7086ed439abf42dead17887105d986ca0870ebf46d6545
gas       619,519   block 67653297
in        0.5 USDG        out  0.000643062196002867 wSPYx
price     777.53 (E8 77752976789)   fair value 773.96   shortfall 46bp   gapRisk 7
receipt   #0, mandate #1, policy v3, agent 0xD736…
```

Every number in that receipt was written by the contracts: `executionPriceE8` from the measured
balance delta, `fairValueE8` and `gapRisk` stamped by the guard from the oracle. The agent
supplied routing and nothing else — which is the claim the whole design exists to make.

`Executor` held **0 USDG** afterwards, asserted in the same transaction. wSPYx went straight to
the owner's wallet; the executor never touched it.

`dryRun` said ALLOW before any gas was spent on the fill, and the Permit2 signature was scoped to
0.5 USDG, to that executor, for 20 minutes.

Two gaps surfaced doing it. `pnpm mandate` left the mandate with the owner as its own executor —
which is what lets the demo call `validateAndRecord` directly, and what made the first fill revert
`NotThisExecutor`. The script now hands the mandate to the real `Executor` at the end. And the
25 USDG cap was sized to a round number rather than to the 3.76 USDG balance it guarded; mainnet
defaults are now 1 USDG per trade, live mandate updated to match.

Balances after: **3.263878 USDG**, 0.000643 wSPYx, 0.00981 OKB.

**2026-08-11 (latest, seventh)** — **deployed to X Layer mainnet (chain 196).**

```
FairValueOracle  0x3659E05Fbbaafb7bA868171aB98327b62831Cd75
ReceiptRegistry  0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6
PolicyGuard      0x481e0A60c5E105708b86e804811F8fc98a43bEFd
Executor         0xdc2f34A220D4cd7c098D7927454F30AEf3157681
FeeCollector     0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0   15 bps, ceiling 50
PoolSwapper      0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28
cash             0x4ae46a509F6b1D9056937BA4500cb143933D2dc8  (real USDG, not a mock)
```

Verified on-chain rather than read off the deploy log: guard wiring correct, `isWriter` true for
the guard and false for the deployer, and the executor derives the USDG/wSPYx pool to the same
address the factory reports — the check D35 taught us to make. Deploy cost 0.000128 OKB against an
0.00998 balance.

`TARGET=mainnet pnpm oracle:publish` seeded 8 observations (564k gas), read back identical, with
wSKHYx and wSPCXx correctly REJECT NO_REFERENCE. Six assets would ALLOW.

**2026-08-11 (latest, sixth)** — D36, second pre-mainnet audit. Six gaps closed: deploy script now
refuses dependencies with no code on mainnet (the v3 factory is absent on testnet entirely), an
unchecked `int256` cast bounded, `execute.ts` refuses truncated quotes and verifies the executor
derives the same pool it priced, and `pnpm mandate` caps mainnet blast radius at 25 USDG / 3 fills
instead of the hard-coded 5,000. Mainnet deploy dry-run clean: 8.3M gas, ~0.00033 OKB.
Funded — 3.76 USDG in the deployer.

**2026-08-11 (latest, fifth)** — D35 fixed. `V3Swapper` derives pool addresses from the factory
and answers `uniswapV3SwapCallback`; `Executor` inherits it and the Universal Router is gone from
the codebase. A `Leg` carries a fee tier instead of a path. Verified on mainnet first with
`PoolSwapper`: 0.0001 OKB → 0.009506 USDG, one unit off the simulation. Executor's mock router
became a mock pool etched at the derived address; 53 tests pass. Both stacks need redeploying —
the constructor changed.

**2026-08-11 (latest, fourth)** — D35, found while funding the mainnet deployer: the Universal
Router at `0x66a9…` **cannot execute a V3 swap on X Layer**. Its bytecode carries the canonical v3
factory, X Layer's is non-canonical (D1), so every swap derives an empty pool address and reverts
with no data. `Executor._swap` uses that router, so the mainnet fill is blocked until `Executor`
calls the pool directly. Previous "verification" of the router checked codesize and a selector,
neither of which is evidence a swap works. `src/swap.ts` written and blocked on the same cause;
0.0396 WOKB recovered from the router with `SWEEP`.

**2026-08-11 (latest, third)** — D33 closed: the investable universe is all 30 xStocks, read
from the chain, and separated from the 8 the oracle can price. A thesis about Apple now maps to
wAAPLx and is refused for the true reason instead of the false one. Re-running capacity over 30
exposed D34 — `capacity()` returned its own search ceiling as a measurement for any pool deeper
than $1M-at-limit, which wGLDx was. Headline capacity: **~$48k at 0.5%**, ~$515k at 5%.

**2026-08-11 (latest, second)** — `src/abi.ts`: the contract surface in one place, generated
from the Foundry artefacts and verified selector by selector (`pnpm verify:abi`). `execute.ts`,
`publish.ts` and `mandate-demo.ts` each carried their own trimmed copy; the copies had already
diverged, and a missing `error` entry turns a named revert into unreadable hex. Unblocks the FE's
wallet work — `abi.ts`, `deployments.ts` and `chain.ts` are the browser-safe seam.

**2026-08-11 (latest)** — the project became two people. `docs/` un-gitignored and committed;
`07-team.md` (path ownership + each side's backlog in order) and `08-parallel.md` (branch
protocol, the frozen `RunEvent` contract, `package.json` hazard) written; `CLAUDE.md` updated so
an agent picking up either side reads the ownership table before editing. BE = `src/`,
`contracts/`, `script/`, `test/`, `app/api/`; FE = the rest of `app/`.

**2026-08-11 (later)** — pre-mainnet audit, D31. Three defects fixed with regression tests
(duplicate allowlist entry defeating the weight cap; a zero fair value publishable as a value,
panicking the guard; an unchecked `uint128` cast). Built `src/execute.ts`, the missing ability to
call `Executor` at all, and `src/wallet.ts` so no script can write to the wrong chain. Verified
the Universal Router, Permit2 domain separator, USDG and the V3 path encoding against live
mainnet.

**2026-08-11** — `git init`; the Next.js web app (streamed pipeline, six stages); history split
into 15 commits and pushed to the private repo `wngstnr-code/reckonz`; `docs/` moved out of the
repo; project renamed **Reckonz**; X account @reckonz_xyz created and linked. Two bugs found by
running the thing for real, recorded as D29 (per-leg fill sizing) and D28 (withheld values must
not be displayed).

**2026-08-10** — full contract stack deployed and verified on testnet 1952; 45/45 tests.
