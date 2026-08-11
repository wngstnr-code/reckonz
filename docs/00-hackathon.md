# Hackathon context — X Layer AI Season

Source of truth: `hackathon.md` (raw copy of the rules), `referensi.md` (links to the
previous hackathon's winner threads). This file is the analysis.

## The event

**X Layer "AI Season"**, part of the Build X series. 7–21 Aug 2026, submissions close
**21 Aug 2026 23:59 UTC** via Google Form.

Hard requirements — failing any one makes the project ineligible:

- AI must be part of the product design.
- Deployed on **X Layer testnet** during the hackathon, then launched on **X Layer mainnet**.
- A dedicated project X account, kept active.
- On submission, that account must post and mention `@XLayerOfficial`.

## Prizes, and which ones are real

| Prize | Amount | Assessment |
|---|---|---|
| Hackathon Grant | 30k / 15k / 5k USDT | The main target. |
| **Liquidity Grant** | **50k USDT**, best project in the **AI-RWA track** | **The best risk-adjusted target.** Larger than first place, and competed for only within one track — while most AI+crypto entrants will build trading agents, not RWA. |
| Launch Grant | up to 200k USDT | **Treat as unreachable.** Requires 10M USDT cumulative volume *through the OKX DEX interface* (API explicitly excluded) by 31 Aug — ten days after submission. Do not shape the product around it. |

Target: **AI-RWA track + Hackathon Grant = 80k**.

## Judging criteria (from the T&C)

> application of AI, innovation, product completeness, user value, integration with
> X Layer, growth potential, and contribution to the X Layer ecosystem

## What the previous hackathon reveals

OKX.AI Genesis Hackathon ($100k), judged by "OKXAI Internal Review". Winners announced
Aug 2026 via `@XLayerOfficial` threads.

**Finance Copilot**

| Project | Official description |
|---|---|
| LEAPSY | structured position design agent for long-term crypto options investors, using **real listed Deribit contracts** |
| Serenity | real-time article research for Chinese-speaking equity researchers — **AI hardware, semiconductors, robotics, optical communications** |
| PolyDesk | "data, research, **funding-verification** and **governed-trading** workspace for prediction-market users **and autonomous agents**" |

Other categories: **Lifestyle Companion** (Is This Edible?, Understand 看, Iris Care),
**Software Utility**, **Art Creation**.

### The patterns that matter

1. **Narrow and deep, never a general chatbot.** OKX said it outright:
   *"We're not looking for another chatbot."* No winner was an "AI assistant for DeFi".
2. **Real external data as fuel** — Deribit, prediction markets, equity research. Not toy data.
3. **The judges' own vocabulary is "governed", "verification", "act with more context".**
   They reward agents that are *constrained and auditable*, not agents that are free.
4. **Serving other agents, not only humans.** PolyDesk was praised for serving
   "users *and autonomous agents*".
5. **Non-crypto real-world problems win too** — cooking, eye care, language.

### The signal we are acting on

Serenity won for research into *AI hardware, semiconductors, robotics, optical comms*.
X Layer lists exactly that sector as tradable tokens: NVDA, AMD, INTC, MU, MRVL, SNDK,
SK Hynix, DELL.

**The judges already paid for the research half. Nobody built the execution half, and the
assets are sitting on their chain.**

## Strategic context OKX cares about

- X Layer positioning: *"The New Money Chain"*. OKB is the gas token, fixed 21M supply.
  Roadmap: stablecoins → DeFi → $100M developer fund.
- April 2026: OKX + BlackRock + Standard Chartered framework for BUIDL as yield-bearing
  trading collateral.
- Feb 2026: OKX Ventures backed **STBL** — an RWA stablecoin on X Layer backed by
  tokenised Hamilton Lane private credit via Securitize. Introduced the "Ecosystem-Specific
  Stablecoin" idea. Not found on-chain yet.
- X Layer × **xStocks** partnership — this is the one that is actually live. It brings
  tokenised equities and a **24/7 fast-listing mechanism** into the OKX Wallet ecosystem, on
  top of xStocks' $31B cumulative issuance, with assets integrated progressively. See
  `01-xlayer-reality.md`; confirmed on our own chain reads, since 32 wrappers reconcile
  against their references under `pnpm reconcile`.
- **June 2026: ICE — the parent of NYSE — invested in OKX at a $25B valuation and formed a
  joint venture to put tokenised NYSE stocks on-chain.** Around 23 Jun.
- **OKX `Unified Tokenized Stocks` is live**: 40+ tokenised US stocks and ETFs against USDT
  on a shared order book that merges issuers' versions of the same stock, "starting with
  xStocks", trading 24/7, with deposits and withdrawals on **X Layer and Solana**. US and EU
  excluded; SEA, Northeast Asia, CIS, MENA and Türkiye eligible.
- The ecosystem page carries a dedicated **x402** category (Aeon, AInalyst): OKX is serious
  about agentic payments.

### What that context is worth to us

The three items above were found on 2026-08-11 (D49) and none of them was known when this
file was written. They cut in one direction for the pitch and the opposite direction for the
product, and both need saying before the submission is written.

**For the pitch — this is the strongest card in the deck.** The judges are OKX. Tokenised
equities are the category they have just bet the company on, with the parent of the NYSE
alongside, and their own CEO is on record wanting xStocks on X Layer. This project is the
**non-custodial application layer for exactly that**, on their chain, in a layer that is
measurably empty. That is a better frame than "early to a thin market", and it is the same
project either way. Judging criteria include *integration with X Layer*, *growth potential*
and *contribution to the X Layer ecosystem* — this is the paragraph that answers all three.

**For the product — do not position against the venue.** OKX's order book gives retail 24/7
trading of the same assets with market-maker depth, no gas and no fees. Claiming to be a
better place to buy loses in front of the people who built the better place. See
`02-product.md`: the four things an exchange structurally cannot offer are the pitch.

It also sharpens pattern 3 above. The judges' vocabulary is *"governed"*, *"verification"*,
*"act with more context"* — and a system whose distinguishing feature is **refusing to
execute** is the most literal possible reading of that. Lead with the refusal, not the
execution.
