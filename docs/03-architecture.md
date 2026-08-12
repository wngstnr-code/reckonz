# Architecture

Layers L0–L5. L1 and L2 are partially built; see `05-status.md` for what exists.

## L0 — Foundations

Addresses, network params and asset list: `01-xlayer-reality.md`, encoded in `src/chain.ts`.

## L1 — Contracts on X Layer

Non-custodial: no contract here ever holds user funds.

| Contract | Role |
|---|---|
| `PolicyGuard` | The mandate, stored on-chain, checked **in the same transaction as the trade**, reverting on violation |
| `ReceiptRegistry` | Append-only audit trail of every AI decision and its realised execution |
| `FairValueOracle` | Per-asset fair value, confidence band, gap-risk score, market state |
| `ThesisRegistry` | Published theses others can follow; links a thesis to its receipts |
| `FeeCollector` | bps on executed notional, split creator / protocol |

### PolicyGuard

The heart of "governed". Off-chain checks are worthless — a compromised agent simply
skips them. This reverts.

```
allowedAssets[]        allowlist of xStock addresses
maxWeightBps           per-asset concentration ceiling
minCashBufferBps       USDG buffer floor
maxSlippageBps         re-verified on-chain against the realised fill
maxNotionalPerTrade
maxFillsPerEpoch       with epochDuration
minRebalanceInterval
maxDeviationBps        tolerance around fair value, widened by the oracle's own band
maxGapRisk             refuse execution when gap risk is too high
enforceWeights         portfolio-level weight checks, off by default (they cost a read per asset)
circuitBreaker         kill switch — on the Mandate, not the Policy
```

Staleness is **not** a per-mandate field. It is `maxAge` on `FairValueOracle`, global to every
consumer, currently 900s. An earlier version of this file called these `maxTradesPerEpoch`,
`maxOracleStaleness` and `maxGapRiskScore`; none of those names ever existed in the contract.

Invariant: **the agent can never move funds on its own.** It is *not* enforced by a
`proposeRebalance()` function — there is no such function and there never was (D52). It is
enforced by Permit2: `Executor.execute` and `Executor.exit` pull against a signature the **owner**
produced, scoped to one token, capped in amount, and expiring in twenty minutes. An agent key with
no fresh signature can do nothing at all. Worst case from a hallucinating or prompt-injected agent
is a trade inside the mandate, for at most the amount the owner just signed for.

### ReceiptRegistry

One append-only entry per action:

```
Receipt { mandateId, policyVersion, thesisHash, evidenceHash,
          agent, timestamp, blockNumber }
Fill[]  { asset, isExit, amountInUsdg, amountOut,
          executionPriceE8, slippageBps, fairValueE8, gapRisk }
```

The fields are per-*fill*, not per-basket: there is no `basketId`, `epoch`, `actionType` or
`targetWeights[]`, and this file claimed all four until 2026-08-12. What a basket was is
reconstructed from the fills that share a `thesisHash` — see D50, which is also why Simple mode
needs no IPFS.

Because fills and slippage are recorded on-chain, **track record cannot be polished**.
That is what makes the subscription revenue stream possible.

### FairValueOracle — built, `contracts/FairValueOracle.sol`

Publishes `Observation { fairValueE8, confidenceBps, gapRisk, state, anchorAt, updatedAt,
hasValue }` per asset. Two read paths:

- `peek()` — raw, unchecked, for UIs.
- `fairValue()` — reverts on `NoData` / `Stale` / `ValueWithheld`, for contracts.
- `checkExecution(asset, executionPriceE8, maxGapRisk, maxDeviationBps)` — the call
  `PolicyGuard` makes. Returns `(ok, reason)` with codes `NO_DATA`, `STALE`,
  `NO_REFERENCE`, `GAP_RISK`, `OFF_FAIR_VALUE`.

Deliberate design point: **the mandate's deviation tolerance is widened by the oracle's
own admitted uncertainty.** Punishing a trade for landing inside a band the oracle cannot
resolve would be incoherent.

The contract does not claim to publish "the price". It publishes an estimate, the width
of its uncertainty, and a risk score, so consumers can *refuse to execute* rather than
trust a number. That distinction is the whole defensibility argument.

## L2 — Off-chain agent pipeline

Four stages, sequential, each with a typed contract.

**1. Universe Mapper** — enumerate pools from the factory, filter to xStocks, pull
`slot0` + `liquidity` via Multicall3, emit `InvestableAsset[]` **with live depth**. Never
hard-code the universe: new listings are absorbed for free.

**2. Thesis Compiler** — LLM turns free text into:

```
claim, horizon, causalChain[],
beneficiaries[] { entity, rationale, evidenceCitation, confidence },
disconfirmingConditions[]
```

`disconfirmingConditions` forces the model to state what would prove it wrong — and those
conditions compile directly into **exit triggers in PolicyGuard**. One LLM output feeds
both the entry and the risk rule.

**3. Allocator** — maps beneficiaries to assets, proposes weights. Not final: must survive
stage 4.

**4. Execution Planner** — built, `src/planner.ts`. Off-chain Uniswap V3 math on live pool
state. Emits max sane notional, true slippage at size, **feedback to the Allocator** (if
the ideal weight is 20% in wMUx but the pool absorbs $807, the weight is cut or staged),
slice schedule, go/no-go against gap risk, and the final calldata bundle.

**Off-chain proposes; on-chain disposes.** `src/guard.ts` mirrors
`FairValueOracle.checkExecution` line for line so the planner never proposes something the
chain would revert. If the two disagree, the off-chain mirror is wrong.

## L3 — Fair-value engine — built, `src/fairvalue.ts`

```
FV = issuer mid × shares/token
```

**Rewritten 2026-08-12 (D62). It used to predict; it now reads.** The old model took the last New
York close from an undocumented Yahoo endpoint and carried it forward with betas against index
futures. The licence was one problem. The other was that the prediction was unnecessary: Backed
quotes these tokens live through the night, a two-sided market they transact in from $1,000 to $20M,
and sampled 91 seconds apart four of eight names had moved more than a basis point. Regressing
futures onto an eleven-hour-old close was re-deriving, badly, what a dealer already publishes.

- **Source** — `src/issuer.ts`, the issuer's own bid/ask for the token. No key, USD for every
  asset, so the FX leg that D39 needed is gone entirely.
- **shares/token** — the corporate-action multiplier. xStock dividends are reinvested rather than
  paid out, so a token is a claim on slightly more stock over time; `wIBMx` is at 1.0204. Measured,
  not assumed: regressing (chain vs issuer mid) on (multiplier − 1) across all thirty assets gives
  slope 1.09, R² 0.82 — the issuer quotes the share, the chain prices the token.
- **Band** — uncertainty about the value *now*. While the issuer quotes, it is that market's own
  spread (10bp open → 50bp closed). When nobody quotes, it is the security's realised close-to-open
  jump distribution, recorded in `MEASURED` with its measurement date.
- **Gap risk 0–100** — what the *position* is exposed to, which is a different question, and keeps
  the jump distribution in the score even while the mark is live. Buying at 3am carries the open
  however good the price is. Equal weights on: is anyone quoting, the open gap, the band, the basis.
  An asset with no recorded gap statistics scores **maximum** on the open-gap term — missing data
  is the least safe state, not the most.

Sources:

| Source | Covers |
|---|---|
| `api.xstocks.fi` `/quotes/assets` | bid/ask, per-session spread, halt state, session |
| `api.backed.fi` `/assets` | token↔wrapper addresses per chain, underlying ISIN |
| `api.xstocks.fi` `/token/{sym}/multiplier` | corporate actions, with history and reasons |
| `observations/issuer-marks.jsonl` | our own history, written by `pnpm sample`. The gap σ behind the band is derived from it by `pnpm measure` — and refused, with a count of how far along it is, until the store has watched enough session boundaries. |

**No refusal cases remain.** All 30 are priced. `wSPCXx` was withheld because SpaceX is private and
no exchange can price it — the issuer marks it anyway. ~~`wSKHYx` quotes in KRW and does not
reconcile~~ — resolved: it tracks a US depositary receipt (`US78392B2060`), not the Seoul ordinary
share, and the ~7× gap was a DR ratio. The issuer had published that identifier the whole time.

`wSPCXx` carries a caveat no other asset does and it is not a technical one: it is the only asset
whose fair value has **one source in the world**. Every other token has two independent opinions,
the issuer's mark and the chain's price. SpaceX has none to check against, and the pool almost
certainly quotes because of the issuer's mark. Two numbers from one source are not two pieces of
evidence.

**Yahoo is gone** — `src/marketdata.ts` was deleted in D63 rather than quarantined. Borrowing a
year of history was the last tie to a source with no licence; building the history is the fix, and
the store above is it.

The remaining open question is the licence on the issuer's API. It describes itself as being for
"integrators such as exchanges, protocols, and developers", which is a statement of intent and not
a grant. Unlike Yahoo, it is answerable: their data, their product, one email.

## L4 — Product surface

- **Pro** — write a thesis → see the mapping → *see the depth reality before confirming* →
  execute → receipt. Everything up to the guard's verdict runs in the browser today; **the execute
  step does not** — it is `pnpm execute` / `pnpm exit` from a terminal. The browser can create and
  govern a mandate (D52, D54) but has never placed a fill.
- **Simple** — browse published theses with real on-chain track records, then follow one once
  at your own size in USDG. The basket is derived from the settled fills, not from the thesis
  text, so it needs no pinning. **Auto-DCA is not in scope** — Permit2 SignatureTransfer is
  single-use, and the alternatives cost either a standing allowance or a database and a
  scheduler we do not have. See D50.

  **Not built as a surface.** The data behind it is: `src/track-record.ts` joins both registries
  and derives each thesis's basket from its settled fills, `GET /api/theses` serves it, and
  `pnpm track-record` renders it in a terminal. **Nothing in `app/` fetches that route** — there is
  no page, no component, and no follow action. Marked rather than left, because "the read half is
  done" is true of the API and false of anything a user can see, and an unmarked line in a surface
  list reads as shipped. Same defect class as the basket page below (D60).
- **Public basket page** — live weights, receipt timeline, gap-risk banner when closed.
  **Not built.** `GET /api/theses` already returns everything it needs, so this is a page and not a
  system; it is simply not written.

## L5 — ASP / x402

Register on okx.ai as an ERC-8004 ASP. Other agents pay per call for: universe + depth
snapshot, fair value / gap risk, thesis→basket compilation.

## Data infrastructure

- Chain reads: **viem + Multicall3**, serialised, batched at ~12.
- **Build your own indexer** — DexScreener does not index X Layer; GeckoTerminal is
  limited. Moat and ecosystem contribution.
- Evidence: IPFS, hash on-chain. **Not built.** `evidenceHash` is written as zero and
  `evidenceCID` as `''` by every path that produces a receipt, exactly as `ThesisRegistry.cid` is.
  Publishing a CID that resolves to nothing is worse than publishing none, so the field stays empty
  until there is somewhere to pin — see D50, where the same problem was routed around by deriving
  the basket from settled fills instead.
- LLM: **Gemini** with structured output for the `Thesis` object. A Claude provider existed here
  and was deleted 2026-08-12 without ever having run — see D59, where the hazard turns out to be
  automatic provider selection rather than the unused code.

## Build order

1. Data layer + Universe Mapper ✅ — all 30 xStocks, read from the chain (D33)
2. Execution Planner ✅ — the moat, demoable before any contract exists
3. FairValueOracle engine + contract ✅ — live on mainnet, **30 of 30 priced** since the reference moved to the issuer (D62); it was 28 of 30 with 2 withheld under the exchange reference (D38),
   publish-time jump bound and a 2-of-3 Safe on admin (D41, D42)
4. `PolicyGuard` + `ReceiptRegistry` ✅ — deployed and verified on both chains
5. Thesis Compiler ✅ — live on Gemini, refuses to substitute unmapped names
6. Mainnet with small caps ✅ — four real fills, 25→1 USDG blast radius, receipts #0–#3
7. `FeeCollector` ✅ — 15 bps, taking a real fee ← **done ahead of order**
8. `ThesisRegistry` ✅ — deployed, loop closed on mainnet (receipt #2 → thesis #0)
9. Simple mode — read layer ✅ (`src/track-record.ts`, `GET /api/theses`); follow-once needs
   wallet connect in the UI ← **next**
10. ASP / x402

`Executor` swaps by calling the pool directly (`V3Swapper`). The Universal Router was in
this design until it turned out it cannot swap on X Layer at all — see D35, and note that
it had been "verified" by checking a codesize and a selector.

## Known risks, to state rather than hide

- **Capacity ceiling ~$48k** at 0.5% impact, across all 30 xStocks. Telling users this is the product; it also
  means revenue cannot come from AUM.
- **Oracle credibility** — answered by confidence bands and the "guard, not truth" framing.
- **The oracle prices 30 of 30 assets** (D62; 28 under D38's exchange reference). Both former
  refusals are closed: `wSKHYx` tracks a US depositary receipt rather than the Seoul share, and
  SpaceX is private but the issuer marks it. The remaining limit is not coverage — it is that a
  wrapper can stop agreeing with its issuer, which is why `pnpm reconcile` re-runs the test and
  fails if one does.
- **Wrapper risk** — xStocks on X Layer are a wrap of an already-wrapped Backed token.
  Read the wrapper and *surface the risk to users*; turn the liability into a trust feature.
- **The publish bound only binds a feed that is actually being published.** Past
  `ANCHOR_MAX_AGE` (1 day) the next value re-anchors freely, and publishing is currently manual.
  Until it runs on a schedule, the bound is weaker in practice than in the contract. See D44.
- **Reference-mapping is unverified for some assets.** wSKHYx proved it, and then proved something
  sharper: the mapping was never inferable from a ticker at all, and the issuer had published the
  right identifier the whole time (D62). Make it a visible
  feature: a per-asset page showing which reference is used and how well it has tracked.
- ~~**Weekends have no signal coverage** — futures are closed too. Only historical gap
  statistics apply, which is reflected in the staleness component.
- ~~**Single-name β has low R²** (0.34–0.49 vs NQ). Not a bug — individual stocks are not
  explained by an index. Wide bands are the correct answer; wSPYx gets R² 0.96 and a
  0.24% band because it *is* the index.
