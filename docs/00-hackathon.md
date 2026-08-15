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

## Judging criteria — there are **three** lists, not one

Read from the live page 2026-08-14; it matches `hackathon.md` word for word, so nothing has been
amended since we copied it. But this file quoted only the first of three, and the two it skipped
are the ones that favour us.

**T&C §4 — the general one.**

> application of AI, innovation, product completeness, user value, integration with
> X Layer, growth potential, and contribution to the X Layer ecosystem

**Disclaimer §4 — what the Organizer says it will actually look at.**

> The Organizer will consider **onchain data, code quality, innovation, and market potential**.
> Final rankings will be determined at the Organizer's sole discretion.

Two words there are not in the first list and are two of our strongest assets. **Onchain data**:
18 receipts on mainnet, every one carrying an evidence hash that `pnpm evidence` re-derives, plus
a fee collector that has actually taken revenue. **Code quality**: 106 Foundry + 136 unit tests,
CI on every push, all fourteen deployed addresses verified on Sourcify, and a decision log that
records the mistakes rather than hiding them. Neither is visible from a demo — both need the repo
and the explorer, which is the next section.

**Liquidity Grant FAQ — the criteria for the 50k, which is our actual target.**

> The Organizer will evaluate projects based on their overall performance during the Hackathon,
> including **product quality, innovation, user value, and contribution to the ecosystem**. The
> best-performing project will receive the grant.

Note what this one *drops*: "application of AI" and "integration with X Layer" are not in it. The
50k is decided on product, not on how much AI is in the product. That is worth knowing before
writing copy that leads with the LLM.

## The submission form — read 2026-08-14, and it is eight fields

This changes what is worth spending the last week on. The whole submission is:

| Field | Required | Ours |
|---|---|---|
| Project Name | ✅ | Reckonz |
| **Project Description** | ✅ | **the single highest-leverage artifact in the entire submission** |
| **Project URL** | ✅ | reckonz.xyz |
| **Github** | optional | ⚠️ **the repo is private** — see below |
| Email / Telegram / X handle | ✅ | |
| X post URL | optional | the `@XLayerOfficial` post |

Three consequences, and each one moves an item on the status board.

**1. There is no track selector.** Nothing in the form asks which track you are in — so **AI-RWA is
inferred from the description**. The 50k Liquidity Grant is awarded to "the best-performing project
in the AI-RWA track", and the only way we enter that track is by writing a description that
unmistakably says *tokenised real-world assets*. If the description reads as "AI trading agent",
we are competing for the 30k against every trading agent instead of for the 50k in a thinner field.
This is the whole strategic bet in `## Prizes` above, and it lives or dies in one text box.

**2. There is no video field, and no deck field.** "Demo video / walkthrough" has been sitting on
the status board as *blocking for a credible demo* — it is **not blocking for submission**. It can
still earn its place linked from the description or the site, but it is now a choice, not a
requirement, and it competes for time with the description and the repo.

**3. `Github` is optional, and the repo is private — while "code quality" is a stated criterion.**
These two facts have to be resolved together. A private repo means the Disclaimer §4 criterion has
nothing to read, and code quality is one of the few places we would beat a polished demo. The
"repo visibility decision" item stops being administrative: leaving the field blank forfeits a
criterion the Organizer says it will consider.

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

### Best Product — announced 13 Aug 2026, eight days before our deadline

The same judges, still announcing, while we are still building. Their framing sentence is the
brief:

> *"The strongest agents do more than demo. They solve real workflows, create clear user value,
> and feel ready to scale."*

| Place | Project | Official description |
|---|---|---|
| 1st | **Leadpoet** | AI sales-intelligence for B2B teams, on Bittensor's Subnet 71. *"Focuses on companies showing **real buying intent** rather than delivering large volumes of low-quality contacts."* |
| 2nd | **bench3.ai** | AI security-scanning for public repos and smart-contract assets, using *"multi-path exploration, **hallucination filtering** and **severity grading** to improve reliability."* Tagline: *"On-chain finance needs a benchmark."* |
| 3rd | **Clawby** | *"A unified real-time financial-data and trading **infrastructure layer for AI agents**, designed to reduce the cost of integrating many separate market, on-chain and compliance sources."* |

Closing post: *"Congratulations to the builders who turned promising agent concepts into refined
products designed for real workflows and meaningful adoption."*

**6. Restraint is the product, and it is what they pay first place for.** Leadpoet's entire pitch
is *fewer, better* — it beat the field by promising **not** to hand you volume. bench3 sells
hallucination filtering and severity grading: two features whose job is to suppress output. This
is the sharpest version of pattern 3, and it is the pattern we are already built on — the oracle
marks a value unpublishable rather than inventing one, `capacity()` reports what the chain cannot
absorb, `PolicyGuard` reverts inside the trade. **We have been treating that as engineering
hygiene. It is the headline.**

**7. All three winners are listed at `okx.ai/agents/<id>`.** They are not just projects, they are
**Agent Service Providers** in OKX's own marketplace. See below — this is the one structural gap
between us and every winner they have announced.

## The marketplace the winners are listed in

`okx.ai/agents` is live, monetised and busy — not a directory of demos. Read 14 Aug 2026:

| Listing | Price | Sold | Why it is worth knowing |
|---|---|---|---|
| **AlphaTerminal** | 20 USDT/mo | 52 | Quant research and signals **for U.S. stocks**, *"missing data and validation boundaries transparently disclosed… provides research and signals only; **it does not custody funds or execute trades**"* |
| **AgentFund** | 0.03 USDT/use | 1.05K | *"Paid **X Layer** strategy intelligence for autonomous finance agents"* — WOKB/xETH/xSOL/xBTC, *"**user-approved** trade signals"* |
| **TraceGuard Relay** | 0.15 USDT/use | 639 | *"Reviews transaction payloads and simulation traces **before broadcasting** risky contract interactions"* |
| **CoinAnk OpenAPI** | 0.01 USDT/use | 14.91K | Derivatives data **for AI agents**, 80 API services |
| **PolyDesk** | 5 USDT/mo | 31 | The Genesis winner, now selling: *"provides **buyer agents** with… **buyer-governed** trading via **machine-readable** services"* |
| **Otto AI** | 5 USDT/mo | 327 | *"DeFi agent on X Layer… pay-per-call swaps… **AI tools for agents and traders**"* |

Three things fall out of that table.

**AlphaTerminal is the closest thing to a competitor, and it confirms our thesis by name.** US
equities, deterministic, boundaries disclosed — and it stops exactly where we start: *no custody,
no execution*. "The judges already paid for the research half" is no longer an inference from
Serenity; there is a priced, selling product that is the research half and says so.

**Nothing here touches tokenised equities.** AgentFund is the X Layer finance agent and it trades
WOKB/xETH/xSOL/xBTC. The xStocks lane is still empty.

**The vocabulary of the whole marketplace is evidence, proof and receipts** — *"evidence
receipts"*, *"XLayer release evidence"*, *"clear evidence and defined generation blockers"*,
*"keeps a record of every call it makes"*. We hash an evidence bundle **before** anything is
signed and put that hash on chain in the same transaction as the fill, and `pnpm evidence`
re-derives it from the file. That is a stronger claim than anything on that page, and it is
currently explained only in `docs/`.

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

## What the Best Product round changes for us — read before the submission

Nothing about the product. Three things about how it is presented, and one gap that is real.

**1. Lead with what we refuse.** First place went to a product whose pitch is that it hands you
*less*. Our submission copy currently leads with the pipeline — thesis in, basket out. The
pipeline is the least differentiated thing we have; every entrant has a pipeline. What almost
nobody has is a system that **declines**: an oracle that marks a value unpublishable rather than
guessing (D62), a capacity number that tells you what the chain cannot absorb, a guard that
reverts inside the trade's own transaction rather than reporting afterwards, and a CLI that
refuses to spend gas on a fill `dryRun` says will fail. That is Leadpoet's argument applied to
money, and it is already shipped and tested.

**2. Say "and agents", not only "and you".** Both Genesis rounds rewarded serving other agents —
PolyDesk explicitly, Clawby entirely. `POST /api/fill` and `POST /api/exit` already **are** an
agent service and we have never described them as one: they take a request, quote it against live
pool state, ask the on-chain guard, hash the evidence, and return a plan that is **inert** — only
the owner's Permit2 signature can activate it, and the server never holds a key. An agent can ask
"may I do this, and what will it cost me" and get a verdict with reasons, and cannot move funds
whatever it does with the answer. TraceGuard Relay sells a weaker version of that for
0.15 USDT/use.

**3. ~~The one structural gap: we are not an ASP.~~ — corrected the same day, and the correction
matters more than the point did.**

Written after reading the Best Product thread, before re-reading *our own* rules. Every Genesis
winner is an ASP at `okx.ai/agents/<id>` because **Genesis was the agent-marketplace hackathon** —
the build-x-series page lists it as its own event, ended 27 Jul. AI Season is a different
competition with different rules, and its requirements are: AI in the product, deployed on X Layer
testnet then mainnet, a dedicated X account, a post tagging `@XLayerOfficial`, and the Google Form.
**`okx.ai` and ASPs appear nowhere in them.**

So registering is *not* a requirement and there is no evidence it is a criterion here. It could
argue for "contribution to the X Layer ecosystem", which is a real line in T&C §4 — but that is an
inference, and it would be the only *build* on a list where everything else is writing. Reading
one competition's results and inferring another's rules is exactly the mistake D2 is in this repo
to prevent: **never trust a summary when the primary source is one click away.**

What survives from the Best Product round is points 1 and 2 above, which are about how we describe
what already exists. Those hold regardless of which hackathon announced them, because they are
about how these particular judges read a product.

**What not to do.** Not breadth. Seven days out, with a loop that closes on mainnet and two suites
guarding it, the failure mode is starting something that is half-finished on 21 Aug. `06-assessment.md`
already made that call and the Best Product round backs it: every winner is narrow.

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
