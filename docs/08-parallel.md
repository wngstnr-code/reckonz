# Working in parallel

Two people on one small repo. The failure mode is not disagreement — it is two branches editing
the same file and one of them silently losing. This file exists so that never happens.

`07-team.md` says *who owns what*. This one says *how to not collide*.

---

## 1. File ownership is the whole rule

Every path in the repo has exactly one owner. **Do not edit a file you do not own.** If you need
a change in the other person's territory, ask for it — it is a two-line message and it costs less
than a merge conflict in a file neither of you fully understands.

| Path | Owner | Notes |
|---|---|---|
| `src/**` | **BE** | The engine. FE imports types from it, never edits it. |
| `contracts/**`, `script/**`, `test/**` | **BE** | Solidity, deployment, Foundry tests. |
| `app/api/**` | **BE** | The route is the seam; it belongs to the side that produces the data. |
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | **FE** | |
| `app/components/**` | **FE** | Including `useRun.ts` — it is a client hook. |
| `docs/**` | both | One file per topic; see §5. |
| `CLAUDE.md`, `README.md` | **BE** | FE proposes wording, BE commits it. |
| `package.json`, `pnpm-lock.yaml` | **shared** | The one genuine hazard. See §4. |
| `foundry.toml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | **BE** | Rarely touched. Ask first. |

Two people editing the same file is not "resolved by git". It is resolved by one of you rewriting
work that already existed. Split by boundary, not by good intentions.

---

## 2. The frozen contract

These are the only things that cross the seam. **Changing any of them requires telling the other
person before you push** — not after.

**Types** (`src/pipeline.ts`, re-exported from `src/thesis.ts`, `src/planner.ts`, `src/guard.ts`):

```
RunEvent  Stage  UniverseEntry  AssetVerdict
Thesis    Allocation  CompiledMandate
BasketPlan  Decision  FairValueReport
```

**Endpoints:**

| | |
|---|---|
| `GET /api/run?thesis=&notional=&maxImpactBps=` | `text/event-stream`, one `RunEvent` per line |
| `GET /api/universe` | `UniverseEntry[]` |
| `GET /api/theses[?id=]` | the registry join — `RegistrySnapshot` from `src/track-record.ts` |
| `POST /api/fill` | quote + oracle + `dryRun` + evidence hash for one leg; returns `FillPlan` from `src/fill.ts`, inert until the wallet signs |

**BigInt crosses as a decimal string on all of them**, not just `/api/run`.

`POST /api/fill` answers **200 with `verdict.allow === false`** when the guard refuses. That is not
an error path: a refusal with its reason is the product, and rendering it as a failure is the one
mistake `09-design.md` names outright.

**Cross-panel events** (`app/components/follow.ts`) — added 2026-08-12 by BE inside FE territory,
so they are announced here rather than discovered:

```
reckonz:follow             CustomEvent<FollowRequest>  a thesis hands its basket + hash onward
reckonz:mandates-changed   Event                       a mandate was created; re-read the chain
reckonz:filled             Event                       a fill settled; re-read the registries
```

One way, no payload on the last two — the reader already knows how to enumerate, and a payload
would be a second description of a mandate that could disagree with the first. Rename or repurpose
one and both panels on either side of it go quiet, which is the failure mode worth knowing about.

**Chain surface, once BE ships it:** `src/abi.ts`, `src/deployments.ts`, `src/chain.ts`.

Rules:

- **Additive changes are free.** A new optional field on a payload, a new stage appended to the
  end — push it, mention it in the PR body, FE picks it up when convenient.
- **Breaking changes are announced.** Renaming a field, changing a type, removing a stage. Say so
  before you push; FE lands the matching change in the same window.
- **FE never edits `src/` to make a type fit.** If the shape is wrong, the shape is a BE ticket.
  A local cast in a component is a lie that survives to the demo.
- **`import type` only, from FE into `src/`.** A value import drags the RPC client and the LLM SDK
  into the browser bundle.

### Announced breaking changes

**2026-08-12 — `FairValueReport.signals` removed, and two `gapRiskParts` fields changed meaning.**

Announced here after the fact rather than before, because BE also landed the matching FE change on
request — `app/components/panels.tsx`, see `07-team.md §3b`. If you have that file open on a branch,
this is the conflict to expect.

D62 rewrote the fair-value engine to read the issuer's mark instead of forecasting from index
futures. Consequences on the frozen shape:

- `signals: SignalContribution[]` is **gone**. Nothing is carried forward any more, so it was
  always `[]`; a field that can only ever be empty is a field nobody checks. Removed rather than
  left, per D59.
- `gapRiskParts.staleness` and `.displacement` kept their names — renaming them would have broken
  the seam for nothing — but they measure different quantities now:

  ```
  staleness     → is anyone quoting this token at all (0 or 1)
  displacement  → the open gap the position is exposed to
  ```

  Labels in the UI now read `not quoting / open gap / band / basis`.

Everything else on `FairValueReport` is unchanged in name and type. `stalenessHours` still exists
and now reads ~0 always, because the mark is live rather than an eleven-hour-old close; it is no
longer an interesting number to render.

### Working before the seam exists

FE should not sit idle waiting for BE. Two unblocks:

- **The fixture provider.** `src/thesis-fixture.ts` produces a deterministic compile — no LLM
  call, no API key, same output every time. Use it to build UI without burning two minutes and a
  Gemini quota per iteration.
- **A captured stream.** Run the app once, save the SSE events to a JSON file, replay them from a
  local mock. A recorded run is a perfectly good fixture and it is instant.

---

## 3. Branches and pushing

`main` is the branch that must always run. Do not push directly to it.

> **Broken once, on purpose, 2026-08-12.** Wangsit pushed seven commits straight to `main` —
> the Simple mode surface, the browser fill, the registry index, and the docs behind them. Recorded
> here rather than left for someone to find in the log, because the rule exists so that neither
> branch silently loses: **six files under `app/` changed, five of which already existed**
> (`page.tsx`, `ui.tsx`, `useWallet.ts`, `Mandate.tsx`, `MandateManage.tsx`). Every crossing is
> listed file by file in `07-team.md § 3`. If you have any of them open on a branch, read that
> before you rebase.

```bash
git switch -c fe/wallet-connect     # FE prefix: fe/
git switch -c be/mainnet-deploy     # BE prefix: be/
```

Before you open a PR:

```bash
pnpm typecheck        # covers src/ and app/ together — both of you run this
forge test            # BE only; expect 105 passed
git switch main && git pull --ff-only
git switch -          # then rebase or merge main into your branch
```

Rebase onto `main` rather than merging it back and forth — the history stays readable and, with
clean file ownership, there is nothing to conflict on anyway.

**Small PRs, merged the same day.** A branch that lives three days is a branch that will conflict.
With ten days on the clock, anything unmerged at the end of a day is risk, not progress.

Review is a read, not a gate. If it is in your own territory and typecheck passes, merge it. The
review exists to keep both of you knowing what the repo contains — not to slow either of you down.

### Commit messages

Follow what is already in the history: `type(scope): what changed`, imperative, lowercase.

```
feat(execute): the missing ability to place a fill at all
fix(contracts): three defects found auditing before mainnet
refactor: every on-chain write picks its chain from TARGET
```

Say what changed and why it mattered. `fix: bug` tells the other person nothing.

---

## 4. `package.json` — the one shared file

Both of you will add dependencies. Both edits land in the same object and git will conflict on
adjacent lines.

- **Add dependencies one at a time, and push that commit alone.** `pnpm add wagmi` then commit
  `package.json` + `pnpm-lock.yaml` with nothing else in it. A dependency bump mixed into a
  feature commit is what makes the conflict painful.
- **Never hand-edit `pnpm-lock.yaml`.** On a conflict: take `main`'s version, re-run `pnpm install`,
  commit the result.

```bash
git checkout --theirs pnpm-lock.yaml   # while rebasing onto main
pnpm install
git add pnpm-lock.yaml
```

- **Scripts:** BE owns the existing script block. FE adds only web scripts and only at the end.

---

## 5. `docs/` is in the repo now

It used to be gitignored and local-only. With two people that no longer works — the decision log
is how the other person avoids repeating a mistake you already made.

| File | Owner | When to write |
|---|---|---|
| `04-decisions.md` | whoever made the call | A real direction change or a correction. **Append, never rewrite.** |
| `05-status.md` | whoever finished the thing | When something starts or stops working. |
| `07-team.md` | both | When the split changes. |
| `08-parallel.md` | both | When a rule here turns out to be wrong. |
| `00`–`03`, `06` | BE | Reference material; largely settled. |

`04-decisions.md` is append-only in practice — every entry is a mistake the other person would
otherwise repeat. Add `D<n>` at the end, do not edit an old one to "clean it up". Two people
appending to the end of the same file will conflict occasionally; the resolution is always "keep
both, renumber", which takes ten seconds.

Before changing direction on anything, read `04-decisions.md`. It is cheaper than rediscovering
why `Promise.all` over the public RPC does not work.

---

## 6. Two things that will actually cost you time

Every other trap in this repo is in `CLAUDE.md § Facts that will bite you`. These two are the ones
that bite *because* you are working in parallel:

- **The RPC load-balances, so a confirmed write is not immediately readable.** A read straight
  after a write can hit an unsynced node and return **zeroes, not an error** — and gas estimation
  for a dependent transaction reverts for the same reason. Poll until the state is visible (D18).
  If FE sees a fresh mandate read back as empty, this is why; it is not a BE bug.
- **`TARGET` decides the chain, and it defaults to `testnet`.** Every on-chain script takes its
  chain from `src/wallet.ts`. If one of you is on mainnet and the other is not, you will compare
  two different worlds and conclude something is broken.

---

## 7. Daily rhythm

Ten days, two people, no standup needed. Two touchpoints:

**Morning** — each of you says the one thing you are landing today, and whether it blocks the
other. Two sentences. Right now the answer is: BE lands mainnet + the wallet seam, FE lands the
deployment + the refusal-first UI.

**End of day** — everything mergeable is merged. `main` typechecks and runs. `05-status.md` says
what is true.

The only hard sync points are the ones already named in `07-team.md`: BE item 2 unblocks FE item
3, and the deployment (BE item 3 / FE item 1) is one job both of you are on. Everything else runs
in parallel without a conversation.
