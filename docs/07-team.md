# Team — who owns what

Two people, ten days, one submission (deadline **2026-08-21 23:59 UTC**).

| | Person | Owns |
|---|---|---|
| **BE** | Wangsit | `src/`, `contracts/`, `script/`, `test/`, `app/api/`, deployment, docs |
| **FE** | teammate | `app/` except `app/api/`, `app/components/`, styling, wallet UI, hosting of the page |

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
PolicyGuard      0x3F58df45FcB5D1074bA5D046D4928CF5efde5f4d  (replaced)
Executor         0xf3a06c9f0F1AABf01080475E420DD7A1092E1e1B  (replaced)
FeeCollector     0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0
PoolSwapper      0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28
cash             0x4ae46a509F6b1D9056937BA4500cb143933D2dc8  (real USDG)
```

Three fills, receipts `#0`–`#2`, all through the **previous** guard and executor — the
replacements have not yet carried one. Everything deployed and listed in `src/deployments.ts` is
verified on Sourcify. `MAINNET` is populated, so the FE header chip lights up on its own.
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
| `src/deployments.ts` | `TESTNET`, `MAINNET` (still `null` until the mainnet deploy) |
| `src/chain.ts` | `xLayer`, `xLayerTestnet` — viem chain objects, ready for wagmi |

`pnpm verify:abi` checks every exported selector against the compiled bytecode, so an ABI that
drifts from a contract fails loudly instead of at the moment someone spends gas.

The errors are in the ABIs deliberately: viem decodes a revert against the ABI it is handed, so
`TriggerFired(0, wMUx, 813, 1000)` only renders as that sentence because the error is listed.
Surface those — a guard's refusal, with its numbers, is the product.

FE signs in the browser with its own wallet library. BE does not build a signing endpoint — a
server that can sign is a server that has custody, and D6 forbids it.

### 3. Deploy the API runtime ✅ done

**https://reckonz.vercel.app** — Root Directory is the repo root, not `app/`. The only environment
variable is `GEMINI_API_KEY`; the web path reads no key that can move funds, and it must stay that
way. `pnpm build` is `next build` (Foundry moved to `build:contracts`) so Vercel's default works.

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

### 6. Next up

Simple mode — browse published theses with their real on-chain track records. Mostly an FE
question now that the data exists.

### Known gaps BE owns

Updated 2026-08-11 after D38–D42.

- **Claude provider is typechecked and has never executed.** Gemini Flash 3.6 is the default and
  works. Bring-your-own-key was considered as a way to have someone else's key run it and
  **deferred** — see D43. It would not have closed this gap anyway: the path is unproven until it
  runs once, whoever pays.
- **Yahoo Finance is not a production data source.** The blocker is licensing, not engineering.
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

**https://reckonz.vercel.app.** Redeploys on push to `main`. If you need to change build settings:
Root Directory is the repo root (not `app/`), and `GEMINI_API_KEY` is the only environment
variable — never add a key that can move funds to a host serving public traffic.

A run takes ~2 minutes and `maxDuration` is 300. If it ever gets cut at 60 seconds, that is a plan
limit, not the code.

### 2. Make the run legible

The page works end to end today; it is not yet something to record a video of. Priorities:

- **The refusals are the product.** `REJECT NO_REFERENCE`, "Samsung → unmapped", "$248,382
  refused" are the three moments that make the pitch land. They currently read as errors. They
  are the thesis.
- **The ~2-minute run** needs to feel like work, not a hang. Six stages, each landing on its own.
- **A withheld value must never be displayed as a number** (D28). If `report` marks a value
  unpublishable, render the withholding — not `0`, not `—` alone.
- Mobile is not required. Judges will use a laptop.

### 3. Wallet connect + mandate creation — unblocked

Today the page reads and decides; it cannot sign. Everything on-chain still happens through
`pnpm mandate` / `pnpm oracle:publish`. Target: connect, pick a chain, create a mandate, see the
receipt.

- Sign **in the browser only**. No key ever reaches the server.
- Chain switch between 1952 and 196 driven by `src/deployments.ts` — if `MAINNET` is `null`,
  offer testnet only.
- Add the wallet library to `package.json` yourself; see `08-parallel.md` for how to touch a
  shared file without a conflict.

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

### 4. The logo — asset ready, drop-in is yours

Drawn 2026-08-11. Four tally strokes, the fourth turning into a tick: reckoning, then the verdict.
Both files are committed.

| File | Use |
|---|---|
| `public/logo-reckonz.svg` | the header mark — `currentColor`, no background |
| `public/logo-reckonz.png` | 1024×1024 source, dark background baked in |

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
| **Repo visibility** | Private today. Rules do not demand public, but judges scoring "product completeness" will want to read it. Decide before submitting. |
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
