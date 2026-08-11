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

### 1. Mainnet deploy + one real fill 🔴 blocking

The hard requirement ("testnet during, mainnet after") *and* the only place `Executor`'s swap
path stops being unit-tested-only. The Universal Router has **0 bytes on testnet**, so this
cannot be faked.

- Fund a mainnet deployer with OKB on chain 196.
- `CASH` must be real USDG `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`, not the mock.
- Decide `maxNotionalPerTrade` and `maxFillsPerEpoch` **before** creating the mandate — they are
  the blast radius.
- `TARGET=mainnet` on every script; record addresses in `src/deployments.ts` (`MAINNET`).
- Expect RPC lag between dependent transactions (D18) — poll until state is visible.

**Hands the FE:** a non-null `MAINNET` in `src/deployments.ts`. The header chip is already wired
to it and lights up on its own.

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

### 3. Deploy the API runtime

The route needs `GEMINI_API_KEY` and a host that tolerates a ~2-minute streamed response
(`maxDuration = 300` is already set). Coordinate with FE — one deployment serves both.

### 4. Rotate the Gemini key

`.env` holds a key pasted into a chat. Rotate before the repo goes public.

### 5. If time remains

`FeeCollector` (turns the revenue model from a doc line into a number on a block explorer, ~half
a day, needs a real fill first), then `ThesisRegistry`. Not before items 1–4.

### Known gaps BE owns

- Claude provider is typechecked but has never executed. Gemini is the default.
- Yahoo Finance is not a production data source.
- The oracle prices 8 of the 30 xStocks. All 30 are investable (D33), but a thesis about Apple
  is refused at the guard with `NO_REFERENCE` — true, and still a limit on what can execute.
- `wSKHYx` quotes in KRW and does not reconcile; the oracle correctly withholds.

---

## FE — backlog, in order

### 1. Deploy the web app 🔴 blocking

Judges will not run `pnpm dev`. The submission has to be a link. Needs the env var and the long
streamed response — see BE item 3, do it together.

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

### 4. The logo

Four directions were drafted 2026-08-11 (the cut / the narrowing / the guard / the reckoning);
none chosen, nothing drawn. The header still uses a bare `◇`. `logo-reckonz.png` is in the repo
root as a starting point.

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
