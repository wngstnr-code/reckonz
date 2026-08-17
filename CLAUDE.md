# Reckonz

Non-custodial execution and risk tooling for tokenised equities (xStocks) on **X Layer**.
Built for the X Layer "AI Season" hackathon (AI-RWA track).

## Read first

`docs/` is **in the repo** — it used to be gitignored and local-only, which stopped working the
moment a second person joined. The decision log is how each of us avoids repeating a mistake the
other already made.

| Doc | When |
|---|---|
| `docs/05-status.md` | **Always.** What exists, what runs, what is blocked, what is next. |
| `docs/04-decisions.md` | Before changing direction. Contains corrections — each one is a mistake you would otherwise repeat. Append-only. |
| `docs/07-team.md` | Before picking up work. Who owns which files, and each side's backlog in order. |
| `docs/08-parallel.md` | Before pushing. Branches, the frozen FE/BE contract, how to touch a shared file. |
| `docs/01-xlayer-reality.md` | Before touching any address, asset, or chain assumption. |
| `docs/03-architecture.md` | Before writing a contract or an agent stage. |
| `docs/02-product.md` | Product shape, revenue model, scope boundaries. |
| `docs/00-hackathon.md` | Rules, prize strategy, how the judges actually score. |
| `docs/06-assessment.md` | The honest read on whether this is a business. |
| `docs/09-design.md` | Before touching `app/` visuals. Palette semantics, the four surfaces, references. |
| `docs/11-social.md` | Before posting as `@reckonz_xyz`. An active account is a stated submission requirement; the daily drafts and the numbers to re-check first live here. |

## Two people, one repo

Wangsit is **BE + on-chain**, Nabil is **FE**. Ownership is by path, and it is not
advisory — two branches editing one file means one of them silently loses.

| Path | Owner |
|---|---|
| `src/**`, `contracts/**`, `script/**`, `test/**`, `app/api/**` | BE |
| `app/` except `app/api/**` — pages, layout, `app/components/**`, styling | FE |
| `package.json`, `pnpm-lock.yaml` | shared — one dependency per commit, never hand-edit the lock |

Before editing, work out which side of the seam you are on and stay there. If a change is needed
across it, it is a ticket for the owner, not an edit. Branch as `be/…` or `fe/…`; never push to
`main` directly. The full rules — the frozen `RunEvent` contract, what counts as a breaking
change, how FE unblocks itself with `src/thesis-fixture.ts` — are in `docs/08-parallel.md`.

## Language

**Talk to Wangsit in Indonesian. Write everything that lands in the repo in English.**

Chat, explanations, questions — Bahasa Indonesia. Code, comments, commit messages, file and
directory names, docs, UI copy, error strings — English. The split is deliberate: the repo is
read by hackathon judges and a teammate, and a codebase in two languages reads as unfinished.

## Commands

```bash
pnpm verify                  # Uniswap math vs live on-chain state — run after touching v3math.ts
pnpm verify:abi              # src/abi.ts vs the compiled contracts — run after touching either
pnpm plan [usdg] [maxBps]    # thesis basket: naive vs planned execution
pnpm capacity                # absorbable size per xStock, by impact limit
pnpm oracle [usdg]           # fair value, gap risk, PolicyGuard allow/reject
pnpm reconcile               # admission test vs the issuer's mark — run before trusting ASSETS
pnpm sample [--loop]         # write the issuer's marks to observations/ — our own price history
pnpm sample --merge <path>   # fold a store collected on the worker's volume back in (D67)
pnpm measure [--multipliers]  # re-derive the recorded multipliers and gap σ from that store
pnpm evidence [hash]         # verify receipts against the bundles they claim (D57)
pnpm blob:check              # can THIS environment write to the archive, and can the site read it
pnpm index [--verify|--rebuild]  # keep observations/registry.jsonl current (D66)
pnpm dev                     # the web app — thesis in, guard verdict out
pnpm build                   # next build (what Vercel runs); contracts are build:contracts
pnpm typecheck               # covers src/ and app/
pnpm test:sol                # 106 Foundry tests
pnpm test:unit               # 232 unit tests over src/ — node:test, no runner dependency (D71)
pnpm test                    # both suites
pnpm check:tests             # both numbers, checked against every doc that states them (D60, D71)
```

Anything that writes on chain takes its chain from `TARGET` (default `testnet`):

```bash
TARGET=mainnet pnpm oracle:publish     # run the engine, publish, read back
PUBLISH_SYMBOLS=wTSLAx,wSPYx …         # a subset, for a hand publish only (D63)
                                       # the worker runs it UNSET — all thirty (D85)
TARGET=mainnet pnpm mandate            # create a mandate, install triggers, hand to Executor
TARGET=mainnet pnpm execute <sym> [n]  # quote -> dryRun -> Permit2 -> one real fill
TARGET=mainnet pnpm exit <sym> [usdg]  # the reverse: sell a position back to USDG (D51)
TARGET=mainnet pnpm exit <sym> --units <n>   # size in the asset, not through the oracle (D68)
TARGET=mainnet pnpm exit <sym> --unmeasured  # sell with no slippage protection, said out loud (D77)
TARGET=mainnet pnpm swap [okb]         # OKB -> USDG, to fund the deployer
TARGET=mainnet pnpm safe:admin status  # the 2-of-3, and which owner keys you hold
TARGET=mainnet pnpm safe:admin treasury|feebps <v>   # admin-only, needs two signatures
TARGET=mainnet pnpm mandate:create <syms>  # a mandate with a deliberate allowlist
TARGET=mainnet pnpm mandate:show [id]  # policy, positions, triggers, what is firing
TARGET=mainnet pnpm mandate:edit <id> <action>   # close|agent|asset|policy|trigger
TARGET=mainnet pnpm breaker <id> [on|off]  # the owner kill switch; no args = read it
TARGET=mainnet pnpm fees [withdraw]    # what the fee earned, and sweep it to the treasury
```

## Non-negotiables

- **Non-custodial.** No contract in this repo may take custody of user funds. See D6.
- **The AI never holds a key that can move funds arbitrarily.** There is no
  `proposeRebalance()` — that function was in the docs for weeks and never in the code (D52).
  What actually enforces this is **Permit2**: `Executor.execute` / `Executor.exit` pull against a
  signature the *owner* produced, scoped to one token, capped in amount, expiring in 20 minutes.
  An agent key with no fresh signature moves nothing. `PolicyGuard` then bounds the trade and
  reverts in the same transaction. Off-chain checks are decoration.
- **The oracle is a guard, not a price.** It reads the issuer's mark for the token, adjusts for
  shares per token, and publishes it with its uncertainty and a risk score so consumers can refuse
  to execute. It does not forecast — that stopped with D62. When it cannot defend a number it marks
  the value unpublishable rather than inventing one. Never weaken this.
  Since D79 a **cross-check** sits between the engine and the chain: the quote against itself, the
  spread against plausibility, the mid against our own `observations/` history, and the value
  against the pool. It withholds, never corrects — and a check that cannot run reports `skipped`,
  never `ok`.
- **Tooling, not investment advice.** The user writes the thesis; the system maps and
  executes it. Never invert.
- **Report capacity honestly.** Telling users what the chain cannot absorb is the product.
  Never silently force capital into a market that cannot take it.

## Facts that will bite you

- **The Uniswap V3 factory on X Layer is NOT at the canonical address.** It is
  `0x4b2ab38dbf28d31d467aa8993f6c2585981d6804`. SDK defaults fail *silently*.
- **The Universal Router on X Layer cannot swap.** It carries the canonical factory in its
  own bytecode, so every V3 swap through it resolves to an empty address and reverts with
  no data. `Executor` derives the pool itself via `V3Swapper`. Never route through
  `ADDR.universalRouter`. See D35.
- **A deployed address with the right selector proves nothing.** That router had 39,001
  bytes and the exact `execute` signature. An external dependency is unverified until a
  call that does the *actual work* succeeds against it.
- **Morpho and Ondo are not on X Layer.** The $81.8M lender is Aave V3. Zero RWA-category
  protocols — still true as of 2026-08-11, re-measured across all 56 protocols. See D2, D49.
- **The ~$48k capacity figure is an AMM number with a shelf life.** OKX's own custodial order
  book for these tickers settles on X Layer, so arbitrage deepens the pools; Uniswap V3 here
  has already gone $17.5M → $22.9M. Re-run `pnpm capacity` before quoting it. See D49.
- **Never trust a prose summary of a large JSON API** for X Layer facts — parse the JSON
  or hit the RPC. That is how D2 happened.
- **On an exit, a stale oracle means shortfall zero — not a large shortfall.** `Executor.
  _exitShortfallBps` reads through `observation`, which reverts on `Stale`, and catches it. Measuring
  against a value the oracle has stopped defending computes an enormous false shortfall, and
  `maxSlippageBps` then blocks the exit — D51's trap one layer down. `src/exit-plan.ts` mirrors
  this; anything that plans an exit must use that module rather than its own arithmetic (D68).
  **But that zero has two meanings and only one is a measurement** (D77): the sale landed at or
  above fair value, or nothing measured it at all. Never render the second as `0` — `prepareExit`
  returns `shortfallBps: null` for it, `shortfallMeasured()` in `abi.ts` derives the same fact from
  a receipt, and selling in that state needs an explicit acknowledgement (`--unmeasured`, or
  `acknowledgeUnmeasured` on `POST /api/exit`).
- **On `FairValueOracle`, `peek` is the safe read and `observation` reverts.** Not the other way
  round, whatever the names suggest — `observation` throws `NoData` / `Stale`. `src/abi.ts` said
  the opposite for weeks and the browser fill path believed it (D64). Render with `peek`; decide
  with `checkExecution`, which returns its reasons and never reverts.
- **There are no Chainlink equity feeds on X Layer.** The fair-value layer must be built.
- **DexScreener does not index X Layer.** GeckoTerminal does, as network `x-layer`.
- The public RPC throttles hard: serialise reads, batch ~12, retry with backoff. Use
  `serial()` from `src/chain.ts` rather than `Promise.all` over many RPC calls.
- **There are three mainnet endpoints and two testnet ones, with failover** (D82). Add one only
  after it has executed a real `eth_call`, not merely answered `eth_chainId`. `rpc.xlayer.tech`
  stays primary on purpose: every recorded number in this repo was measured through it.
- **The RPC load-balances, so a confirmed write is not immediately readable.** A read straight
  after a write can hit an unsynced node and return **zeroes, not an error** — and the gas
  estimation for a *dependent transaction* can revert for the same reason. Poll until the state
  is visible before reading it back or sending the next dependent transaction. See D18.

## Conventions

- TypeScript ESM, `viem` for all chain access. Web: Next.js App Router + Tailwind in `app/`.
- **The web app computes nothing.** It renders `src/pipeline.ts`, which wraps the same modules the
  CLI uses. Never reimplement a calculation in a component. See D28.
- Relative imports inside `src/` carry **no** file extension — the one form both `tsx` and
  Turbopack resolve.
- All financial math in `BigInt` at chain precision; convert to `number` only for display.
- Uniswap math is ported faithfully from the Solidity — if it differs from
  `UniswapV3Pool.swap`, the port is wrong.
- **Derive magic constants, do not recall them.** See D5. The pool init-code hash in
  `V3Swapper` is pinned by test against two live X Layer pools for this reason.
- **Explicit casts are unchecked in Solidity.** Two defects have come from this (D31, D36).
  Bound the value before casting, even where it looks unreachable.
- `src/guard.ts` mirrors `FairValueOracle.checkExecution` line for line. If they diverge,
  the off-chain mirror is wrong.
- **An evidence bundle must end up somewhere it can be fetched from** (D80). `writeEvidence` is
  the local half; `persistBundle` in `src/evidence-store.ts` is the one to call, and it reports
  `blob`, `file` or `none` rather than a boolean. `none` is a receipt nobody can audit — render it
  as loudly as a refusal, never as grey text.
- **`GET /api/health` is the operational truth** (D81): it answers whether a fill could succeed
  right now, and returns 503 when nothing can trade. Check it before believing the app is fine —
  a deployment that responds is not a deployment that works.
- **Every public route is gated** (D78). `src/ratelimit.ts` holds the buckets and the in-flight
  caps; a new route under `app/api/` takes one before it does any work and releases it in a
  `finally`. It is a per-instance cost ceiling, not a global guarantee — do not describe it as one.
- **One source per kind of fact:** addresses in `src/deployments.ts`, ABIs in `src/abi.ts`.
  Never inline a second copy in a script — the copy is what drifts. `src/abi.ts`,
  `src/deployments.ts` and `src/chain.ts` must stay importable from the browser: no `node:`
  import, no `process.env`, no RPC client. The FE's wallet UI imports all three.
- Comments explain *why*, especially where a naive implementation would look correct.

## Workflow

- After changing `v3math.ts` or `pool.ts`, run `pnpm verify` — it is the regression test.
- **Never hand-add an asset to `ASSETS` in `src/fairvalue.ts`.** A mapping is admitted by
  `pnpm reconcile`, which reconciles the wrapper's on-chain price against **the issuer's own mark**
  for that token, multiplied by shares per token; `admittedOn` records that it passed, and it is
  what makes a fair value publishable.
  Adding a line because the ticker is obvious is the exact assertion this oracle refuses to make.
  See D38.
- **After a fill or a thesis publish, run `pnpm index` and commit the store.** It is what makes
  `/api/theses` cheap in production, and the file tracer cannot follow the runtime path — see
  `outputFileTracingIncludes` in `next.config.ts`. Forgetting costs latency, never correctness:
  the chain still decides how many receipts exist, so a stale store just makes the read enumerate
  what it is missing.
- Log real direction changes and corrections in `docs/04-decisions.md`; update
  `docs/05-status.md` when something starts or finishes working. Both are read by the other
  person, so they are part of the change, not paperwork after it.
- `pnpm typecheck` before every PR — it covers `src/` and `app/` together, so it is the one check
  that catches a break across the FE/BE seam. `forge test` too if you touched Solidity — and
  `pnpm check:tests` when the suite changes size, because the count is stated in five docs and
  drifted in all five at once when nothing compared them (D60).
- Do not commit private keys. Deployment reads them from the environment. `docs/` is public now:
  no key, no seed phrase, no unrotated API key may appear in it.
- **Contracts are verified on Sourcify** (`forge verify-contract <addr> <path>:<name> --chain 196
  --verifier sourcify`, no API key needed). Anything deployed and listed in `src/deployments.ts`
  should be verified — an address we publish that nobody can read the source of is worth less
  than the redeploy costs. All fourteen were, as of 2026-08-14. To check one, use the **v2** API;
  v1 is in a brownout until 2027-01-08 and answers with what looks like an outage (D74):
  `curl -s https://sourcify.dev/server/v2/contract/196/<address>` → `"match": "exact_match"`.

## Network

```
mainnet   chainId 196   https://rpc.xlayer.tech
testnet   chainId 1952  https://testrpc.xlayer.tech
gas       OKB
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
