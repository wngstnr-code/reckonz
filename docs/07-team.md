# Team — who owns what

Two people, ten days, one submission (deadline **2026-08-21 23:59 UTC**).

| | Person | Owns |
|---|---|---|
| **BE** | Wangsit | `src/`, `contracts/`, `script/`, `test/`, `app/api/`, deployment, docs |
| **FE** | teammate | `app/` except `app/api/`, `app/components/`, styling, hosting of the page |

> **Reassigned 2026-08-12 — wallet UI moved to BE.** Wallet connect had been FE ticket 3 and was
> still unstarted with nine days left, while Simple mode's follow-once could not be built without
> it. Wangsit took it over with the owner's agreement rather than leaving it unclaimed. So
> `app/components/useWallet.ts` and `app/components/Wallet.tsx` — and the header line in
> `app/page.tsx` that mounts them — are **BE-owned**, and are the one exception to the table
> above. Everything else under `app/` is unchanged and still FE's. Nabil: pull before touching
> `app/page.tsx`.

The split is drawn along a seam that already exists in the code: **the web app computes
nothing.** It renders `src/pipeline.ts` (D28). So BE owns everything that produces a number, FE
owns everything that shows one. Neither side has to wait on the other to be useful.

Read `08-parallel.md` for the mechanics — branches, the frozen contract, what to do on a
conflict. This file is the *what*; that one is the *how*.

---

## The seam

FE consumes exactly one thing: **`GET /api/run`**, a Server-Sent Events stream.

```
GET /api/run?thesis=<free text>&notional=250000&maxImpactBps=50
→ text/event-stream, one `data: <json>\n\n` per event
```

Each event is a `RunEvent` from `src/pipeline.ts`, discriminated on `stage` + `status` so it
renders without casting:

| stage | `done` payload |
|---|---|
| `compile` | `{ thesis, provider, live }` |
| `universe` | `UniverseEntry[]` |
| `allocate` | `Allocation` |
| `mandate` | `CompiledMandate & { described }` |
| `plan` | `BasketPlan & { maxImpactBps }` |
| `oracle` | `{ verdicts: AssetVerdict[] }` |
| — | `{ done: true }` or `{ error: string }` terminates |

A run takes **~2 minutes** — a live LLM call plus thousands of throttled RPC reads. That is not
a bug to hide behind a spinner; showing the pipeline work is a product decision.

**BigInt crosses the wire as a decimal string.** The route's JSON replacer converts it. FE must
parse it back (or format it as a string) and never assume `number`.

FE imports **types only** from `src/`:

```ts
import type { RunEvent, Stage, AssetVerdict, UniverseEntry } from '@/src/pipeline';
import type { Thesis, Allocation, CompiledMandate } from '@/src/thesis';
import type { BasketPlan } from '@/src/planner';
import type { Decision } from '@/src/guard';
```

A `import type` never pulls runtime code into the bundle, so this stays safe. A value import
from `src/` in a client component is a bug — it drags the RPC client and the LLM SDK into the
browser.

---

## BE — backlog, in order

Order is from `05-status.md § Suggested order`. Item 1 unblocks the most and nothing else should
jump ahead of it.

### 1. Mainnet deploy + one real fill ✅ done 2026-08-11

```
FairValueOracle  0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09  (replaced 2026-08-11, D42)
ReceiptRegistry  0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6
PolicyGuard      0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be  (replaced again 2026-08-12, D56)
Executor         0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2  (replaced again 2026-08-12, D56)
FeeCollector     0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0
PoolSwapper      0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28
cash             0x4ae46a509F6b1D9056937BA4500cb143933D2dc8  (real USDG)
```

**Sixteen fills, receipts `#0`–`#15`** — `receipts.count()` reads 16 on chain. `#15` is the first
placed from a browser (D65); `#9`–`#13` are exits under the issuer-priced model and `#14` an entry. `#4` is the first
**exit** (D51), and `#5`–`#8` are the seeded baskets for theses #1 and #2, each carrying an
`evidenceHash` that verifies against a bundle on disk (D57, D58). They sit in one append-only
history because `ReceiptRegistry` was kept across every migration — three of them now. Everything deployed
and listed in `src/deployments.ts` is verified on Sourcify. `MAINNET` is populated, so the FE header chip lights up on its own.
**Read addresses with the chain id**: the new mainnet guard and executor reuse addresses the old
*testnet* TestUSDG and PolicyGuard had — same deployer, same nonce sequence, two chains.

The route there is worth knowing about, because it changed the contracts: **the Universal Router
cannot swap on X Layer**. It carries the canonical v3 factory in its bytecode and X Layer's is not
canonical, so every swap resolved to an empty address (D35). `Executor` now derives the pool
itself. If you see `ADDR.universalRouter` anywhere, it is a trap.

### 2. Wallet seam for the FE ✅ shipped 2026-08-11

FE is unblocked. Three modules, all browser-safe — no `node:` import, no `process.env`, no RPC
client. They must stay that way.

| Module | Exports |
|---|---|
| `src/abi.ts` | `POLICY_GUARD_ABI`, `FAIR_VALUE_ORACLE_ABI`, `EXECUTOR_ABI`, `RECEIPT_REGISTRY_ABI`, `ERC20_ABI`, `PERMIT2_ABI`, plus `TRIGGER_METRICS` / `TRIGGER_COMPARATORS` / `MARKET_STATES` and their encode/decode helpers |
| `src/deployments.ts` | `TESTNET`, `MAINNET` — both populated since the D42 migration; `MAINNET` is no longer `null` |
| `src/chain.ts` | `xLayer`, `xLayerTestnet` — viem chain objects, ready for wagmi |

`pnpm verify:abi` checks every exported selector against the compiled bytecode, so an ABI that
drifts from a contract fails loudly instead of at the moment someone spends gas.

The errors are in the ABIs deliberately: viem decodes a revert against the ABI it is handed, so
`TriggerFired(0, wMUx, 813, 1000)` only renders as that sentence because the error is listed.
Surface those — a guard's refusal, with its numbers, is the product.

FE signs in the browser with its own wallet library. BE does not build a signing endpoint — a
server that can sign is a server that has custody, and D6 forbids it.

### 3. Deploy the API runtime ✅ done

**https://reckonz.xyz** — Root Directory is the repo root, not `app/`. The only environment
variable that belongs there is `GEMINI_API_KEY`; the web path reads no key that can move funds, and
it must stay that way. Checked 2026-08-12 by tracing every deployed route: `/api/theses` and
`/api/universe` read nothing from the environment at all. **Contract addresses are compiled into
the bundle, not read from env** — so a guard or executor redeploy needs a Vercel redeploy, or the
page builds mandates pointing at a dead contract. `pnpm build` is `next build` (Foundry moved to `build:contracts`) so Vercel's default works.

Verified in production end to end, not just a 200: six stages, live Gemini, 30 assets from the
chain, capacity-limited plan, one of two assets refused at the guard.

### 4. `FeeCollector` ✅ done

15 bps on notional, ceiling fixed in code at 50. Took a real fee on the second fill. The receipt
records what was *traded*, not what was pulled — see D37 for why that distinction protects the
guard's slippage check.

### 5. `ThesisRegistry` ✅ done

`0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E`. Publish a thesis, execute against it, and the receipt
carries the same hash — receipt #2 resolves to thesis #0, published 47 seconds earlier. Anyone can
check that ordering.

Deliberately **no paid-following mechanism**: `06-assessment.md` argues that needs a legal answer
first, and the record is useful without the market on top of it.

### 6. Deploy the publish worker — scheduled 18–19 Aug 2026

The last BE item with a date on it. `pnpm publish:loop` and `railway.json` are built and
deliberately idle until then; the reasoning, the funding and the runway are in
`05-status.md § Not done`. Two things to do in order: **fund the publisher `0x40101A49…` with $5–6
of OKB** (a plain transfer, no Safe signatures), then bring the worker up with `TARGET=mainnet`,
`PUBLISHER_KEY`, `PUBLISH_INTERVAL_SEC=600`, and **no `PUBLISH_SYMBOLS`** — it publishes all thirty
(D85), because the mandate picker offers all thirty and a narrowed publisher turns twenty-six of
those checkboxes into a `STALE` revert.

`railway.json` restarts it up to **100** times on failure, not 10 (D46, amended). The worker exits
only after six consecutive failed cycles, so ten restarts is about ten hours before the host gives
up for good — and a deployment that has given up is a permanently stale oracle. Whether it is
actually publishing is `GET /api/health`'s job (D81), not the restart count's.

**Before starting it, attach a Railway volume at `/data` and set
`OBSERVATIONS_PATH=/data/issuer-marks.jsonl`** (D67). Without it the sampler writes to a container
filesystem that is wiped on redeploy, and the price history the worker exists to accumulate is lost
every time it restarts. Do **not** mount the volume over `observations/` — an empty volume there
shadows the marks that ship in the image.

Then, once before submission: pull `/data/issuer-marks.jsonl` down and run

```bash
pnpm sample --merge ./issuer-marks-from-worker.jsonl   # idempotent; dedupes on symbol+observedAt
git add observations/issuer-marks.jsonl                 # a σ from a file nobody has is a magic number
```

At 30 assets the burn is 0.002648 OKB/day — about **$0.28 a day** at WOKB $107.15, so $5 is 17.6
days and $6 is 21.1 (measured 2026-08-15 at 0.020000001 gwei). Up on the 18th, that is dry around
**6–9 Sep**, so the reminder in the status doc sits at **3 Sep** and top-up-or-shut-down is a
decision someone has to make, not a thing to discover. `PUBLISH_SYMBOLS` (D63) still exists for a
hand publish — one symbol is 53,739 gas, and the publisher's existing 0.00276 OKB is **1,532 runs**
at 0.02 gwei — but it is deliberately *not* set on the worker, and narrowing it is not how the
runway gets stretched. See D85 and its same-day amendment.

### 7. Next up

**Update 2026-08-12: both halves are built.** `app/components/Theses.tsx` renders the registry
join; `follow` preselects a thesis's executed basket in the mandate form via
`app/components/follow.ts` and carries its hash into the fill. The fill itself is
`app/components/Fill.tsx` + `POST /api/fill` + `src/fill.ts` (D64) — the server quotes and asks the
guard, the wallet approves, signs and sends.

Both halves have now been run against the OKX extension end to end — receipt #15, thesis #0's hash
on it (D65). Two bugs stood in the way and are fixed: `useWallet` gave every component its own
connection, so every wallet-dependent panel was unreachable, and `waitForTransactionReceipt` never
returned through the injected provider. The guard still answers `STALE` whenever the publisher has
not run inside `maxAge`; one `PUBLISH_SYMBOLS=<sym> pnpm oracle:publish` clears it. The rest of
this section is the brief it was built from.

Simple mode. The read half is done and on `main`: `src/track-record.ts` + `GET /api/theses`
(`pnpm track-record` shows the same data in the terminal). Each thesis arrives with its basket
already derived from settled fills, its weighted slippage, and whether it was published before it
was executed.

What is not done is the follow itself. **The stated blocker was wrong**: this was "gated on wallet
connect", wallet connect shipped 2026-08-12, and the flow did not move — because the real gap was
that nothing in `app/` could produce a Permit2 signature. `src/permit.ts` closes that half (D63) and
is exercised by every CLI fill, so it is proven rather than merely written. What remains is a
component that quotes, shows the guard's verdict, calls `signTypedData` and sends. ~~**The browser
has still never placed a fill.**~~ — **built and run 2026-08-12: receipt #15** (D64, D65). Auto-DCA
was dropped for this submission; the reasoning is D50.

Be warned what the data looks like: **one** thesis, and only **one** receipt bound to it — a
single wSPYx entry of $0.50. Three further receipts carry no thesis hash and are returned
separately as `unattributed`. Render them; dropping them would overstate the discipline.

### Known gaps BE owns

Updated 2026-08-11 after D38–D42.

- ~~**Claude provider is typechecked and has never executed**~~ — **removed 2026-08-12 (D59)**.
  Gemini Flash 3.6 is the only live provider; the fixture is a deliberate choice rather than a
  fallback since D69, so no key now means an error rather than a recorded answer. Bring-your-own-key
  (D43) was aimed at this gap and would not have closed it: a path is unproven until it runs once,
  whoever pays. Deleting it was the closure.
- ~~**Yahoo Finance is not a production data source.** The blocker is licensing, not engineering.~~ — **done 2026-08-12 (D62).** The oracle now prices from the issuer's own mark. Yahoo is **deleted** (D63); the gap σ now comes from `observations/`, sampled from the issuer by the publish worker.
- ~~The oracle prices 8 of the 30 xStocks~~ — **28 of 30** now, admitted by a measured test
  (D38). The two refusals are measured, not pending.
- ~~One admin key that can publish any fair value~~ — admin is a **2-of-3 Safe**, publishing is a
  separate hot key, and the deployer administers nothing (D40, D42).
- **The publisher is still a hot key, and that is structural.** `publish()` runs every fifteen
  minutes from a machine, so consent cannot gate it; the contract bounds it instead (D41). A
  bound caps the rate of change and forces an event trail — it does not prevent a determined
  holder from walking a value in confirmed steps.
- ~~`wSKHYx` quotes in KRW and does not reconcile~~ — the FX leg is built; it now fails on
  **basis, at −86.4%**, which is a measurement rather than a missing capability (D39). What that
  pool is actually pricing is unknown and we do not guess.

---

## FE — backlog, in order

### 1. Deploy the web app ✅ done by BE 2026-08-11

**https://reckonz.xyz.** Redeploys on push to `main`. If you need to change build settings:
Root Directory is the repo root (not `app/`), and `GEMINI_API_KEY` is the only environment
variable — never add a key that can move funds to a host serving public traffic.

A run takes ~2 minutes and `maxDuration` is 300. If it ever gets cut at 60 seconds, that is a plan
limit, not the code.

### 2. Make the run legible

The page works end to end today; it is not yet something to record a video of. Priorities:

- **The refusals are the product.** `REJECT NO_REFERENCE`, an unmapped beneficiary, and the
  refused remainder — $243,373 of $250,000 on 2026-08-15 — are the three moments that make the
  pitch land. They currently read as errors. They are the thesis. Render the refused amount from
  the run rather than hard-coding it: it was $248,382 four days earlier, because capacity doubled
  (D84).
- **The ~2-minute run** needs to feel like work, not a hang. Six stages, each landing on its own.
- **A withheld value must never be displayed as a number** (D28). If `report` marks a value
  unpublishable, render the withholding — not `0`, not `—` alone.
- Mobile is not required. Judges will use a laptop.

### 3. Wallet connect — ~~FE~~ **done, and taken over by BE 2026-08-12**

Connect, chain switch and account state ship in `app/components/useWallet.ts` +
`app/components/Wallet.tsx`, mounted in the page header. Signing happens in the browser; no key
or signature reaches the server.

**No wallet library was added.** Discovery is EIP-6963 and the transport is viem's `custom()`,
and viem was already a dependency — so `package.json` and the lockfile were never touched, which
also removes the shared-file conflict this ticket used to warn about.

The cost of that choice, stated rather than discovered later: **there is no WalletConnect**, so
no phone-scans-a-QR path. Only browser extensions announce themselves. That is the demo we are
building for, and it is a real limitation if that ever stops being true.

`useWallet()` returns `walletClient`, a viem `WalletClient` — and it is deliberately `null` when
the wallet is on a chain with no deployment in `src/deployments.ts`. A `writeContract` against one
of our addresses while the wallet sits on another network sends a transaction to whatever happens
to live there.

**Mandate creation ships with it**, in `app/components/Mandate.tsx`. Blast radius and asset
allowlist in the panel, `createMandate` from the user's own wallet, then a poll until the mandate
is readable — a confirmed write is not immediately readable on this chain (D18), and the panel
says so on screen rather than showing a zero. Assets come from `GET /api/universe`, which is
`universe()` out of `src/pipeline.ts`, so the picker computes nothing (D28).

`agent` is set to the user's own address: they propose their own trades, and no key of ours can
act on their mandate. `executor` is the deployed `Executor` — not the user — because
`Executor.execute` checks `m.executor == address(this)` before it will pull a single USDG.

**Untested against a real wallet.** Written where no extension exists. First run belongs on
testnet.

The call to build against first:

```ts
import { POLICY_GUARD_ABI } from '@/src/abi';
import { TESTNET } from '@/src/deployments';

writeContract({
  address: TESTNET.contracts.PolicyGuard as `0x${string}`,
  abi: POLICY_GUARD_ABI,
  functionName: 'createMandate',
  args: [agent, executor, policy, assets],
});
```

`policy` is the `Policy` struct — `maxWeightBps`, `minCashBufferBps`, `maxSlippageBps`,
`maxDeviationBps`, `maxGapRisk`, `maxNotionalPerTrade`, `maxFillsPerEpoch`, `epochDuration`,
`minRebalanceInterval`, `enforceWeights`. Every `uint128` and `uint64` field is a `bigint`.
`src/mandate-demo.ts` builds a working one end to end; read it before inventing values.

Then `setTriggers(mandateId, triggers)` — a `Trigger` is `{ metric, comparator, threshold,
assets }` where `metric` and `comparator` are `uint8` **enum indexes**, not strings. Encode them
with `metricIndex()` / `comparatorIndex()` from `src/abi.ts`; the order of `TRIGGER_METRICS`
mirrors the Solidity enum and cannot be reordered.

`dryRun(mandateId, fills)` is a read that returns the guard's verdict without spending gas.
Call it before every write and show the answer — refusing early *is* the feature.

### 3b. ~~Two labels in `panels.tsx` now say the wrong thing~~ — **done by BE 2026-08-12, on request**

Raised by BE on 2026-08-12 as a ticket rather than an edit, because `app/components/**` is yours.
Nothing is broken and nothing crashes; two strings are now inaccurate.

D62 rewrote the fair-value engine. The `FairValueReport` shape is unchanged — same fields, same
types, so nothing needs rewiring — but **two of the four gap-risk components mean something
different now**:

```
was:  gap risk = staleness / displacement / uncertainty / basis
now:  gap risk = not quoting / open gap    / band        / basis
```

- `parts.staleness` was "hours since the last exchange print, normalised". It is now binary: **is
  anyone making a market in this token at all**. It reads 0 almost always, and 1 when the issuer is
  halted or shut, which is the state worth showing loudly.
- `parts.displacement` was "how far we carried the price forward with betas". Nothing is carried
  forward any more. It is now **the open gap** — how far this security has historically jumped
  between one session's close and the next open, which is what the *position* is exposed to even
  when the price is perfect.

Suggested labels: `not quoting / open gap / band / basis`.

Two smaller ones in the same block:

- `r.signals` is now **always empty** — the signal machinery is deleted, so the block at line ~309
  never renders. Safe to remove, and worth removing so nobody wonders why it never appears.
- `r.stalenessHours` now reads ~0.0h always, because the mark is live rather than an eleven-hour-old
  close. It is no longer an interesting number to show; the session (`r.state`) and the band are.

**BE edited `panels.tsx` directly, crossing the seam, because Wangsit asked for it explicitly.**
Recorded here rather than done quietly, since the rule exists so nobody's branch silently loses:
the change is confined to one paragraph in the gap-risk line and the removal of the dead
`r.signals` block. Nothing else in the file was touched. If you have that file open on a branch,
this is the conflict to expect. Reword freely — the labels are the part that had to be true, not
the phrasing.

**BE also crossed the seam for the Simple mode surface, 2026-08-12, again on request.** New
files, so nothing of yours is overwritten: `app/components/Theses.tsx` and
`app/components/follow.ts`. Three existing files were touched, and only these lines:

- `app/page.tsx` — one import, one `<Theses />` between `<MandateManage />` and the deployments
  card.
- `app/components/ui.tsx` — `Card` now takes an optional `ref`, forwarded to its `<section>`.
  React 19 needs no `forwardRef`; nothing else about `Card` changed.
- `app/components/Mandate.tsx` — a listener for the `reckonz:follow` event that preselects the
  assets and scrolls the card into view, plus the banner that says which thesis is being followed.
  The create path, the policy defaults and the picker are untouched.

Reword the copy freely. What has to stay true is the honesty of it: the basket comes from settled
fills, weights are not copied into the policy, and the follower sizes and signs it themselves.

**And once more for the fill, same day, same reason.** New file `app/components/Fill.tsx` (panel
10), plus one import and one `<Fill />` in `app/page.tsx`.

`app/components/follow.ts` now holds three one-way events rather than one, and two existing files
gained a listener each: `Mandate.tsx` fires `reckonz:mandates-changed` after it creates one, and
`MandateManage.tsx` re-reads on that and on `reckonz:filled`. Both are additive — a `useEffect`
and an import, nothing existing rewritten. Without them, creating a mandate left the fill panel
saying none existed, and a fill left positions and the track record showing pre-trade state.

**Twice more on 2026-08-14, for the exit and the policy editor.** New file
`app/components/Exit.tsx` (panel 11), plus one import and one `<Exit />` in `app/page.tsx`
immediately after `<Fill />`. Nothing else in `page.tsx` changed.

`app/components/MandateManage.tsx` is the one existing file with real new surface in it: the four
owner-only calls that were CLI-only (`updatePolicy`, `setAgent`, `setExecutor`, `setAssetAllowed`),
added as new sub-components at the bottom of the file plus four blocks inside the mandate card. The
existing render — positions, triggers, the trigger form, the breaker and close buttons — is
untouched, and every new write goes through the `write()` helper that was already there. If you
have this file open on a branch, that is where the conflict will be.

`app/components/Fill.tsx` gained three lines and lost one: it now listens for `reckonz:filled` as
well as `reckonz:mandates-changed`, because an *exit* raises the USDG that panel reports and it was
showing a balance the chain had already left behind. The explicit `load()` it ran after dispatching
that event is gone — the listener does it, and doing both walked the chain twice at once against an
RPC that throttles.

Reword any of the copy. What has to stay true: the policy form sends the **whole** struct back
(`updatePolicy` replaces wholesale), and disallowing an asset does not sell it.

### 4. The logo — asset ready, drop-in is yours

Drawn 2026-08-11. Four tally strokes, the fourth turning into a tick: reckoning, then the verdict.
Both files are committed.

| File | Use |
|---|---|
| `public/logo-reckonz.svg` | the header mark — `currentColor`, no background |
| `public/logo-reckonz.png` | 1024×1024 source, `#0b0d10` baked in |
| `public/logo-reckonz-black.{svg,png}` | mint `#6ee7b7` on pure `#000000` — X profile and post images |
| `public/logo-reckonz-grey.{svg,png}` | `#8b95a4` on pure `#000000` — greyscale treatments |

**Use the SVG in the header, not the PNG.** The PNG has `#0b0d10` filled behind the mark, so
anywhere the page is not exactly that colour it renders as a dark tile rather than a mark. The SVG
carries no background and inherits `currentColor`, so `text-signal` on the wrapper colours it the
same green (`#6EE7B7`) the PNG uses.

The SVG is traced from measured pixels, not by eye: strokes at x 350 / 416 / 482 / 549, pitch 66,
y 254 → 761, weight 31 throughout — the diagonal's horizontal run measures 37, which is 31
perpendicular at that angle, so the weight is uniform. Adjust freely; the numbers are there so a
change is a decision rather than a guess.

Two places to land it:

- `app/page.tsx:24` — replace `<span className="text-[26px] leading-none text-signal">◇</span>`.
- `app/icon.png` — the favicon. Verified against `node_modules/next/dist/docs` for **this** Next
  (16.3): `app/icon.(ico|jpg|jpeg|png|svg)` is picked up automatically, and `apple-icon.png` too.
  `favicon` must be `.ico` and only at the top level of `app/`. The PNG works as `app/icon.png`
  as-is — a dark square is correct for a tab icon.

### 5. Demo video

Record one run end to end. The evidence block in `05-status.md § Results worth keeping` is the
script — that single run exercises every claim the product makes.

---

## Shared, and jointly blocking

Neither of these belongs to one person; both have to be *someone's* on the day.

| Item | Notes |
|---|---|
| ~~**Repo visibility**~~ | ✅ **Public 2026-08-17.** History scanned for secrets first — `.env` never tracked, no key in any of the 160 commits. Anything committed from here is world-readable the moment it is pushed. |
| **`@XLayerOfficial` post** | Must go up from [@reckonz_xyz](https://x.com/reckonz_xyz) **at submission time**. The account already exists; the post does not. |
| **Google Form** | Due 21 Aug 23:59 UTC. Link in `00-hackathon.md`. |

---

## Rules neither side may break

These are not style preferences. Each one is load-bearing for the pitch.

- **Non-custodial.** No contract and no endpoint may take custody. See D6.
- **The AI never holds a key that can move funds arbitrarily.** `PolicyGuard` reverts in the same
  transaction as the trade. Off-chain checks are decoration.
- **The oracle is a guard, not a price.** When it cannot defend a number it marks the value
  unpublishable rather than inventing one. Never render an invented one.
- **The web app computes nothing.** If a component needs a number that does not exist in
  `RunEvent`, that is a BE ticket, not a calculation in a component.
- **Report capacity honestly.** Telling the user what the chain cannot absorb *is* the product.
