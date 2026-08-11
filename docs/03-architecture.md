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
maxTradesPerEpoch
minRebalanceInterval
maxOracleStaleness     max age of the FairValueOracle observation
maxGapRiskScore        refuse execution when gap risk is too high
circuitBreaker         kill switch
```

Invariant: **the agent's key can only call `proposeRebalance()`.** Worst case from a
hallucinating or prompt-injected agent is a rebalance inside the mandate.

### ReceiptRegistry

One append-only entry per action:

```
basketId, epoch, actionType,
thesisHash, evidenceCID (IPFS),
targetWeights[], executedPrices[], realizedSlippageBps[],
policyVersion, agentSigner, timestamp
```

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
FV = P_close × (1 + Σ βᵢ · rᵢ)     rᵢ = signal return since the last official print
```

- **β** from OLS on a year of aligned daily returns.
- **Band** from the security's own realised close-to-open jumps, weekend gaps sampled
  separately from overnight gaps, shrunk by the share the signals explain (`√(1−R²)`).
  **Not** daily volatility scaled across calendar time — an asset sits still over a
  weekend, and pretending otherwise produced ±19% bands instead of ±5%.
- **Gap risk 0–100** = equal weights on staleness, displacement, uncertainty, basis.
  An *unverifiable* basis scores 1.0, never 0 — not knowing whether the pool is mispriced
  is the riskiest state there is.

Signals, all free public endpoints (`src/marketdata.ts`), all verified live:

| Signal | Covers |
|---|---|
| `NQ=F` / `ES=F` | weeknights while the cash market is closed |
| `000660.KS` | SK Hynix actually trades in Seoul while the US sleeps |
| `BTC-USD` (Coinbase) | crypto-linked names |
| Yahoo `currentTradingPeriod` | authoritative pre/regular/post session windows |

Refusal cases, both live: **wSPCXx** has no reference market (withheld by design);
**wSKHYx** quotes in KRW and does not reconcile with the on-chain price (marked
unpublishable until the wrapper's reference security and an FX leg are verified).

Yahoo is fine to prove the model and **must be replaced before mainnet**.

## L4 — Product surface

- **Pro** — write a thesis → see the mapping → *see the depth reality before confirming* →
  execute → receipt.
- **Simple** — browse published theses with real on-chain track records, one-tap follow
  in USDG, auto-DCA.
- **Public basket page** — live weights, receipt timeline, gap-risk banner when closed.

## L5 — ASP / x402

Register on okx.ai as an ERC-8004 ASP. Other agents pay per call for: universe + depth
snapshot, fair value / gap risk, thesis→basket compilation.

## Data infrastructure

- Chain reads: **viem + Multicall3**, serialised, batched at ~12.
- **Build your own indexer** — DexScreener does not index X Layer; GeckoTerminal is
  limited. Moat and ecosystem contribution.
- Evidence: IPFS, hash on-chain.
- LLM: Claude with structured output for the `Thesis` object.

## Build order

1. Data layer + Universe Mapper ✅ — all 30 xStocks, read from the chain (D33)
2. Execution Planner ✅ — the moat, demoable before any contract exists
3. FairValueOracle engine + contract ✅ — live on mainnet, 8 assets, 2 withheld
4. `PolicyGuard` + `ReceiptRegistry` ✅ — deployed and verified on both chains
5. Thesis Compiler ✅ — live on Gemini, refuses to substitute unmapped names
6. Mainnet with small caps ✅ — two real fills, 25→1 USDG blast radius, receipts #0 and #1
7. `FeeCollector` ✅ — 15 bps, taking a real fee ← **done ahead of order**
8. Simple mode + `ThesisRegistry` ← **next**
9. ASP / x402

`Executor` swaps by calling the pool directly (`V3Swapper`). The Universal Router was in
this design until it turned out it cannot swap on X Layer at all — see D35, and note that
it had been "verified" by checking a codesize and a selector.

## Known risks, to state rather than hide

- **Capacity ceiling ~$48k** at 0.5% impact, across all 30 xStocks. Telling users this is the product; it also
  means revenue cannot come from AUM.
- **Oracle credibility** — answered by confidence bands and the "guard, not truth" framing.
- **The oracle prices 8 of 30 assets.** The other 22 trade and are refused at the guard
  with `NO_REFERENCE`, which is true but is still a limit on what can execute. Widening it
  means verifying, per wrapper, which listed security it actually tracks.
- **Wrapper risk** — xStocks on X Layer are a wrap of an already-wrapped Backed token.
  Read the wrapper and *surface the risk to users*; turn the liability into a trust feature.
- **Reference-mapping is unverified for some assets.** wSKHYx proves it. Make it a visible
  feature: a per-asset page showing which reference is used and how well it has tracked.
- **Weekends have no signal coverage** — futures are closed too. Only historical gap
  statistics apply, which is reflected in the staleness component.
- **Single-name β has low R²** (0.34–0.49 vs NQ). Not a bug — individual stocks are not
  explained by an index. Wide bands are the correct answer; wSPYx gets R² 0.96 and a
  0.24% band because it *is* the index.
