# Status — resume here

Last updated **2026-08-19**. Submission deadline **2026-08-21 23:59 UTC** (2 days).

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
pnpm typecheck && pnpm test         # expect: clean, 281 unit tests, then 106 passed
git status --short                  # expect: clean; docs/ is tracked now, not ignored
pnpm dev                            # the web app, port 3000 (falls back if taken)
```

**On a fresh clone, install the Solidity dependency first.** `lib/` is gitignored and `forge-std` is
neither committed nor a submodule, so `forge test` fails before it compiles and nothing said so
until 2026-08-14:

```bash
pnpm install
forge install foundry-rs/forge-std@v1.16.2   # the version the suite is written against
```

Nothing is half-finished in the tree. Every unfinished thing is in **Not done** below, not
lurking in the code.

Deployer `0xD7360Dc3ED4fE01bEbB8477594A76CBFb5c79BA5` holds **0.1830 OKB** on testnet —
hundreds of deploys' worth. Faucet: [web3.okx.com/faucet](https://web3.okx.com/faucet) → X Layer
→ Testnet; verify with `cast balance <addr> --rpc-url https://testrpc.xlayer.tech`, never the
faucet UI.

Mainnet gas is the scarce one and there is no faucet for it. Re-read 2026-08-17, after the
top-up below:

```
publisher  0x40101A4932dEb95f0A5951BB7fB0fFa7c17e3Ab8   0.003754 OKB   + 0 USDG
deployer   0xD7360Dc3ED4fE01bEbB8477594A76CBFb5c79BA5   0.005944 OKB   + 2.387367 USDG
```

**2026-08-17 — the publisher was topped up from the deployer, not from OKX.** 0.5 USDG swapped
back to 0.004822 OKB through the same two pools `pnpm swap` uses, run in reverse (the reverse
route is not in the repo; see D86, which is the defect that surfaced doing it), then 0.001 OKB
transferred to the publisher. Effective rate OKB $103.7 against a $107 spot — two hops of fee and
5bp of impact. This is a **bridge to 26+ hours, not the funding**: the $5–6 from OKX still has to
land. At 0.02 gwei the publisher now holds **195 runs**, of which 175 are usable before
`publish.ts` aborts at its 20-run reserve — **29 hours** at a 600s interval.

The earlier reading, 2026-08-12 after the browser fill and two oracle publishes, was **~89 runs at
all thirty assets** — under 15 hours at a 600s interval, and the worker publishes all thirty (D85).
It is ~1,532 runs at one symbol and ~766 at four, which is what `PUBLISH_SYMBOLS` (D63) buys for a
hand publish and not what the worker will run on. **It needs $5–6 before 18 Aug** — 17.6 days at
$5, 21.1 at $6, measured at 0.02 gwei and WOKB $107.15 on 2026-08-15.

Read those from the chain, not from here — two fills moved the deployer's USDG after an earlier
version of this file recorded it, and a balance in a document is stale the moment it is written.

---

## Done

### Project identity

X account **[@reckonz_xyz](https://x.com/reckonz_xyz)** — created 2026-08-11, satisfies the
eligibility requirement. Keep it active until judging; the mandatory `@XLayerOfficial` post is a
separate item and is still outstanding.

### Deployed and verified — X Layer mainnet (chain 196)

Migrated 2026-08-11 (D42) for the publish bound. Oracle, guard and executor are new; the
registries and the fee collector are **kept**, so all three real fills stay in one append-only
history. `receipts.count()` was 3 before and 3 after.

```
FairValueOracle  0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09   new — publish-time jump bound
PolicyGuard      0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be   redeployed 2026-08-12 — D56 exit fix
Executor         0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2   redeployed 2026-08-12 with the guard
ReceiptRegistry  0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6   kept — 18 receipts; #15 the first fill from a browser (D65), #16 the first exit from one (D68), #17 the same from the rebuilt CLI
ThesisRegistry   0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E   kept
FeeCollector     0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0   kept — 15 bps, ceiling 50
PoolSwapper      0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28
cash (real USDG) 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8

Safe (2-of-3)    0x98d19BE6e810bEEfC8A0a408D4AEf164B7F1391e   admin of oracle, receipts, fees
  owner 1        0xD7360Dc3ED4fE01bEbB8477594A76CBFb5c79BA5   the deployer
  owner 2        0x75d120B0CC9B9FC3A4bEC6e442BE74ad0E511fBd
  owner 3        0x832ebF3d6b96e3A4c53b243F6107BbBEFC25582f
publisher        0x40101A4932dEb95f0A5951BB7fB0fFa7c17e3Ab8   hot key, publish() only
deployer         0xD7360Dc3ED4fE01bEbB8477594A76CBFb5c79BA5   admin of nothing now
```

⚠️ **The new mainnet `PolicyGuard` and `Executor` reuse addresses the old testnet `TestUSDG` and
`PolicyGuard` had** — the same deployer walking the same nonce sequence on two chains. Nothing is
wrong, but an address alone no longer identifies a contract. Read the chain id with it.

**Mandate #1 on the *old* guard is dead by decision.** The old guard's write permission was
revoked, because two contracts able to append to one append-only history is two places trust can
leak from. Its receipts stand; new activity runs on the new guard.

**The live mandate is #1 on the 2026-08-12 guard** — 1 USDG per trade, 12 fills per 24h, allowing
wTSLAx, wNVDAx, wQQQx and wSPYx, with `capacityUsdg < 1,000` installed basket-wide. It was created
fresh because **mandates do not migrate**: everything on the previous guard, including #3 and its
recorded positions, stayed in that contract's storage. The receipts did not move, so the track
record is continuous across every migration. Mandates #1–#5 on the previous guard are dead — that
guard's write permission was revoked, so they can no longer record anything.

### ~~⚠️ The testnet stack is two contract generations behind mainnet~~ — fixed 2026-08-12

It was, for about half a day. Measured then by comparing deployed bytecode, not by reading dates:

```
Executor      testnet  7,491 bytes    mainnet 10,221 bytes   — no exit() (D51)
PolicyGuard   testnet 13,626 bytes    mainnet 14,170 bytes   — no exit fix (D56)
```

Both mainnet contracts were replaced on the 12th and testnet was not. It mattered because of what
testnet is best at: it is the right place to exercise wallet connect — gas is free and mistakes are
cheap — and `createMandate`, `setTriggers`, `setCircuitBreaker`, `closeMandate` and `updatePolicy`
were all unchanged by D51/D56, so testing those there stayed valid throughout. What could not be
tested was **anything to do with exits**: the function did not exist on that executor, and the
guard would have refused it anyway.

Both are now redeployed and byte-identical in size to their mainnet counterparts (see below), so
the rig runs the same contracts production does. Left visible rather than deleted, because the
gap is the kind that reappears: a rig only stays a rig while somebody re-measures it after each
mainnet move.

`Executor` on 1952 still cannot swap — the X Layer v3 factory has no code there (D36) — so testnet
remains an oracle/guard/registry/mandate rig rather than an execution one. That boundary is
unchanged; what moved is everything on the near side of it.

### Deployed and verified — X Layer testnet (chain 1952)

All `exact_match` on Sourcify. The stack was redeployed 2026-08-11 for D41 — `oracle` is
`immutable` in `PolicyGuard` and `Executor`, so a new oracle cannot be pointed at from the old
ones. That is deliberate — a guard whose oracle can be swapped is a guard whose price source can
be swapped — and the redeploy is what it costs.

**The guard and the executor moved again 2026-08-12**, to close the gap with mainnet described
above. Only those two: `guard` is `immutable` in `Executor`, which is why the executor came along,
and the oracle did not move because it already implemented `peek`. Nothing was stranded — the old
guard's `nextMandateId` was still 1, so it held no mandates, and the registry holds no receipts.

```
FairValueOracle  0x20a30E6fe3e3C2aCad4180EbeEeAD8BC9aB32B5c   + publish-time jump bound
ReceiptRegistry  0xc5589899556749c2D56fD08c7214739c0bA2bF94
PolicyGuard      0xD9d04Bc1324ed4fb23D171893BFACb1c99FD581b   28,343 bytes — same as mainnet
Executor         0xf1b73Fb49CEfcB7CEd27b667c8Ea14bD8f3871D9   20,445 bytes — same as mainnet
FeeCollector     0x40B494716a60e2348eD7470BEF789365DF4d36b5
ThesisRegistry   0x5A2e03eb2B07464Da0821a95411e6614ab16C694
TestUSDG (cash)  0xE2D6d2BBA5Ece46A90F5ab5656664D4182332c32
```

Exercised rather than assumed: **mandate #1 exists on the new guard** — created with the new
executor set at creation and `TestUSDG` as its allowed asset — and `setCircuitBreaker` was
toggled on and back off against it. That is the loop the FE needs from this chain. `mandate:create`
itself is still mainnet-only: it resolves symbols through `addressBySymbol()`, and no xStock is
deployed on 1952.

Previous guard `0x92aF161A…` and executor `0xE127C363…` are still live and still answer, which is
the hazard the D41 note already named: they match `src/abi.ts` closely enough to call and not
closely enough to be the contracts anyone means.

~~**Mainnet still runs the pre-D41 oracle.**~~ — no longer true as of D42, the same day it was
written. Mainnet runs `0xDB7949c9…`, which carries the publish-time jump bound; the testnet
deployment above is no longer ahead of it. Left visible rather than deleted, because a reader who
saw the old sentence needs to know it was superseded.

`Executor` on 1952 cannot swap and is not meant to: the X Layer v3 factory has no code there, so
there are no pools to derive. `Deploy.s.sol` prints that rather than deploying quietly (D36).

Checked on-chain after the 08-12 redeploy: `PolicyGuard.oracle/receipts/cash` point at the right
addresses, `ReceiptRegistry.isWriter(newGuard) == true`, `isWriter(oldGuard) == false` and
`isWriter(deployer) == false` — only the current guard can append receipts. The registry's admin
on 1952 is a 2-of-3 Safe as it is on mainnet, so both `setWriter` calls went through it, granted
before revoked. `Executor.permit2/factory/guard/oracle/cash/feeCollector` all read back correct,
and `exit()`'s selector `0xac1b7ade` is present in the new runtime bytecode and absent from the
old one.

### Components

| Component | File | State |
|---|---|---|
| X Layer client, addresses, RPC throttling | `src/chain.ts` | ✅ |
| Uniswap V3 core math (BigInt) | `src/v3math.ts` | ✅ validated vs `slot0`, drift 0.0016% |
| Pool loader + multi-tick exact-input simulation | `src/pool.ts` | ✅ |
| Routing, capacity search, slicing, basket planning | `src/planner.ts` | ✅ |
| ~~Market data from Yahoo~~ | ~~`src/marketdata.ts`~~ | **Deleted 2026-08-12 (D63).** The last unlicensed source. What it was still being borrowed for — a year of close-to-open jumps — is now built rather than borrowed. |
| Our own price history | `src/observations.ts`, `pnpm sample` | ✅ append-only store of the issuer's marks in `observations/`, written every cycle by the publish worker. `pnpm measure` derives the gap σ from it and **refuses below 30 jumps per asset**, reporting how far along it is rather than deriving a σ from a short series (D63). |
| Permit2 authorisation, browser-safe | `src/permit.ts` | ✅ the piece the web app was missing. Exercised by every CLI fill — `src/execute.ts` routes through it — so the browser half is proven rather than merely written (D63). |
| The issuer's own view of an xStock | `src/issuer.ts` | ✅ read-only. Backed's two-sided quote, per-session spread, corporate-action multiplier and X Layer wrapper address. Observed in `pnpm reconcile`; **nothing from it is published on chain** and no verdict depends on it (D62). |
| Admission test, against the issuer's mark | `src/reconcile.ts` | ✅ **30 of 30 admitted** (D62; 28 under the old exchange reference), re-runnable as a regression check |
| Fair-value engine — β, band, gap risk | `src/fairvalue.ts` | ✅ |
| Off-chain mirror of the on-chain guard | `src/guard.ts` | ✅ |
| Thesis Compiler — schema, prompts, mandate compilation | `src/thesis.ts` | ✅ |
| Gemini provider (free tier) | `src/thesis-gemini.ts` | ✅ **run live**, `gemini-3.6-flash` |
| ~~Claude provider~~ | — | **Removed 2026-08-12 (D59).** Gemini is the only live provider; the fixture is the floor. The risk was selection, not dead code: `pickProvider` took whichever credential was present, so a stray `ANTHROPIC_API_KEY` would have routed the compiler through a path nobody had ever run. |
| Deterministic fixture provider | `src/thesis-fixture.ts` | ✅ |
| `FairValueOracle` | `contracts/FairValueOracle.sol` | ✅ + basis, capacity, publish-time jump bound (D41) |
| Safe 2-of-3 over the oracle admin | `src/safe.ts`, `src/safe-admin.ts` | ✅ proven on testnet (D40), handover done on mainnet, and **exercised on mainnet 2026-08-12** — `setTreasury` through the Safe, nonce 0 → 1. `treasury` is the Safe itself now, not the deployer EOA (D55). |
| `ReceiptRegistry` | `contracts/ReceiptRegistry.sol` | ✅ append-only |
| `PolicyGuard` | `contracts/PolicyGuard.sol` | ✅ triggers + position accounting |
| `ExitTriggers` — all 7 metrics | `contracts/ExitTriggers.sol` | ✅ |
| `Executor` — Permit2 → swap → settle → submit | `contracts/Executor.sol` | ✅ **14 real mainnet fills**, receipts #0–#13. #9–#13 are the first executions priced by the issuer-referenced oracle (D62) — five exits, all `dryRun ALLOW`, clearing the deployer's four positions back to USDG. #4 is the first **exit** — 0.1 USDG of wSPYx sold back, `isExit: true` (D51). Redeployed 2026-08-12 for the exit path, and again the same day for D56 — mainnet now runs `0xD3d4aeD6…`, testnet `0xf1b73Fb4…`. `0x09af5194…` was the in-between one; the one before that could only ever buy. |
| `V3Swapper` — direct pool swaps, derived addresses | `contracts/V3Swapper.sol` | ✅ the Universal Router cannot swap here (D35) |
| `FeeCollector` — 15 bps, ceiling 50 in code | `contracts/FeeCollector.sol` | ✅ took a real fee |
| `ThesisRegistry` — append-only, no admin | `contracts/ThesisRegistry.sol` | ✅ receipt #2 resolves to thesis #0 |
| Test suite | `test/*.t.sol` | ✅ 106/106 — `pnpm check:tests` fails if this number drifts |
| Chain selection + Permit2 helpers | `src/wallet.ts` | ✅ `TARGET=mainnet\|testnet` |
| ABIs, one source, browser-safe | `src/abi.ts` | ✅ `pnpm verify:abi` checks every selector vs bytecode |
| **One real fill, end to end** | `src/execute.ts` | ✅ **run on mainnet twice**; refuses truncated quotes and pool mismatches |
| OKB → USDG funding swap | `src/swap.ts` | ✅ resumable; used to fund the deployer |
| Streamed pipeline (one run, six stages) | `src/pipeline.ts` | ✅ shared by CLI and web |
| Web app — Next.js 16 App Router + Tailwind 4 | `app/` | ✅ **live at reckonz.xyz** |
| SSE endpoint | `app/api/run/route.ts` | ✅ streams each stage as it lands |

### Commands

```bash
pnpm verify                  # Uniswap math vs live on-chain state
pnpm verify:abi              # src/abi.ts vs the compiled contracts, selector by selector
pnpm plan [usdg] [maxBps]    # thesis basket: naive vs planned execution
pnpm capacity                # absorbable size per xStock, by impact limit
pnpm oracle [usdg]           # fair value, gap risk, off-chain guard decision
pnpm reconcile               # reference-market admission test over all 30 xStocks
pnpm safe:prove              # deploy a 2-of-3 Safe and make it administer the oracle (testnet)
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
pnpm check:tests             # the suite size, compared against every doc that states it (D60)
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

**Capacity** — the whole xStock universe (all 30) absorbed **$97,329 at 0.5% impact** on
2026-08-15, $759,633 at 5%. Always quote it with the date: it was ~$48k/~$515k four days earlier
and doubled with no change on our side (D84). Full table in `01-xlayer-reality.md`. This is the
fact that killed the AUM business and produced D6, and it has survived every re-measurement — the
earlier ~$11k/~$112k covered the eight priced assets and, at 5%, included a search bound mistaken
for a measurement (D33, D34).

**Volume** — the same pools traded **$12,038,377 in 24h** on 2026-08-15, 81% of it in wAAPLx and
wGOOGLx alone. Depth is not volume, and this repo had only ever measured depth. Read the
concentration before the total: that shape is order-book arbitrage, not flow a non-custodial
router can serve. See D84.

**Naive vs planned** — a five-leg semiconductor basket sized naively at $250k pays **~$71,000** in
slippage (28% of the basket). Sized to capacity it pays $28, and reports the $244k it refused to
force into the market.

**Reference-market admission test** (`pnpm reconcile`, 2026-08-11, superseded by D62 — now 30 of 30 against the issuer) — **28 of 30 xStocks
admitted**. Widest reconciling basis **2.0%** (wIBMx); narrowest failing one **86.4%** (wSKHYx).
A factor of 43 between them, so the threshold could sit anywhere across an order of magnitude and
admit the same 28. wSPCXx rejects `NO_CANDIDATE` (private). With that in place, `pnpm oracle 2000`
refuses assets for **`PRICE_IMPACT` at 86–121 bp against a 50 bp mandate** — a real chain-side
limit — where 22 of those refusals used to say `NO_REFERENCE`. See D38 and D39.

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

**Those numbers are a transcript of 2026-08-11 and have moved since — do not paste them.** Re-run
before any external use. On 2026-08-15 the same thesis (`LLM_PROVIDER=fixture pnpm thesis`, which
now resolves five assets rather than two) sizes **$250,000 asked → $6,627 executable, $243,373
refused**, naive slippage **$55,148 against $33** for the part that fits — legs at wMUx 2,675,
wSKHYx 888, wSNDKx 980, wNVDAx 1,222, wINTCx 862. The shape of the demo is unchanged; every
figure in it is a reading with a date (D84).

---

## Not done

### Blocking for submission

| Item | Why it matters |
|---|---|
| **The submission post** | The account exists (see Project identity above); what is still required is a post from it mentioning `@XLayerOfficial` **at submission time**. Not done until that post is up. |
| ~~Mainnet deployment~~ | ✅ **Done 2026-08-11.** Addresses in `src/deployments.ts`; oracle seeded, mandate #1 live, one real fill. |
| **Google Form submission** — draft ready in `docs/10-submission.md` | Required by 21 Aug 23:59 UTC. Read 2026-08-14 — it is **eight fields**: name, description, project URL, optional GitHub, contacts, optional X post URL. **No track selector, no video field, no deck.** So AI-RWA is inferred from the description alone, and the description is the highest-leverage artifact in the submission. Form and analysis in `00-hackathon.md`. |
| ~~**Repo visibility decision**~~ | ✅ **Public 2026-08-17**, at `github.com/wngstnr-code/reckonz`. Disclaimer §4 says the Organizer will consider **code quality**, so a blank `Github` field on the form forfeits a stated criterion — and code quality (106 Foundry + 257 unit tests including a red-team suite over the compiler, CI, 14 of 14 verified contracts, an append-only decision log) is one of the few places we beat a polished demo. Checked before flipping: `.env` was never tracked, and all six live secrets were matched against every one of the 160 commits — no hit. **Put the URL in the form.** |

### Blocking for a credible demo

| Item | Notes |
|---|---|
| ~~Real fill on mainnet~~ | ✅ **Done 2026-08-11.** `0x7240759d327d468f9a7086ed439abf42dead17887105d986ca0870ebf46d6545` — 0.5 USDG into wSPYx, guard and receipt in the same transaction. |
| **Demo video / walkthrough** | Not started, and **not a submission requirement** — the form has no video field (checked 2026-08-14). Still worth linking from the description or the site, but it now competes for time rather than blocking. The web app is now the thing to record. **Script it from the corrected positioning (D49), not from memory** — two of the three "nobody does this" claims are dead, and the ICE/OKX context is the strongest card available. |
| ~~Deploy the web app~~ | ✅ **https://reckonz.xyz** — verified end to end in production: live Gemini, 30-asset universe, capacity-limited plan, 1/2 assets would execute. |
| ~~**Wallet connect**~~ — **built 2026-08-12** | The header connects, switches between 1952 and 196, and hands out a viem `WalletClient`. EIP-6963 + viem's `custom()` transport, so no wallet library and no change to `package.json`. No WalletConnect, therefore no mobile QR path. Taken over from FE, see `07-team.md`. |
| ~~**Mandate creation in the UI**~~ — **built 2026-08-12** | `app/components/Mandate.tsx`: set the blast radius, pick assets from `GET /api/universe`, `createMandate` from the user's own wallet, then poll until the mandate is readable (D18) and show its id with an explorer link. The user is `owner` *and* `agent`; `executor` is the deployed `Executor`, which is what `Executor.execute` checks before it will pull funds. **Not yet exercised against a real wallet extension** — see below. |
| ~~**Simple mode in the UI**~~ — **built 2026-08-12** | `app/components/Theses.tsx`: every published thesis with its basket derived from settled fills, its notional-weighted slippage, whether it was published before every fill, and the receipts underneath — plus the unattributed receipts and any orphaned hashes, rendered rather than dropped. It reads `GET /api/theses`, so the page and `pnpm track-record` cannot disagree (D28). **Follow** hands the executed basket to the mandate form (`app/components/follow.ts`, a one-way DOM event) which preselects those assets and nothing else — the caps, the size and the signature stay with the follower. A followed thesis's hash is carried into the fill below, so a follower's execution lands back in that thesis's track record. |
| ~~**Fill from the browser**~~ — **done 2026-08-12, receipt #15 on mainnet** | `app/components/Fill.tsx` + `POST /api/fill` + `src/fill.ts` (D64). The server quotes, checks the pool the executor derives, reads the oracle, runs `dryRun` and hashes the evidence; the browser approves Permit2, signs an authorisation scoped to one token/amount/spender/20 minutes, and sends `execute`. **No key on the server.** **Exercised end to end against the OKX extension** (D65): receipt **#15**, tx `0xcdb607a8…`, 0.49925 USDG into wSPYx at 776.8877 against fair value 776.9450 — 0 bps slippage, gap 4 — carrying thesis #0's hash and evidence `0xf0e8df15…`, which `pnpm evidence` re-derives. It appears in thesis #0's track record on the same page. Two bugs were in the way and are fixed: `useWallet` gave every component its own connection, and `waitForTransactionReceipt` never returned through the injected provider — the replacement is `app/components/awaitReceipt.ts`, proven by tripping and releasing the breaker from the browser (two writes, no funds moved). The connection now survives a reload, and Follow re-points the asset at the thesis's basket. |
| ~~**Exit from the browser**~~ — **done 2026-08-14, receipt #16 on mainnet** | `app/components/Exit.tsx` + `POST /api/exit` + `src/exit-plan.ts` (D68), the mirror of the fill chain. Entering was a page and leaving was a terminal, which is the wrong asymmetry for risk tooling. The permit names the **asset** rather than USDG, so each xStock needs its own one-off Permit2 approval; size is named in units rather than as a dollar target, so a stale oracle cannot decide how much you may sell. **Exercised end to end against the OKX extension:** receipt **#16**, tx `0x85501e91…`, 0.0005 wTSLAx → 0.169961 USDG gross (0.169707 net) at fee tier 500, evidence `0xedaeaefc…` which `pnpm evidence` re-derives. The oracle was 158,738s stale and the receipt records `slippageBps: 0` with `fairValueE8: 0` — the guard catching its own Stale revert, which is what the off-chain mirror predicted. `src/exit.ts` now calls the same planner, so the CLI cannot drift from it. |
| ~~**The assets board**~~ — **built 2026-08-17** | `/assets`, the way into the console and the page that makes the argument. All 30 xStocks with a fair value, its gap risk, and **how much the market can actually absorb** — the number nobody else measures. It cannot be computed per request (the walk is ~2 min of throttled RPC), so `src/board.ts` measures it and `src/board-store.ts` persists it: blob first, committed file as the floor, `withheld` when a priceless board would displace a priced one. `publish-loop` runs it hourly after the publish, never in front of it, and its failure cannot stop a publish. The page reads `fetchBoard()` directly; `GET /api/board` is what the refresh button and any agent asks. **A card grid and a table behind one toggle**, with filter, sort and search held above both so they cannot disagree. The chart on each card is the real eight-rung depth ladder, drawn against a fixed 500bp ceiling so cards stay comparable. **The size is a slider over those eight measured rungs**, not a constant and not interpolated: at $250 all 21 tradable assets are allowed, at $1,000 fifteen, at $5,000 three, past $25,000 none — the collapse is the product. Logos are local (`public/xstock-logos/`) rather than the issuer's CDN, which went down the same afternoon. **The priceless-board state is drawn**: when the issuer is out and every value is withheld, the page says the depth is still real and the refusals are ours, rather than rendering nineteen working markets as nineteen broken ones. |
| ~~**How this is measured, and one real idea priced**~~ — **built 2026-08-17** | The bottom half of `/assets`. `HowItWorks` states the four claims the repo can be held to, each naming the thing that enforces it rather than an intention, and sits below the data so only the readers with questions pay for them. `VerdictRibbon` renders `observations/showcase.json`, written by **`pnpm showcase`** (`src/showcase-record.ts` runs the real pipeline; `src/showcase.ts` is the store, kept separate so reading a recording does not drag the pipeline into the page's module graph). It is a live Gemini run, not the fixture, and `parseShowcase` refuses `live: false` on read as the recorder does on write — seven tests pin it. The first recording asked $250,000, placed $1,086, left $248,914 unplaced, avoided $178,495 of impact, **and was then refused by the guard at 51bp against a 50bp limit**. Kept as it came out; re-running until the numbers read well would make it a selection rather than a measurement. See the planner-margin gap below, which this is what found. |
| ~~**Per-asset detail page**~~ — **built 2026-08-18** | `/assets/[symbol]`, rendered from the board payload that was already on the wire, so it costs what `/assets` costs. The eight-rung ladder as a table (size, impact, effective price, verdict), capacity at all four impact limits rather than only the mandate's, gap risk split into staleness / displacement / uncertainty / basis, the pool counts, and the engine's own notes. Rows link from the ticker, cards link whole. Case-insensitive lookup, `notFound()` for a symbol the board never measured. **One overclaim was caught writing it:** the summary said "the largest size this market takes is $50,000, past that the guard reverts" when $50,000 was simply the last rung quoted and it had passed — a ladder that finds the boundary and a ladder that runs out are different facts, and only one is a limit. |
| ~~**Mandate policy editing in the UI**~~ — **built 2026-08-14** | `updatePolicy`, `setAgent`, `setExecutor` and `setAssetAllowed` are in `MandateManage` (D70). The policy form is pre-filled and sends the **whole** struct back, because `updatePolicy` replaces wholesale. Field widths are checked before gas. |

| ~~**Zero unit tests for `src/`**~~ — **136 of them, 2026-08-14** | `node:test` via `tsx --test`, no runner dependency (D71). `pnpm test:unit`, or `pnpm test` for both suites. Ten files: `guard`, `fill`, `exit-plan`, `v3math`, `planner`, `triggers`, `evidence`, `permit`, `observations`, `indexer`, `issuer`. The arithmetic mirrors are pinned against **receipts on mainnet** rather than invented vectors — a test against a real receipt cannot agree with a wrong mirror. Found and fixed three things on the first run: a wrong operator rendered for an undecodable comparator, dust deleted by `schedule()`, and a floating-point boundary where `guard.ts` is stricter than the chain (left in place, pinned, and written up). `pnpm check:tests` now guards both counts. |

| ~~**Nothing tested the model's output as hostile input**~~ — **24 red-team tests, 2026-08-14** | `src/thesis-redteam.test.ts` (D75). Hand-written adversarial model responses run the whole distance from JSON to `setTriggers`: invented metrics, injected instructions in the prose, a trigger the model itself called unobservable, scope that resolves to nothing, thresholds outside the metric's domain. **It found two live defects.** An invented symbol used to vanish at the planner and surface as `unallocated` — a hallucination reported to the user as capacity the market refused; `validateAllocation` now names it. And `gapRisk > 5000` installed cleanly on a 0-100 score and could never fire; `METRIC_DOMAIN` + `reachability()` drop the unreachable and flag the always-firing. Unit suite 136 → **160**. |

| ~~**An unmeasured exit rendered as a flawless one**~~ — **fixed 2026-08-14 (D77)** | With a stale or silent oracle `Executor._exitShortfallBps` returns zero, so `maxSlippageBps` bounds nothing — correct, and D51/D56 are why. But receipt #16 (`slippageBps: 0`, `fairValueE8: 0`, oracle 158,738s old) rendered as **0 bps**, the best number available, for the one case where no protection applied. `prepareExit` now returns `shortfallBps: null` with a `status`, selling in that state needs `--unmeasured` / `acknowledgeUnmeasured: true` and is recorded in the evidence bundle, and `shortfallMeasured()` in `abi.ts` makes the page and the terminal print `slip unmeasured`. The contract is unchanged: it is a **disclosed** limitation with consent attached, not a closed one. |

| ~~**The public routes had no rate limit**~~ — **gated 2026-08-14 (D78)** | `src/ratelimit.ts`: a token bucket plus an in-flight cap on `/api/run` (3 burst, 6/min, 2 concurrent — the only route that spends an LLM quota), `/api/fill` and `/api/exit` (6, 20, 3) and `/api/theses` (10, 30, 4). `/api/universe` is cached for an hour and mostly never reaches a function. Inputs are bounded too: 2,000 characters of thesis, a notional in (0, 100M], an impact limit in (0, 10000] — `Number('abc')` used to reach the planner as NaN. **Exercised against the running server**, not just written: four served and four `429`s on eight concurrent reads, two and three on five concurrent runs. Per instance, not global — see D78 for what that is honestly worth. |

| ~~**The oracle had one source and no second opinion**~~ — **cross-checked 2026-08-14 (D79)** | `src/crosscheck.ts`, between the engine and `publishMany`: the quote against itself, the spread against plausibility (2,000bp), the mid against our own `observations/` store (`max(8σ, 20%)`), and the value against the pool (50%). Every threshold derived from a number already measured here — see D79 for each derivation. It **withholds, never corrects**, publishing the shape an unpriceable asset already takes, and a check that cannot run reports `skipped` rather than `ok`. Run against live quotes for all 30 assets: **30 publishable, 0 withheld**. |

| ~~**A plan sized to pass its own guard by a coin flip**~~ — **fixed 2026-08-18 (D89)** | `capacity()` bisects for the largest size still inside the impact limit, so it returns a size sitting *on* it — asked for 50bp it handed back an order measured at 50bp. Stage 6 then re-reads the pool through `loadVenues`, seconds and a dozen RPC calls later, and rejects on `>`. Two runs of one thesis minutes apart: 2/2 allowed, then rejected at 51bp, with nothing edited in between. `PLAN_HEADROOM = 0.9` in `src/planner.ts` now sizes to 45bp against a 50bp guard, applied inside `planBasket` so no caller can forget it and **not** inside `capacity()`, which `pnpm capacity`, `src/board.ts` and `src/publish.ts` report as a measurement. 0.9 is a stated choice, not a number derived from anything. ~~Deriving it from the impact volatility in `observations/`~~ — **that data never existed; `pnpm drift` now measures it, 2026-08-18 (D90).** **A worse defect was found on the way:** `planBasket` sized against the caller's `maxImpactBps` while `checkExecution` judged against `DEFAULT_MANDATE`'s hardcoded 50, and `/api/run` accepts up to 10,000 — so `?maxImpactBps=100` sized every leg to a limit the guard then rejected, all of them, deterministically. The run computes `guardMaxBps = min(request, mandate)` once and both stages use it. The `plan` event carries `planImpactBps` alongside `maxImpactBps`, additive. Unit suite 255 → **257**. |

| ~~**Evidence bundles were never stored in production**~~ — **fixed 2026-08-14 (D80), pending one account step** | Measured against the live app: `evidence.stored false`. Vercel's filesystem is read-only, so every fill placed through the website put a hash on chain whose bundle existed nowhere — the audit trail worked only on the machine it was written on. `src/evidence-store.ts` archives to Vercel Blob, falls back to disk, and otherwise reports `none` **with the reason**; `readEvidence` reads the archive as well as the disk, so `pnpm evidence` can verify a production fill from a fresh clone; and both panels offer the bundle as a download. Store `reckonz-evidence` (`store_kqJdljzlkaaN4S05`) is created, connected and **proven**: a bundle uploaded, the local copy absent, every credential unset, `readEvidence` fetched it from the archive and the hash re-derived. `EVIDENCE_BLOB_BASE` is pinned to the host the upload actually returned. **Proven in production 2026-08-14**: a fill quote came back `persistence: {"kind":"blob",…}`, and the bundle was then fetched from the archive with no local copy and no credentials, hash re-deriving. |

| ~~**Nothing watched the publisher**~~ — **`GET /api/health`, 2026-08-14 (D81)** | The oracle sat 173,242s stale, every fill refused, and the deployment answered every request in milliseconds. The route answers *could a fill succeed right now* — RPC reachable, and the live mandate's own allowlist checked asset by asset — and returns **503 when nothing can trade**. The rule is a pure function with ten tests, one of which failed first and caught an empty allowlist being reported as healthy. Watched it flip on live data: `degraded` at 862s, `down` 75s later when wSPYx crossed `maxAge`. ~~Still needed: something that calls it~~ — **closed 2026-08-17**: `.github/workflows/health-check.yml`, every 5 minutes, on GitHub rather than Railway so the monitor does not share a failure domain with the worker it watches. It reads the **body**, not the code: `degraded` answers 200 by design, and `degraded` is what an asset crossing `maxAge` looks like. **The failure path was exercised, not assumed** — dispatched once at a 404 route, the run failed and the alert email landed. A monitor whose failure branch has never fired is an assumption about the day it matters. |

| ~~**One RPC, and everything went through it**~~ — **three, with failover, 2026-08-14 (D82)** | Seven endpoints probed, three survived and each was made to execute a real `eth_call` before being trusted (D35): `rpc.xlayer.tech`, `xlayerrpc.okx.com`, `xlayer.drpc.org`; testnet has two. viem's `fallback` with `rank: false` — ranking would ping every endpoint on a timer, which against throttling RPCs spends the budget it is meant to conserve. `walletFor` shares the transport so reads and writes cannot drift apart. Failover watched happening with a dead primary (1,706ms, served by the next), and `pnpm verify` passes through it. |

| ~~**No WalletConnect, so no phone path**~~ — **built 2026-08-14 (D83)** | A second connector on the same EIP-1193 store, so no panel or call site changed. `optionalChains` so wallets that have never heard of X Layer still pair; dynamically imported, and measured out of the wallet chunk (0.53 MB in its own two chunks). Clicking it with a wrong project id found two real bugs: `init` never rejected and the button spun forever, and one failure poisoned every retry. Both fixed and pinned. Project id set and deployed 2026-08-14, QR verified rendering against production (registry 70+, against `0` with a dummy id), and **a real phone has paired**. |

### Known gaps in the work itself

- ~~**The logic that decides every verdict on `/assets` cannot be tested.**~~ **Fixed 2026-08-18.**
  `board-format.ts` holds `verdictOf`, `pricing` and `freshness`, and both the runner glob and
  `check-tests.ts` listed directories flat — so a test file in `app/components/console` was
  collected by nobody and would have passed by never running. Both now include it; sixteen tests
  added, two of them pinning rules that were bugs first.
- ~~**The planner sizes to exactly the guard's limit, so a plan is refused by its own guard on any
  drift.**~~ **Fixed 2026-08-18 (D89).** Found by FE while recording `pnpm showcase`, and the
  measurement that found it is the one worth keeping: two runs of the *same* thesis minutes apart,
  the first sizing wCRCLx and wCOINx to `plannedImpactBps: 50` with the guard measuring 50 on both
  (`2/2 would execute`), the second sizing wCOINx to 50 and the guard measuring **51** (`0/1`).
  The fill the guard was asked about was *smaller* than the leg (1086 vs 1086.34), which is what
  ruled out an off-by-one and left the pool moving between the two walks. `PLAN_HEADROOM = 0.9`
  took the first of the two suggested routes — size to a fraction of the limit — because the
  second only narrows the window and the fill happens later still. **One thing this leaves:**
  ~~`observations/showcase.json` is now a recording of the old behaviour~~ — **re-recorded
  2026-08-18 (D93)**: same thesis, live Gemini, both legs planned at 45bp against a 50bp guard and
  **2/2 would execute**. $250,000 asked, $1,702 placed, $248,298 refused, $152,963 of impact
  avoided. The refusal on the page was a defect that no longer exists.
- ~~**The drift store holds two samples and needs thirty.**~~ **Crossed 2026-08-18: 40 samples**,
  and the answer was *leave 0.9 alone* — the adverse tail says 0.98 and the absolute tail says 0.78,
  and a store whose two readings differ by that much cannot justify loosening anything. See the D90
  amendment. What would settle it is a store spanning several sessions rather than two hours of one.
- **The gap σ needs about six weeks, not more sampling.** 5,250 marks and still 1/30 boundaries: σ
  counts close-to-open jumps, so it advances once a trading day however densely the worker samples.
  Nothing to do but leave the worker up — and it is the reason the 3 Sep top-up decision is not
  only about the oracle.
- ~~**The drift store holds two samples and needs thirty.**~~ `pnpm drift --report` withholds a
  suggested `PLAN_HEADROOM` until then, and 0.9 stays in force meanwhile (D90). Closing it is
  `DRIFT_INTERVAL_SEC=1800 pnpm drift --loop` left running somewhere for a day — about 48 passes —
  and then `pnpm drift --merge` if it ran anywhere but here. Nothing depends on it: the planner
  already has a number, and this only decides whether that number is the right one.
- **`AssetMark`'s fallback to the next extension does not reliably fire.** Found 2026-08-18 while
  fixing the broken logos below. With five `.png` sources 404ing, the network shows only *one* of
  the five retried its `.svg`; the other four never requested it and rendered the browser's broken
  image glyph rather than the ticker the component promises. The retry sets state and remounts via
  `key={attempt}`, and the replacement `<img>` carries `loading="lazy"` — the most likely reading is
  that the deferred load never starts for a mark that was offscreen when the error fired. Invisible
  today, because all thirty resolve on the first try. It matters the moment a file is missing, which
  is exactly the case the fallback exists for. FE's file, and worth a test that mounts the component
  against a 404.
- ~~**`/api/health` exists and nothing calls it.**~~ **Closed 2026-08-17** by
  `.github/workflows/health-check.yml`, every five minutes, on GitHub so the monitor does not share
  a failure domain with the worker it watches. **And since 2026-08-18 it watches the gas too**
  (D91): the route reads the publisher's balance and reports a runway, `degraded` under seven days,
  so the 3 Sep top-up reminder is a thing the system says rather than a thing to remember.
- **The evidence store fills up with allowed plans, not just executed fills.** A bundle is archived
  when the guard allows, which is before anything is signed. True of `evidence/` on disk since D57;
  a public store only makes it visible. The receipt remains the proof a fill happened.
- **The cross-check's history arm lapses without the worker.** Its window is 48 hours, so with
  nothing sampling, `step-vs-history` degrades to `skipped` within two days of the last mark — the
  arm that closes D41's re-anchoring hole is exactly the one that needs the publish worker up. One
  more reason the 18–19 Aug item is the load-bearing one.
- **The rate limit is per instance, and the key is spoofable — partly closed 2026-08-15.** D78
  bounds one caller against one warm instance; it does not coordinate across them, and
  `x-forwarded-for` is whatever a direct caller says it is. It is a cost ceiling, not a guarantee.
  A Vercel WAF rule now sits in front of `/api/run` — `rule_rate_limit_api_run_CXxLli`, 30 requests
  per 60s keyed on the real client IP at the edge, so the spoofable header is out of the loop for
  the one route that spends an LLM quota. **Verified, not assumed**: 41 probe requests logged
  exactly 11 over the threshold. Two things it does not fix — the action is still `log`, so nothing
  is refused yet, and WAF counters are per region rather than global. The plan allows one such
  rule, so `/api/fill`, `/api/exit` and `/api/theses` keep only the in-process bucket, and
  `maxInFlight` stays the only bound on concurrency anywhere. See the D78 amendment.
- **A stale oracle still means an unbounded exit on chain.** D77 made it visible and consented;
  it did not make `PolicyGuard` able to stop it. The only protection in that state is the
  `minAmountOutUsdg` floor the owner signed into the leg. Closing it properly needs an `Executor`
  that takes the acknowledgement as a parameter, which means a redeploy and moving every mandate's
  executor pointer — not eight days out. The publish worker running through judging is what keeps
  the case rare; the receipt is what makes it visible when it happens.

- ~~**The compiled exit triggers are displayed and never installed.**~~ — **closed the same day
  (D76).** Found by the D75 sweep: `encodeTriggers` is the join between a compiled thesis and
  `PolicyGuard.setTriggers`, it was tested twice over, and **no production path called it** —
  `mandate-edit.ts`, `mandate-demo.ts` and `app/components/MandateManage.tsx` all hand-built
  triggers from what the user typed, so "the same compilation produces the entry and the risk
  rules" was true of `pipeline.ts` and false of anything that wrote to the chain. The triggers
  panel now hands them to the mandate form over `reckonz:install-triggers`, the form encodes them
  against the allowlist as it is picked, and `setTriggers` goes out as a second transaction after
  the mandate is readable. **Written and type-checked, never run against a wallet** — same status
  the fill path had before D65, and the same lesson applies: D35.

- ~~**Claude provider never executed**~~ — **deleted 2026-08-12 (D59)**. Gemini is the only live
  provider. The risk was never the unused code, it was that `pickProvider` selected on whichever
  credential happened to be present.
- ~~**The fixture answered anything**~~ — **fixed 2026-08-14 (D69)**. With no `GEMINI_API_KEY` the
  compile stage returned the same recorded thesis for any input. It was labelled, which is not the
  same as honest. It now needs `LLM_PROVIDER=fixture`; a missing key is an error with a sentence.

  **Scheduled: deploy the worker 18–19 Aug 2026**, two to three days before submission closes, and
  leave it up through judging. Not before — the web app needs no publishing at all, since fair
  value is computed off-chain, and only a real fill needs a fresh on-chain oracle. Running it from
  now so that nothing observes it is the wrong trade.

  ```
  TARGET=mainnet PUBLISHER_KEY=… PUBLISH_INTERVAL_SEC=600 pnpm publish:loop
  ```

  **Funding: $5–6 into the publisher `0x40101A49…`, before the worker goes up.** A plain transfer;
  it needs no Safe signatures. Measured 2026-08-15 against live state — 0.020000001 gwei (five
  samples, flat) and WOKB at $107.15 — at 144 publishes a day:

  ```
  30 assets   919,563 gas   0.002648 OKB/day   ≈ $0.28/day   $5 → 17.6 days,  $6 → 21.1 days
   4 assets   142,872 gas   0.000411 OKB/day   ≈ $0.04/day   $5 → ~113 days
   1 asset     53,739 gas   0.000155 OKB/day                 $5 → ~301 days
  ```

  The key already holds 0.002754 OKB, about one more day. **Up on 18 Aug, $5 runs dry ~6 Sep and
  $6 ~9 Sep.** That is the owner's choice, made against the $15/~53-day alternative and recorded
  in D85 — the reminder below is what pays for it.

  **Publish all thirty — leave `PUBLISH_SYMBOLS` unset (D85).** The mandate form renders its
  allowlist picker from `GET /api/universe`, which is all thirty assets, so anyone who opens the
  app can allow any of them. Narrowed to the mandate's four, twenty-six of those checkboxes lead to
  a fill that reverts `STALE` — correct from the guard, inexplicable to whoever clicked it. The
  difference is **$0.21 a day**, which is not a constraint worth designing a failure mode around.
  **Narrowing is not the fallback when the balance runs low either** (D85 amendment): the honest
  options are top up or stop, and stopping shows up in `/api/health` where narrowing does not.

  > This block has been wrong in both directions. Until 2026-08-14 it said `PUBLISH_SYMBOLS`
  > did not exist and was not worth building — D63 had built it two days earlier. It was then
  > corrected to recommend the mandate's four, on D63's premise that nothing reads the other
  > twenty-six; the mandate picker had already made that false. Both times the note was reasoning
  > from a $5 budget picked first rather than from what the app lets a user do.

  `publish.ts` warns at 20 runs left, which is only ~3.3 hours; do not rely on it as the reminder
  for a run measured in weeks.

  While it is off — and after it runs dry — the on-chain observation is stale between manual
  publishes. The page says so in a note and does **not** turn it into a rejection, which would be
  refusing assets for something no user caused. See D47. That is what makes running dry a
  degradation rather than an outage.
- **The bound slows a compromise; it does not prevent one.** Twelve confirmed steps is an 8x, and
  `test_APatientAttackerStillGetsThere` says so in the suite rather than in a comment. This entry
  stays even after the multisig lands.
- **`.env` holds a live Gemini key** pasted in chat. Owner assessed the exposure as acceptable
  2026-08-11; the key is in Vercel's environment too. Recorded rather than re-argued.
- ~~**No logo**~~ — drawn 2026-08-11. `public/logo-reckonz.svg` (header, `currentColor`, no
  background) and `public/logo-reckonz.png` (1024² source). **Not yet wired in**: the header still
  shows `◇`, and dropping it into `app/` is FE-owned. Ticket with the spec is in `07-team.md § FE 4`.
- **Bring-your-own-key deferred**, not rejected — see D43. Wallet connect is worth more of the FE's
  remaining time, and BYOK would not have closed the Claude gap regardless — deleting the provider
  did (D59).

### Built into the contracts, unreachable from the product (D52)

Found by the 2026-08-12 sweep, which enumerated every external function and checked whether any
path in `src/` or `app/` reaches it. This is the shape D51 had before someone tried to sell.

Both were **exercised on mainnet 2026-08-12**, not just written: the breaker tripped and released
on mandate #3 (`0xd205be47…`, `0xd57d1756…`, 30,593 and 30,581 gas, state read back both ways),
and the fee swept (`0x5004b6fa…`) — `FeeCollector` went to **0 USDG** and the treasury received
0.0024. The first revenue this project has actually collected rather than accrued.

- ~~**`setCircuitBreaker` cannot be pressed**~~ — **`pnpm breaker <id> [on|off]`**, 2026-08-12.
  No args reads the state; it refuses when the caller is not the owner, before spending gas, and
  polls the state back after writing because "probably tripped" is not an answer for a safety
  control. **Tripping stops exits as well as entries**, which is deliberate and now pinned by
  `test_CircuitBreakerStopsExitsToo` — see D53 for why that is not the D51 mistake repeated.
- ~~**`FeeCollector.withdraw` has no caller**~~ — **`pnpm fees [withdraw]`**, 2026-08-12. Reports
  the rate, the ceiling, the admin, the treasury and the balance; sweeps only when asked. `withdraw`
  is callable by anyone because the destination is fixed in storage, so this needs no Safe
  signatures. ~~⚠️ **Still open: `treasury` is the deployer EOA**~~ — **closed the same day**, and
  this file contradicted itself about it for two days: `setTreasury` was executed 2026-08-12
  (`0xb49827b1…`), which the entry three bullets down already said. Read from the chain 2026-08-14:
  `treasury()` **and** `admin()` are both the Safe `0x98d19BE6…`, `feeBps()` is 15. The alarming
  half of the contradiction was the false half, which is the worse way round.
- ~~**`closeMandate`, `updatePolicy`, `setAgent`, `setAssetAllowed`, `setTriggers` have no path**~~
  — **`pnpm mandate:edit <id> close|agent|asset|policy|trigger`**, plus the browser panel below.
  Every one is owner-checked before gas, read back after writing, and `trigger add` appends to the
  existing set rather than replacing it, because `setTriggers` replaces wholesale on chain.
  **All of them are in the browser too as of 2026-08-14 (D70)**, `setExecutor` included — the panel
  had only the breaker, close and triggers, which left the rules themselves CLI-only.
- ~~**`getPosition` and `getTriggers` are never surfaced**~~ — **`pnpm mandate:show [id]`** and
  `app/components/MandateManage.tsx`: policy, allowed assets with recorded positions, decoded
  triggers, what is firing, and which assets have a stale oracle.
- ~~**`setFeeBps` and `setTreasury` have no path**~~ — **`pnpm safe:admin status|treasury|feebps`**,
  2026-08-12. It reads the Safe from the contract it administers rather than from a constant,
  reports which owner keys are present locally, approves with those, and prints the exact hash a
  co-signer must approve when there are not enough. **`setTreasury` was executed 2026-08-12** —
  the fee now lands in the Safe (`0xb49827b1…`, the Safe's first mainnet transaction ever, nonce
  0 → 1). ⚠️ Both signing keys sat in one `.env` for that run, which made the 2-of-3 a 1-of-1 for
  its duration; `SAFE_OWNER_2_KEY` should live elsewhere between admin actions. See D55.

~~The remaining unused view surface — `ReceiptRegistry.performance` / `receiptsOf`,
`ThesisRegistry.thesesOf` / `authorOf` — is deliberate, not a gap.~~ — **settled 2026-08-14 (D72).**
Not building a page for them was a fair call; leaving them **unexecuted** was a different thing, and
a view nobody reads is a view nobody has verified. All four were called against mainnet and all four
agree with a full scan of the same registry.

- **`receiptsOf` and `performance` now have a reader**: `pnpm mandate:show`, which is keyed by
  mandate — exactly their shape — and had been showing policy, positions and triggers with nothing
  about what the mandate actually did.
- **`performance()` counts exits, and is keyed by an id that migrations reuse.** On an exit
  `amountInUsdg` is cash returning, so the notional adds money out to money in, and an exit's zero
  shortfall is averaged into the slippage. And the registry is kept across guard redeploys that
  restart mandate ids, so `receiptsOf(1)` mixes in three receipts from a previous guard's mandate
  #1. Id 1 reads **6.620806 USDG at 17bp** where this mandate's own entries are **2.046925 USDG at
  11bp**. Not fixable without redeploying the registry that holds all the history, so it is pinned by
  `test_PerformanceCountsExitsAsNotionalToo`, and `mandate:show` marks the foreign receipts with `‡`
  and prints the honest figure beside it.
- **`thesesOf` / `authorOf` stay unread on purpose**: `loadRegistry` already carries `author` on
  every thesis, so a caller would be ceremony. They earn one when a third party wants one author's
  record without pulling the whole registry.

### The encoder nobody had written

Found while making `setTriggers` reachable, and worth its own line: **`compileMandate` never
produced on-chain triggers.** It emitted `ResolvedTrigger[]` — a metric name, a plain `number`
threshold and *symbols* — while `setTriggers` takes `{uint8, uint8, int256, address[]}`, and
nothing joined the two. `mandate-demo.ts` hand-wrote `{ metric: 5, comparator: 1, threshold:
1_000_000000n }` and any second caller would have hand-written its own scaling. `src/triggers.ts`
is now the single place that scales a threshold and resolves symbols, imported by the CLI and the
browser alike. Only `capacityUsdg` is cash-denominated; getting that wrong installs a rule off by
a million that silently never fires.

### Deliberately not started, and why

| Component | Blocked on | Verdict for this submission |
|---|---|---|
| ~~Consumer / simple mode — follow-once~~ | ~~the Permit2 fill component~~ | **Built end to end 2026-08-12** (D64): `src/track-record.ts` + `GET /api/theses` + `app/components/Theses.tsx` for the browse, Follow for the mandate, and `app/components/Fill.tsx` + `POST /api/fill` for the fill, carrying the thesis hash so a follower's execution rejoins the track record. What is left is not code: a fresh oracle publish (the guard refuses on `STALE` until the worker runs) and one run against a real wallet extension. Auto-DCA stays dropped, see D50. |
| ~~Indexer~~ | ~~volume~~ | **Built 2026-08-12** (D66). The block was never volume: the cost is per *read*, not per record, and `loadRegistry()` re-enumerated both registries on every page load. `src/indexer.ts` + `pnpm index` keep an append-only store at `observations/registry.jsonl`; `pnpm track-record` went 4.97s → 1.05s on the same 16 receipts. The chain still decides how many exist, so deleting the store costs latency and never correctness, and `pnpm index --verify` re-derives every stored record from the chain. |
| ASP / x402 registration | ~~a stable hosted endpoint~~ | **Reassessed 2026-08-14 after the Best Product round: every winner has an `okx.ai/agents/<id>` listing.** See `00-hackathon.md`. Worth naming on the form as planned ecosystem contribution. |

The honest summary: depth was chosen over breadth throughout, and that was the right call for
"product completeness". As of 2026-08-11 the revenue story is no longer a claim — `FeeCollector`
took 15 bps on a real fill — and the thesis → execution → record loop closes on chain. What is
left is not architecture; it is a video, a form, and a decision about who can read the repo.

---

## Suggested order

Everything that was on this list as engineering is done: mainnet deploy, **sixteen real fills**
including the first exit and the first placed from a browser, the fee, the thesis registry, the web
app, the multisig, the Simple mode surface and the registry index. What is left is a calendar, not
an architecture — the publish worker on its date, and the ASP/x402 registration, which is the only
item never started.

**Now → 17 Aug — the only items that can still fail.**

- ~~**Wallet connect + mandate creation in the UI**~~ — **built 2026-08-12** (BE, taken over from
  FE). This is the half that changes the demo from *this system computes* to *this system
  executes, and you press the button*.
  **It is written and it builds; it has never been run against a wallet.** No extension exists in
  the environment it was written in, so the connect handshake, the `createMandate` signature and
  the revert-decoding path are all unexercised. D35 is the whole lesson here: code that compiles
  against an external dependency proves nothing until a call that does the real work succeeds.
  **Do this first, on testnet, before anything else on this list.**
- **Demo video.** The evidence block above is the script. The fork it was waiting on is resolved:
  wallet connect is in, so record *with* wallet.
- ~~**Repo visibility decision.**~~ **Public since 2026-08-17.** The remaining half is not a
  decision: paste `https://github.com/wngstnr-code/reckonz` into the form's `Github` field.

~~**18–19 Aug — deploy the publish worker.**~~ **Live 2026-08-17, a day early.** Railway project
`melodious-heart`, service `reckonz`, volume `reckonz-volume` at `/data`. Verified from the chain
rather than from the dashboard: publisher nonce 19, balance down 0.000018027 OKB (one ~901k-gas
publish), **all thirty assets 73 seconds old**, and `GET /api/health` answering `ok` with four
allowlisted assets at age 99s against a 900s `maxAge`. Green in Railway proves the container runs;
these numbers prove it publishes. That distinction is D81.

**The drift service is created and deliberately stopped until its config path is set.** Its
volume is attached and its variables are in place, but with no config path it inherits
`railway.json` and tries to be a second publisher — which is what it did on its first deploy,
crash-looping on the missing key and measuring the board for nobody. `railway down` took it off
until the field is set. **One dashboard step remains: set the `drift` service's config file path to
`railway.drift.json`, then redeploy.**

Two things about that field, both found the hard way on 2026-08-18. **A leading space in the value is invisible and fatal** — Railway reported `service config at ' railway.drift.json' not found`, which reads as a missing file and is a wrong path; type it rather than paste it. And **the restart-retry count is the tell**: the dashboard defaults to 10, `railway.drift.json` says 100, so a service still showing 10 has not read its config whatever the field displays. There is also no redeploy button for a removed deployment and `railway service redeploy` refuses one — a push to `main` is what restarts it.

**The drift sampler is a second Railway service, from 2026-08-18 (D90).** Same project, its own
volume at `/data`, its own config file `railway.drift.json` — Railway reads `railway.json` for every
service built from a repo and config-as-code beats the dashboard, so a second service sharing it
would have inherited `pnpm publish:loop` and tried to be a second publisher. The one setting that
lives only in the dashboard is that service's **config file path**, which must read
`railway.drift.json`. Its variables are `TARGET=mainnet`, `DRIFT_INTERVAL_SEC=3600`,
`IMPACT_DRIFT_PATH=/data/impact-drift.jsonl` and `NIXPACKS_NODE_VERSION=22`. **No key of any
kind** — the process cannot sign, and an hour rather than the default half hour because a pass is
two full pool walks per asset over the same throttled RPC the publisher depends on.

**Two things that live only in the Railway dashboard, so they are written here.** The five
variables are `TARGET=mainnet`, `PUBLISH_INTERVAL_SEC=600`,
`OBSERVATIONS_PATH=/data/issuer-marks.jsonl`, `NIXPACKS_NODE_VERSION=22` and `PUBLISHER_KEY`.
`PUBLISH_SYMBOLS` is absent, not empty (D85), and `PRIVATE_KEY` is deliberately **not** there:
`publish.ts` reads `accountFrom('PUBLISHER_KEY', 'PRIVATE_KEY')` in order, so a deployer key on
that host would buy nothing and would put a Safe owner on a machine that never needs one.
`NIXPACKS_NODE_VERSION` was **24 first and the build failed** — `nix-env` cannot resolve a Node
that is not in the nixpkgs snapshot Nixpacks pins. 22 builds. If it ever fails there again, the
next move is `"builder": "RAILPACK"` in `railway.json`.

**The red deploy badge on GitHub is those failed builds, and it is stale.** The last status Railway
sent was a `failure` at 06:21 UTC on 17 Aug, during the `NIXPACKS_NODE_VERSION` attempts above; the
build that succeeded at 06:10 is the one still running, and no commit since has touched
`watchPatterns`, so nothing has overwritten the badge. It will go green on the next deploy that
does.

**Fixed 2026-08-17 (D87): the publisher crashed after a successful publish**, about one cycle in
three. `getBlock` on the block our own write landed in was the only read in `publish.ts` with no
retry around it, and an unsynced node answers it with a `null` that no transport-level retry
treats as a failure. The write always landed — what died with the process was the read-back and the
withhold report. Wrapped in `waitUntil`, catching `BlockNotFoundError` only. Worth checking in the
Railway logs after the next deploy: `publish exited 1` should stop appearing.

**20 Aug — record the video against a live oracle**, with the worker up. Leave a day of slack;
21 Aug is the deadline, not the plan.

**21 Aug, before 23:59 UTC** — the `@XLayerOfficial` post from @reckonz_xyz, then the Google Form.
Both are hard requirements and neither takes long, which is exactly how they get missed.

**3 Sep — top up or shut down. Not optional, and not "~5 Sep" any more.** The worker publishes all
thirty on $5–6 (D85 as amended), so it goes stale ~6 Sep at $5 and ~9 Sep at $6 — inside a judging
window whose end nobody has written down. Silently running dry is the one option that is not fine:
`/api/health` starts answering 503 and every fill reverts `STALE`. **Do not narrow to four to
stretch it** — that saves $0.21 a day and re-opens twenty-six unfillable assets in the mandate
picker. `publish.ts`'s own warning fires at 20 runs left, which is 3.3 hours here; it is not this
reminder.

---

## Log

**2026-08-19 (latest, twenty-sixth)** — **the trade page offered fills the guard refuses** (D95).
Driving a real fill through the rebuilt page returned `REJECT · ASSET_NOT_ALLOWED` for wTSLAx, an
asset the page had drawn as allowed. `allowedAssets()` returns `_assetList`, which is append-only:
disallowing flips `isAllowedAsset` and leaves the address in the array. The browser had the ABI for
the list and not for the mapping, so every consumer used the list. `isAllowedAsset` is exported now
and asked per asset in `Fill`, `Exit`, the allowlist and the trigger scopes. A stranded position
stays visible and marked, because an exit is a fill and it cannot be sold until the asset is allowed
again.

Also: the sticky trade card had no height cap, so a card holding a quote grew past the viewport and
its own `sign & fill` button fell off the bottom. Found by reaching the point of signing and having
nothing to press.

**2026-08-19 (twenty-fifth)** — **`/trade` rebuilt to the reference's shape** (D94), at
Nabil's request. Ondo Finance's app was looked at again rather than recalled: an asset page there is
context down the left and a sticky action card on the right, and the card holds a tab row, a
selector, one spend-over-receive box with the direction drawn on the seam, a full-width button, and
the fine print under it.

The four stacked panels are now that layout. `Fill` and `Exit` are one card with `Buy`/`Sell` tabs,
both kept mounted so a quote survives a tab switch; their three-fields-on-a-row form became the swap
box, which is honest about what a fill is, since Permit2 scopes a signature to one token and one
amount. The mandate became the document you read beside the trade — Mandate, Positions, Triggers,
Allowlist, Controls, as plain sections rather than one panel — headed by *spendable this epoch*,
derived as `maxNotionalPerTrade x fills remaining` from chain state. Creating a mandate dropped to
the bottom **only for a wallet that already owns one** — with none it is the first thing in the left
column, because the whole page is inert until it is used, and `mandate-presence.ts` reads which
case this is from the walk the manager already does. `Limits` is new and is the reference's Session
Limits answered from measurement rather than policy: absorbable size per pool, and the one section
that says anything to a visitor with no wallet.

The create form itself was redrawn rather than only relocated: `Field` borrows the swap box's
proportions — a box each, the value the largest thing in it, the unit as a chip — with what each cap
means inside its own box, the asset chips carrying their marks, and a full-width button that says
why it is disabled.

Every form on the page now takes the trade card's surface, so a grey block means *you can act here*
wherever it appears: `Form.tsx` holds `FormCard`, `Field`, `SelectField`, `Primary`, `Ghost` and
`Toggle`, and six places that had been building these from raw markup use them. The `19 of 30
tradable` pill is gone from the header, since Limits says the same thing per market with a date on
it.

Screenshotting that turned up a real bug: `MandateManage` baked the ticker into its serial chain
walk, which almost always finishes before `/api/universe` answers, so every asset rendered as a
truncated address until a `universe.length` dependency ran **the whole walk again** to fix a label.
A ticker is not chain state. Resolved at render now, and a full redundant RPC walk is gone from
every page load.

Direction sits back at the top of the card as an underlined tab row, the card's small type is `ink`
rather than grey, and both dropdowns are drawn rather than native: `Menu.tsx` holds `useMenu`,
`MenuList` and `Chevron`, and the outside-click-and-Escape pattern `Wallet.tsx` already had is now
written once.

Then the surfaces, against a screenshot of the reference's own card: `card`, `well` and `inset` are
new tokens, named for role because the pair inverts between themes, and they replace the bordered
panel-inside-panel with a white box floated out of a grey card. Direction moved into a segmented
control, and the primary button is solid ink rather than tinted green, which gives `signal` back to
the verdict it is supposed to mean. The rule under every section heading is gone.

Then the copy: em-dashes out of every user-visible string on the page, and the prose cut to what
changes what the reader does. Warnings stayed, restatements of what the interface already shows did
not. `tokenAmount` in `ui.tsx` fixes a display bug found on the way, where positions printed all
eighteen decimals.

`BasketRail` is the missing accounting for a followed thesis — one row per leg, its state, and the
reason on any refusal. It deliberately carries **no** asked-versus-executable total; D94 says why,
and it is D50's constraint, not an oversight.

Two seams moved with it. `FILLED_EVENT` now carries `{ symbol, isExit }`; `QUOTED_EVENT` is new.
And `publishFollow` fixes a live bug rather than a cosmetic one: `Mandate` was the only reader of
the `sessionStorage` hand-off, so arriving at `/trade` from a published thesis — the only path that
produces a follow — the fill panel's follow banner never rendered, while the thesis hash still rode
along on the fill.

`pnpm typecheck` clean, 281 unit tests pass, `pnpm build` clean, `/trade` now server-rendered per
request. Nav and footer untouched.

**2026-08-18 (twenty-fourth)** — **the worker's price history is in the repo, and the
measurement `PLAN_HEADROOM` was promised now exists** (D90). `/data/issuer-marks.jsonl` pulled off
the Railway volume and folded in with `pnpm sample --merge`: **60 marks -> 4,290**, 30 assets,
24.5 hours, 0 duplicates. `pnpm measure` before and after says the same thing both times —
multipliers unchanged, gap sigma unchanged at **1/30 jumps** — so the merge is purely additive and
no recorded number moved. That is the expected result and not a disappointment: sigma needs thirty
close-to-open boundaries and one day of sampling buys one.

Then the loose end D89 left. Its comment said the honest version of `PLAN_HEADROOM` was to derive
it from *"the impact volatility already recorded in `observations/`"* — **and no such recording
existed anywhere in the repo.** `pnpm drift` (`src/impact-drift.ts`, `src/drift.ts`) measures it as
a paired walk: size a leg with `capacity(venues, 50)`, wait, re-walk the pools and quote the same
size against the new state. `--report` derives `1 - p99(drift)/limit` and **withholds until thirty
samples**. First two real samples, 32s apart: wSPYx +0bp, **wTSLAx -11bp on a $41,865 leg** — which
argues 0.9 may be thin rather than generous, on two samples that decide nothing. No gas, no key,
`eth_call` only, and deliberately a separate process from `publish-loop`. Unit suite 257 -> **269**.

**2026-08-15 (twenty-third)** — **the publish worker will publish all thirty assets, not
the mandate's four** (D85). Owner's call. D63's premise for narrowing — *"the other twenty-six are
being published so that nothing reads them"* — stopped being true when the mandate form shipped its
allowlist picker over `GET /api/universe`: anyone who opens the app can allow any of the thirty, and
a narrowed publisher turns twenty-six of those checkboxes into a fill that reverts `STALE`. The
difference is **$0.21 a day**. Funding stays at **$5–6** by the owner's call, which is 17.6–21.1
days at thirty assets (measured: 0.02 gwei, WOKB $107.15) rather than the $15/~53 days D85 first
recommended — so the top-up reminder moves to **3 Sep**, and narrowing to four is explicitly *not*
the fallback when it runs low. `PUBLISH_SYMBOLS` is kept for hand publishes and swept out of
`05-status.md`, `07-team.md`
and the `publish.ts` comment that still recommended narrowing the worker.

**2026-08-15 (twenty-second)** — **capacity doubled in four days, and the volume was never
measured at all** (D84). `pnpm capacity` re-run: **$97,329 at 0.5%**, $759,633 at 5%, up from ~$48k
and ~$515k on 11 August with no change on our side. D49 predicted exactly this and nothing was
watching for it. Alongside it, the number this repo had never taken: those pools traded
**$12,038,377 in 24h**, with 81% in wAAPLx and wGOOGLx — order-book arbitrage rather than
addressable flow. `$48k` was stated in eight documents including the submission; all swept.
Conclusions unchanged (AUM still dead at $97k; honest capacity still the product), and the rule
left behind is that **a capacity figure is a measurement with a date and must be written as one**.
Also this day: a WAF rate limit in front of `/api/run`, verified (D78 amendment), and the evidence
comments corrected to say that `evidence/` holds allowed plans rather than settled fills.

**2026-08-14 (twenty-first)** — **swept the remaining gaps; nothing built, three claims
corrected** (D74). The docs assert plenty that `pnpm check:tests` cannot guard — it checks test
counts and nothing else — so this pass read them against the chain.

The **treasury warning was false**: `05-status.md` warned that fee revenue lands in the deployer
EOA, three bullets above the entry recording that `setTreasury` had moved it to the Safe two days
earlier. `treasury()` and `admin()` both read `0x98d19BE6…`. A stale ⚠️ is worse than a stale ✅ —
it sends someone to fix what is not broken, here with a two-signature Safe transaction.

The **funding plan recommended against a feature it already had**, telling a reader that
`PUBLISH_SYMBOLS` did not exist and was not worth building. D63 built it; D65 flagged the note as
stale; nothing returned. At the mandate's four assets $5 buys **~129 days**, not the ~20 the block
was sized for, so the 5 Sep reminder applies only to publishing all thirty — which buys nothing.

And **all fourteen deployed addresses are now verified on Sourcify**: thirteen already were, and
testnet `TestUSDG` was not until today. Worth knowing for the next check — Sourcify's **v1 API is
in a brownout until 2027-01-08**, so a hand-rolled `check-all-by-addresses` call returns what looks
like an outage; use `/server/v2/contract/<chain>/<address>`. `forge verify-contract --verifier
sourcify` already speaks v2 and is unaffected.

Also corrected: the deployed-contracts block still said "16 fills", and CI went green on its first
run.

**2026-08-14 (twentieth)** — **nothing was running the tests** (D73). `.github/workflows/`
held one manual workflow for the oracle and nothing else, so 106 Foundry tests and 136 unit tests
ran only when someone remembered. And a fresh clone could not compile the contracts at all: `lib/`
is gitignored and `forge-std` is neither committed nor a submodule, so `forge test` fails before it
reaches a test — true since the repo existed, invisible on a machine where `forge install` had once
been run.

`test.yml` now runs typecheck, both suites, `check:tests` and `pnpm build` on every push and PR,
with no secrets and nothing that touches the chain — the live-state regressions stay out, because a
build that goes red on someone else's throttled RPC is a build people learn to ignore. `forge-std`
is installed pinned at v1.16.2, and the clone step is in the start-of-day checklist.

**2026-08-14 (nineteenth)** — **the four unread views, called for the first time** (D72).
`receiptsOf`, `performance`, `thesesOf` and `authorOf` were deployed, correct-looking and never
executed. Not building a page for them was a fair call; leaving them unverified was a different
one — D35's lesson one layer down, and far cheaper to settle, because a `view` can be checked
against a full scan of the same registry. All four agree with the scan.

**`performance()` counts exits, and that changes what it means.** On an exit `amountInUsdg` is the
cash coming *back*, so the notional adds money out to money in; and since D68 an exit against a
stale oracle records `slippageBps: 0`, averaged in beside an entry's real shortfall. Mandate #1
reads **6.620806 USDG at 17bp** against **3.545425 USDG at 25bp** for its entries alone — notional
overstated by 87%, slippage understated by a third, on the same chain at the same instant.
`src/track-record.ts` has always filtered exits out of both, so the two have disagreed by
construction since the first exit settled.

**Corrected two hours later, by sweeping this same work:** `receiptsOf` is keyed by **id**, and the
registry is kept across guard redeploys that restart ids — so three of those sixteen receipts belong
to a *previous* guard's mandate #1, and two more sit under a mandate #3 no deployed guard has ever
had. The 17bp figure is right; the number beside it was not this mandate's. Its own entries are
**2.046925 USDG over 6 fills at 11bp**. `mandate:show` now proves the one direction that can be
proved — a mandate cannot have written a receipt at a policy version above its own — marks those
`‡`, and computes the honest figure over the rest.

Not fixed: `ReceiptRegistry` is kept across every migration because it holds the whole history, and
editing its source would break Sourcify verification of the deployed bytecode for no gain. The
semantics are not ours to revise — what was missing was anyone stating them.
`test_PerformanceCountsExitsAsNotionalToo` now does, which takes Foundry to **106**.

`pnpm mandate:show` gained the half it never had: the mandate's receipts via `receiptsOf`, and
`performance()` printed *next to* the entries-only figure with a sentence saying which question each
answers. `thesesOf` and `authorOf` stay unread on purpose — `loadRegistry` already carries `author`
on every thesis, so a caller would be ceremony.

**2026-08-14 (eighteenth)** — **the TypeScript side gets a suite** (D71). 136 unit tests
over ten modules in `src/`, on Node's built-in runner through `tsx --test` — **no new dependency**,
because `package.json` is a shared file and Node 24 already ships the capability. `pnpm test:unit`,
`pnpm test` for both suites, and `pnpm check:tests` now derives and guards **two** counts instead
of one.

Until today, 105 Foundry tests covered the contracts and `src/` had none. What stood in for them —
`pnpm verify`, `pnpm reconcile` — are regressions against live on-chain state: stronger than a unit
test for what they cover, and no cover at all for a pure function. `executionPriceE8`,
`scaleThreshold`, `evidenceHash`, `merge` and `checkExecution` were guarded by the next run.

The first run found three things. **`describeOnchainTrigger` printed the wrong operator** for a
comparator index it could not decode — it computed a `comparator#N` label and then discarded it,
falling through to `<`, in the renderer `pnpm mandate:show` and the browser panel both use. Fixed.
**`schedule()` deleted dust**: floor division with nowhere to put the remainder, so a 5,000,000
USDG order over three slices planned 4,999,999.999998. Fixed with a `lastSlice`. And **`guard.ts`
is stricter than the chain at exactly the tolerance boundary**, by one floating-point epsilon —
left in place because the direction is the safe one, but written down, because "mirrors it line for
line" is a claim this repo makes out loud.

The arithmetic mirrors are pinned against receipts #16 and #17 on mainnet rather than invented
vectors. A test against a real receipt cannot agree with a wrong mirror.

**2026-08-14 (seventeenth)** — **the way out is a page** (D68). `src/exit-plan.ts` →
`POST /api/exit` → `app/components/Exit.tsx`, the mirror of the fill chain and the same split:
the server simulates every fee tier in the sell direction, checks the pool the executor derives,
reads the oracle, asks `dryRun` and hashes the evidence; the wallet approves, signs and sends. The
permit names the **asset**, so each xStock needs its own Permit2 approval, and size is named in
units rather than as a dollar target — `pnpm exit` converts dollars through the oracle, which lets
a stale value decide how much you may sell. Verified against mainnet mandate #1 with the oracle
**43h stale**: 0.0005 wTSLAx → 0.169961 USDG at fee tier 500, shortfall 0, `dryRun` **ALLOW** — then
signed in the OKX extension and sent: **receipt #16**, tx `0x85501e91…`, 585,619 gas, 0.169707 USDG
net into the owner wallet. The receipt records `slippageBps: 0` and `fairValueE8: 0`, which is the
guard catching its own `Stale` revert — the off-chain mirror checked against the chain. **Receipt
#17** is the same trade from the rewritten CLI (tx `0xa6c68a5e…`, 0.0002 wTSLAx → 0.067879 USDG net),
whose printed plan now comes from `prepareExit`. Two receipts, two front ends, one planner.

Two things were found on the way. `pnpm exit` measured shortfall against `peek` unconditionally and
fed it into `dryRun`, while `Executor._exitShortfallBps` reads through `observation` and returns
**zero** when it reverts — so with a stale oracle the CLI could refuse an exit the chain would have
executed. Rather than patch the second copy, **`src/exit.ts` now calls `prepareExit`** and does
nothing but parse arguments, hold a key and send; it also gained `--units` and became mainnet-only,
which it silently always was (`pool.ts` reads the mainnet client whatever TARGET says). And
`pnpm mandate:show` was still printing *"a stale value blocks exits too (D51)"*, which D56 made
false — corrected in place.

Also: **the fixture has to be asked for** (D69) — no `GEMINI_API_KEY` used to mean the compile
stage answered any input with the same recorded thesis, labelled but not honest. It now needs
`LLM_PROVIDER=fixture`. And **the mandate is governable from the browser** (D70): `updatePolicy`,
`setAgent`, `setExecutor` and `setAssetAllowed` join the breaker, close and triggers in
`MandateManage`. `pnpm typecheck` and `pnpm build` clean.

**2026-08-12 (sixteenth)** — **the last unlicensed source is deleted, and the gaps D62 left
are closed** (D63). Four things, none of them large on their own.

**`PUBLISH_SYMBOLS`** narrows what the publisher writes. Measured on chain, not estimated: 919,563
gas for thirty assets against **142,872 for four** — 6.4x, turning three weeks of runway on $5 into
about four and a half months. A symbol that is not in `ASSETS` is a hard error, because a typo that
quietly publishes twenty-nine is drift nobody notices until a mandate cannot execute. The runway
printed each run now scales with the set being published.

**`src/marketdata.ts` is gone.** Not quarantined — deleted. What it was still being borrowed for is
the close-to-open jump σ behind the band, and the fix was to stop borrowing: `pnpm sample` writes
the issuer's marks to `observations/issuer-marks.jsonl` and the publish worker does it every cycle,
one HTTP call, no gas, no key. `pnpm measure` derives σ from that store and **refuses below 30 jumps
per asset**, printing how far along it is. A σ from six hours of samples would look fresher than the
number it replaced and be worse.

**`MEASURED.fits` deleted** — the recorded betas priced nothing after the carry-forward was retired,
and a recorded number nothing reads is a number nobody checks.

**`src/permit.ts`** is the piece the browser was actually missing. `07-team.md` said the follow flow
was gated on wallet connect; wallet connect shipped and the flow did not move, so the stated blocker
was not the real one — nothing in `app/` could produce a Permit2 signature. `src/execute.ts` was
rewired through the new module, so every mainnet fill exercises the code the browser will run.
Proven by placing one: **receipt #14**, 0.6 USDG into wTSLAx, 614,433 gas. ~~**The browser has still
never placed a fill** and nothing here says otherwise.~~ — **superseded the same day: receipt #15
was placed from the browser** (D65).

**2026-08-12 (fifteenth)** — **the price source has no licence, and the issuer turns out to
have better data than the one we are using** (D62). Nothing changed in what the oracle publishes.

The Yahoo endpoint behind every fair value is undocumented and unlicensed — no terms page exists to
accept, so there is no permission to point at. Pyth is not the escape: its terms are equally
restrictive (*"private, non-commercial informational purposes"*, no automated extraction) and its
licensed tier is $10,000/month, and it is **not deployed on X Layer** — three canonical addresses
probed against RPC 196, all empty. OKX's public spot API carries zero tokenised equities. Exchange
redistribution runs $20k–35k/month and no vendor plan substitutes for it.

The way out is to stop consuming exchange data and take the number from the issuer. `src/issuer.ts`
reads Backed's public API, and `pnpm reconcile` now prints a third column beside the reference and
the chain. Read-only: no verdict depends on it and nothing from it is published.

What it measured:

- **A defect we have been absorbing since D38.** xStock dividends are reinvested into the token via
  a multiplier — `IBMx` is at 1.02040, `SPYx` 1.00571, `AAPLx` 1.00327, all larger than the guard's
  100bp deviation tolerance — and nothing here knew the field existed, so it landed in `basisBps` as
  noise. Direction measured rather than read: mean |basis| is 1.10% untreated, **0.73% multiplied**,
  1.55% divided. Non-payers (TSLA, GLD, COIN) read exactly 1.0, which is what makes it believable.
- **The chain agrees with the issuer, not with Yahoo.** Chain vs issuer mid is inside ±0.7% for every
  asset with a pool; chain vs Yahoo runs to 2.7%.
- **The two withheld assets have a mark.** `wSKHYx` — rejected at −86% in D39 — sits **−0.10%** from
  the issuer's price. D39's conclusion was right; our reference for it was wrong. `wSPCXx` is marked
  too, and SpaceX has no listing at all. Issuer-referenced would be 30 of 30, not 28.
- **717 xStocks are deployed on X Layer**, not 30. Thirty is the set with a pool, which is the more
  useful number — but it was never the same statement.
- **A unit trap, caught by the first run.** The two issuer endpoints publish in different units and
  neither says so; issuer quotes came back 100× the reference. A wrong scale here would be quiet and
  catastrophic, because every proportional check in the guard compares ratios. The constant is
  derived across two assets three orders of magnitude apart, and re-measured at runtime.

**The multiplier correction is applied.** `FV = P_close × (1 + Σ βᵢ · rᵢ) × shares/token`, with
shares per token recorded in `AssetSpec` for all thirty assets and re-checked for drift by
`pnpm reconcile`. Recorded rather than fetched at publish time on purpose: the oracle must not need
somebody else's uptime to price anything, and the measurement run itself had three transient
failures out of thirty. Mean |basis| across the sixteen assets carrying a multiplier fell from 1.12%
to 0.73%; `wIBMx` went from roughly 2% to −0.20%. All 28 admitted assets still reconcile.

**β and the gap distribution are now recorded too**, in `MEASURED` beside `ASSETS`, for the 29
assets that have a reference. Both came from the same year of Yahoo daily bars — the band's source
was missed in the first plan for this migration, which called it one number per asset when it is two.
Recording changed nothing: bands across the swap are identical to the last basis point
(wAAPLx 1.68%, wINTCx 5.71%, wSKHYx 8.19%), and fair values moved only by the signal's own movement.
The cost is slow staleness, so `pnpm reconcile` re-fits live every run and reports drift past 0.05 on
β or 10% on σ, stating which way the error runs — a σ that has grown means the published band is that
much too narrow. It also flags an admitted asset missing from `MEASURED`, because that silently falls
back to the live regression this was meant to remove. All three verified by breaking them on purpose.

**One correction to the plan:** the issuer's per-session spread was going to replace the band. It
cannot — a dealing spread is a transaction cost, the band is a forecast uncertainty, and swapping
them would narrow wAAPLx sevenfold *while the market is shut*, making the guard most permissive at
its most dangerous hour. The spread becomes a **floor** on the band instead.

**And the reference leg is migrated.** `FV = issuer mid × shares/token`. Two measurements settled it
first: a regression of (chain vs issuer mid) on (multiplier − 1) across all thirty assets gives
slope 1.090, R² 0.816 — the issuer quotes the share, the chain prices the token, so the multiplier
is the difference and not a double count. And the issuer's overnight mark is *live*: sampled 91
seconds apart at 04:20 New York, four of eight names moved more than a basis point.

That retires the carry-forward, which is better than the plan promised — the overnight direction
guess is not lost, it is replaced by a dealer doing the same job with money behind it. The signal
machinery is deleted rather than left dormant (D59). `src/fairvalue.ts` no longer imports
`marketdata` at all.

**Band and gap risk are now two measurements, not one.** The band is uncertainty about the value
now — the issuer's own spread while it quotes, the recorded jump distribution when nobody does. Gap
risk keeps the jump distribution even while the mark is live, because buying at 3am carries the open
however good the price is. The old model conflated them and scored staleness at 3am purely because
New York had shut, while a dealer was quoting the whole time.

The effect, same minute before and after: every asset now sits inside **±0.40%** of fair value
against up to 2.7% before, with bands of 10–30bp against 0.2–8%. The guard got *tighter* — tolerance
is `maxDeviationBps + band`, and the band collapsed because fair value stopped being a forecast.

Nothing newly publishes: `admittedOn` still gates and the admission test is still exchange-
referenced, so wSKHYx and wSPCXx stay withheld — though wSKHYx now sits 2bp from the chain under the
issuer rather than −86%, and its withholding note was corrected to stop giving a reason that has
stopped being true. Yahoo has exactly one consumer left, `src/reconcile.ts`, and nothing that
publishes touches it.

**And admission moved too — the universe is now 30 of 30.** `pnpm reconcile` asks whether the chain
agrees with the issuer's mark rather than whether the wrapper reconciles with an exchange listing.
Two gates disappeared and neither is a relaxation: `FX_REQUIRED`, because the issuer quotes every
token in USD (the whole KRW leg behind D39 is gone), and `NO_HISTORY`, because there is no beta to
fit. The comparison is finally like-for-like — issuer mid × shares per token against the chain.

```
wSKHYx   issuer × shares 146.28   chain 146.16   -0.1%    (was -86.3% against 000660.KS)
wSPCXx   issuer × shares 134.69   chain 134.34   -0.3%    (was: no listing exists)
```

D39's rejection of `wSKHYx` was right about the mapping and wrong as a statement about the token.
`wSPCXx` is the clearest case for the issuer: SpaceX is private, no exchange can price it, and the
party minting the token marks it anyway. The exchange-referenced oracle defended 28 of 30; this one
defends all 30, with a tighter basis on every asset.

Admitting `wSPCXx` exposed a bug worth naming: it scored **gap risk 2 of 100**, the safest thing in
the universe, because it has no recorded open-gap statistics and a missing σ multiplied out to zero.
Unmeasured now scores as maximum on that term, and where nothing is quoting *and* nothing is
recorded the band is null and the value unpublishable — a zero band is a lie the guard acts on.

**Yahoo is quarantined, not deleted.** `src/marketdata.ts` has one importer left: `src/measure.ts`,
a bench tool run by hand as `pnpm measure`. Nothing that publishes or admits touches it. Deleting it
outright was the plan and was the wrong call — the open-gap distribution has no free licensed
replacement and the issuer publishes no history, so removing the code would leave the recorded σ
values permanently unauditable, which is D5 in reverse. The real fix is to build the history rather
than borrow it: sample the issuer's own marks into a store. That is the indexer in
`03-architecture.md`; the store exists (`observations/issuer-marks.jsonl`) and the registry half was
built 2026-08-12 (D66).

**What the store can and cannot do yet, plainly.** `pnpm measure` counts *session boundaries
crossed*, not samples — one boundary is one close-to-open jump — so a store that has watched three
boundaries cannot replace a σ measured over years, and says so rather than deriving one. Until the
publish worker has run for weeks, this is a mechanism being proven, not a statistic being used. And
it only accumulates where it is written: the worker needs a volume and `OBSERVATIONS_PATH`, or it
collects onto a disk that is wiped on redeploy (D67).

**Exercised end to end, same day.** Five exits and one entry under the new model — receipts #9–#13, all
`dryRun ALLOW`, clearing wQQQx/wNVDAx/wTSLAx/wSPYx back to USDG at 0.25/0.40/0.80/0.95/0.44 USDG.
Deployer USDG went 0.9166 → 3.7498 and the five fills cost 0.00006 OKB in total. The point was not
the money: it is the first execution path priced by the issuer rather than by an exchange, and
`shortfall 12 bps below fair value` on the first one is the guard measuring against a mark that is
now live rather than eleven hours old. wSPYx needed two slices because `maxNotionalPerTrade` on
mandate #1 is 1 USDG and the position was worth 1.40.

**Published to mainnet 2026-08-12**: 30 observations in one transaction, block 67756404, 968,736
gas, success. A second publication followed at block 67758469 before the exits, and the read-back
fix held — no false `REJECT STALE`, all 30 ALLOW. On-chain bands came back at **10–25bp** against the 168bp the previous observation
carried for the same asset, and 30 of 30 read back with `hasValue: true`.

The read-back reported three of them as `REJECT STALE` and was wrong — D18 through a guard that was
already there. `publish.ts` waited for `updatedAt !== 0` before reading back, which any
previously-published asset satisfies forever, so the wait passed instantly against a node still
serving the old block. The bound is now the timestamp of the block the write landed in, and every
asset waits on its own read. A guard whose predicate is always true is worse than no guard, because
it is also reassuring.

⚠️ **Nothing is publishing on a schedule.** Before this run the on-chain observation was **12.9
hours old** against a `maxAge` of 15 minutes, which means no entry could execute on mainnet at all.
`src/publish-loop.ts` exists and is the right tool — the GitHub workflow is deliberately manual,
because `schedule` is best-effort and a five-minute delay is enough to go stale — but it is not
deployed anywhere. The binding constraint is gas, not hosting: the publisher holds 0.0028 OKB, and
30 assets every 10 minutes is 144 cycles a day.

The licence question is still not settled: the API describes itself as being for "integrators" but
grants nothing explicitly. That is now the only thing standing between this and a defensible answer
to "where does your price come from".

**2026-08-12 (fourteenth)** — **testnet realigned with mainnet** (D60). The second sweep
measured the deployed bytecode instead of trusting the deploy dates and found the 1952 stack two
generations behind: an `Executor` with no `exit()` (D51) and a `PolicyGuard` without the exit fix
(D56), on the chain this file tells people to test wallet connect on.

Redeployed with `MigrateGuard.s.sol` — the same script that made the mainnet move, which first had
to stop hard-requiring a live v3 factory. That factory has no code on 1952 and never will, so the
requirement is now the one `Deploy.s.sol` already applied under D36: refuse on mainnet, warn
elsewhere. Refusing everywhere is precisely what kept the rig stale.

```
PolicyGuard  0xD9d04Bc1324ed4fb23D171893BFACb1c99FD581b   28,343 bytes — mainnet: 28,343
Executor     0xf1b73Fb49CEfcB7CEd27b667c8Ea14bD8f3871D9   20,445 bytes — mainnet: 20,445
```

Both `exact_match` on Sourcify, creation and runtime. Immutables read back against the same
oracle, registry, cash, collector, Permit2 and factory. `exit()`'s selector is in the new bytecode
and not the old. The registry's write permission moved through the testnet Safe — 2-of-3 there
too — granted to the new guard before being revoked from the old, which needed owner 2 funded
first: it held zero OKB, so its `approveHash` could not pay for itself. Nothing was stranded; the
old guard held no mandates and the registry holds no receipts.

D60's four smaller findings are closed in the same pass. Three were text — provider comments
naming a file that no longer exists, `03-architecture.md` still saying "Claude", and two surface
claims listed without a marker — and are fixed where they were written, marked rather than
deleted. The fifth got a script: **`pnpm check:tests`** runs `forge test` and compares its total
against every count stated in the docs, six of them today, so the number cannot be stale in five
files at once again. Also corrected while in there: this file was still naming `0x09af5194…` as
the current mainnet executor, two redeploys behind.

**2026-08-11 (thirteenth)** — the competitive landscape checked for the first time, and
four docs corrected against it (**D49**). No code changed; nothing in `src/` or `contracts/` was
wrong.

What held: X Layer really is empty above the primitives — **56 protocols parsed from the DefiLlama
API, zero in any RWA, asset-management, index or portfolio category**, and the four nearest things
hold $0, $3, $81 and $133. There is also **no live hedging venue** (every derivatives protocol
here holds $0), which strengthens the market-hours argument rather than weakening it.

What did not hold, all in `02-product.md`:

- **The market-hours gap is a venue condition, not an industry one.** Ondo shipped 24/7 mint and
  redeem in June 2026 and crossed $1B TVL in May. Still true here; no longer true of the category.
- **Publishing a fair value with its uncertainty is table stakes.** Pyth ships a confidence
  interval on every update and Nasdaq selected it for TotalView distribution on 30 Jun. The claim
  is the *enforcement* — and 2026 priced that gap twice, at Pythnet's four-hour halt on 22 May and
  at Ventuals' ~45% drop on bad oracle data.
- **"The agent's key is bounded" separates us from nothing.** Session keys plus a policy engine is
  the 2026 default; Giza has run $3.96B of agentic volume under it. What is ours is bounding on
  **price defensibility and market depth** rather than destination and size.

And the finding with the most consequences: **the venue arrived first and belongs to the host.**
OKX's `Unified Tokenized Stocks` is live — 40+ tickers, 24/7, shared order book, settling on X
Layer — behind a real X Layer × xStocks partnership, with **ICE, the parent of NYSE, having
invested in OKX at $25B in June to put tokenised NYSE stocks on-chain**. That is simultaneously the
best card in the pitch (we are the non-custodial layer above the judges' own strategic bet) and a
standing instruction never to compete with the venue on price, depth or gas.

One thing to watch rather than act on: X Layer's Uniswap V3 TVL is up from $17.5M to **$22.9M**,
and open deposits between order book and pool mean arbitrage should keep deepening them. **Re-run
`pnpm capacity` before quoting the $48k anywhere.**

Updated: `04-decisions.md` (D49), `06-assessment.md` (new risk 3, moat claims withdrawn),
`02-product.md` (opening, point 3, pitch line, positioning), `01-xlayer-reality.md` (chain
economics refreshed, venue section added), `00-hackathon.md` (strategic context).

**2026-08-11 (twelfth)** — `ThesisRegistry` deployed on both chains and **the loop is
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

**2026-08-11 (latest, ninth)** — web app live at **https://reckonz.xyz**. Full pipeline
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
