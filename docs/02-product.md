# Product — Reckonz

## The opening

X Layer has a **live tokenised-equity market with no application layer on top of it**.
No portfolio manager, no index product, no research layer, no risk tooling, no
liquidity-aware execution. And three structural problems nobody has solved anywhere:

1. **The market-hours gap.** NYSE/Nasdaq are open ~32 of 168 hours a week. The tokens
   trade 24/7. For ~80% of the time these assets trade with **no reference price and no
   way to hedge or redeem**. Earnings land after the close; macro moves over weekends.
2. **Thin, uniform liquidity.** ~$200k per pool. A $50k order loses ~6% instantly, and
   nobody tells the user.
3. **wSPCXx has no public price at all.** SpaceX is private. The token exists; the
   reference does not.

## What it is

The user writes a thesis in plain language:

> *"HBM memory supply stays tight for two more quarters, and the beneficiaries are
> wider than NVIDIA alone."*

The system then does four things nobody currently does:

1. **Maps the thesis onto what is actually investable on X Layer** — discovered from the
   factory at runtime, not hard-coded, so newly listed xStocks are absorbed automatically.
2. **Sizes against real depth.** Reads live pool state, computes true slippage per size,
   tells the user the **maximum sane position**, splits the order, and *refuses to force
   capital into a market that cannot take it*.
3. **Guards execution against fair value.** Knows the underlying is closed, how stale the
   last official print is, and how wide the uncertainty band is. Refuses to execute in
   high-gap-risk windows.
4. **Publishes a thesis receipt on-chain** — the thesis, the mapping, the evidence, the
   weights, the realised fills. Auditable, shareable, and impossible to polish.

## Non-custodial — decided

**Users hold their own assets.** The system decides *what*, *how much*, *when*, and
*whether at all*; it never takes deposits.

This was decided after measuring capacity. A vault that gathers assets has no room to
gather them into: the whole universe absorbs ~$48k at 0.5% impact. `PolicyGuard`,
`ReceiptRegistry` and `ThesisRegistry` are unaffected — only the question of whether
funds sit in our contract changed, and they do not.

## Revenue

| Stream | Mechanism | Assessment |
|---|---|---|
| **Execution fee** | 15 bps on notional routed | ✅ **Live on mainnet.** `FeeCollector` `0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0`, ceiling fixed in code at 50 bps. Took its first fee on the second real fill. |
| **Thesis subscription** | Pay to follow a published thesis — per-call via x402, or a subscription | **Highest margin, needs no AUM.** This is the actual business. Depends entirely on the on-chain track record being unfakeable. |
| **Oracle feed** | Other X Layer protocols pay for fair value + gap risk | **Most durable.** Slow to start, compounds as xStocks grow. |
| Management / performance fee | bps on AUM | **Dead on arrival.** Capacity is ~$48k across all 30 assets. Do not build the story on it. |
| Order flow / market making | — | No. Adds inventory risk, muddies the positioning. |

Early revenue = execution fees. Business = subscriptions. Long game = the oracle.
All three depend on the same thing: **on-chain receipts that make performance
unfalsifiable.**

Both halves of that now exist on mainnet: two receipts in an append-only registry only
`PolicyGuard` can write to, and a fee that landed in a contract whose maximum rate is a
`constant` rather than an admin setting. The amounts are small on purpose — the market is
$48k deep — but the mechanism is not a diagram.

OKX's previous hackathon had a "Revenue Rocket" category — monetisation is explicitly
rewarded.

## Positioning and legal framing

**Tooling and execution, not investment advice.** The *user* writes the thesis; the AI
maps and executes it. Never invert that order — a system issuing personalised
recommendations changes its regulatory character in many jurisdictions. This also matches
OKX's own hackathon disclaimer.

## The pitch line

> The AI's key can only call `proposeRebalance()`. Execution is bounded by `PolicyGuard`.
> The worst case from a hallucinating or prompt-injected agent is a rebalance *within*
> the mandate — a bounded loss, not a drained wallet.

That single sentence separates this from every "AI agent that trades for you" in the
competition.

## Scope boundaries

- **Private-market price discovery (the wSPCXx problem) is a separate product.** It is
  the highest-innovation idea we surfaced and the most likely to fail. Keeping it out
  protects both. The oracle handles it correctly by withholding a value.
- **Consumer mode** (browse published theses, one-tap follow, auto-DCA) is a second
  surface on the same engine, not a second product.
- **ASP / x402 layer** — register the engine on okx.ai as an ERC-8004 ASP so other agents
  can pay per call for the universe snapshot, fair value, or thesis compilation. This is
  what earns the "for users *and autonomous agents*" framing the judges rewarded.
