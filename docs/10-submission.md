# The submission

Eight fields, closing **21 Aug 2026 23:59 UTC**. The form was read on 2026-08-14 and is analysed in
`00-hackathon.md`; this file is the answer to it.

**The one thing to understand before editing anything below.** There is **no track selector on the
form**. The 50,000 USDT Liquidity Grant goes to "the best-performing project in the AI-RWA track",
and the only way we enter that track is by writing a description that unmistakably says *tokenised
real-world assets*. If it reads as "AI trading agent", we compete for the 30,000 against every
trading agent in the event instead of for the 50,000 in a thin field. Every paragraph below is
written with that in mind, and the phrase appears in the first sentence on purpose.

---

## The eight fields

| Field | Value |
|---|---|
| Project Name | **Reckonz** |
| Project Description | below |
| Project URL | `https://reckonz.vercel.app` |
| Github | `https://github.com/wngstnr-code/reckonz` — **optional on the form, and blank forfeits a stated criterion.** Disclaimer §4 says the Organizer will consider *code quality*. The secret audit is clean (120 commits, nothing found). Decide before submitting. |
| Email | Wangsit's |
| Telegram | Wangsit's |
| X handle | `@reckonz_xyz` |
| X post URL | the `@XLayerOfficial` post — draft at the bottom |

---

## Description — the one to paste

> **Reckonz is non-custodial execution and risk tooling for tokenised real-world assets — the
> xStocks equity tokens live on X Layer.** It is not a place to trade them. It is the layer that
> decides whether a trade should happen at all, and refuses when the answer is no.
>
> **What it refuses is the product.** The oracle marks a value *unpublishable* rather than
> guessing when the issuer will not quote. The planner reports what the chain **cannot** absorb:
> ask it for $250,000 of a semiconductor thesis and it sizes $1,618, hands back $248,382, and shows
> that forcing the rest would have cost $176,174 in slippage against $8 for the part that fits.
> `PolicyGuard` reverts inside the trade's own transaction when a bound breaks — not a warning
> afterwards. Almost every financial product sells *you can*. This one sells *you cannot, and here
> is the number*.
>
> **The AI writes rules, not trades.** You state a thesis in plain language. The compiler turns it
> into a falsifiable claim with a causal chain, named beneficiaries and — the part that matters —
> the conditions that would prove you **wrong**. Each of those conditions is compiled into an exit
> trigger the on-chain guard evaluates. A schema, not a prompt, bounds what the model may emit: it
> can only name quantities the chain can measure, and a condition nothing can measure is surfaced
> to you as a manual watch item instead of quietly becoming a rule that never fires. A red-team
> suite runs hostile and prompt-injected theses through that path on every commit.
>
> **The agent never holds a key that can move funds.** Every fill pulls against a Permit2
> signature the owner just produced — one token, a capped amount, twenty minutes. An agent with no
> fresh signature moves nothing, and `PolicyGuard` bounds what it does with one. Unusually, it
> bounds on **market conditions** — whether the price can be defended and the depth is actually
> there — rather than only on destination and size.
>
> **It runs on X Layer mainnet, and the chain is the evidence.** 18 receipts in an append-only
> registry, each carrying a hash of the exact quote, oracle reading and guard verdict the decision
> was made on — published *before* signing, archived publicly, and re-derivable by anyone with
> `pnpm evidence`. A fee collector that has taken real revenue into a 2-of-3 Safe. 14 contracts
> verified on Sourcify. 106 Solidity and 216 TypeScript tests, run in CI on every push.
>
> **It serves agents as well as people.** `POST /api/fill` and `POST /api/exit` take a request,
> quote it against live pool state, ask the on-chain guard, hash the evidence and return a plan
> that is **inert** — only the owner's signature can activate it, and the server never holds a key.
> An agent can ask *"may I do this, and what will it cost me"* and get a verdict with reasons it
> cannot override.
>
> **Honest about the market.** The entire xStock universe on X Layer absorbs about $48,000 at 0.5%
> price impact today. We publish that number rather than hide it — it is the reason the product
> refuses size, and the reason it was built non-custodially. As tokenised equities grow on X Layer,
> the discipline layer above them is already deployed, tested and audited.

**Word count ~430.** If the field turns out to be shorter, use the version below and put the long
one on the site.

---

## Short version, if the field is capped

> **Reckonz is non-custodial execution and risk tooling for tokenised real-world assets — the
> xStocks equity tokens on X Layer.** You write an investment thesis in plain language; the AI
> compiles it into a falsifiable claim *and* into the exit rules that would prove it wrong, and
> those rules are enforced on-chain by a contract that reverts inside the trade. It sizes against
> real pool depth and hands back what the market cannot absorb — $250,000 asked, $1,618 executable,
> the rest refused with the slippage it would have cost. The agent holds no key: every fill pulls
> against a Permit2 signature the owner just produced. Live on X Layer mainnet with 18 on-chain
> receipts, each carrying a re-derivable evidence hash, and a fee collector taking real revenue.

---

## Why it is written this way

Each choice below is traceable to something in `00-hackathon.md` or `docs/06-assessment.md`. Change
the wording freely; change these decisions deliberately.

**It opens with refusal, not with the pipeline.** First place in OKX's Best Product round went to
Leadpoet, whose entire pitch is handing you *less*; second to bench3, selling hallucination
filtering and severity grading — two features whose job is to suppress output. The judges' own
framing sentence was *"the strongest agents do more than demo."* Our pipeline is the least
differentiated thing we have; every entrant has one. A system that declines is rare, and ours
declines in four different places.

**"Tokenised real-world assets" is in the first line** because that sentence is our only route into
the AI-RWA track.

**It says "and agents".** Both Genesis rounds rewarded serving other agents — PolyDesk explicitly,
Clawby entirely. `okx.ai/agents` already sells a weaker version of our verdict endpoint at 0.15
USDT per call. We built the thing and never described it that way.

**It leads the AI section with the schema, not the model.** "We use an LLM" is worth nothing in a
field of LLM projects. "The schema bounds what the model may emit, and unmeasurable conditions are
surfaced rather than proxied" is a design decision a judge can evaluate, and it is the most literal
reading of the vocabulary they used to praise winners: *governed*, *verification*, *act with more
context*.

**It never competes with the venue.** OKX's own Unified Tokenized Stocks is live — 40+ tokenised
stocks on a shared order book, 24/7, settling on X Layer, reportedly no fees and no gas. Claiming
to be a better place to buy loses in front of the people who built the better place. Four things an
exchange structurally cannot offer are the pitch instead: custody stays with the user, execution
bounded by a contract rather than an internal policy, a receipt nobody can polish afterwards, and a
**refusal** to trade in a bad window — no exchange declines a user's trade, because that trade is
its revenue.

**Three claims are deliberately absent** (D49). The market-hours gap is a condition of this venue,
not of the industry. Publishing a fair value with its uncertainty is table stakes next to Pyth, who
now distributes Nasdaq data. Bounded agent execution is commodity — Giza has processed $3.96B under
it. What survives is enforcement on **market conditions**, and that is the sentence the description
makes.

**The $48k is stated, not buried.** It is the weakest fact about this project and putting it in
their hands first is the same move the product makes. It also pre-empts the obvious objection and
converts it into the growth argument: the layer is deployed *before* the liquidity arrives, on the
chain whose parent company has just tied itself to tokenised equities with ICE alongside.

**Numbers to re-check before pasting** — every one of these is read from the chain and drifts:
receipts (18), theses (3), contracts (14 verified across both chains, 8 on mainnet), tests
(106 + 216), capacity (~$48k), and the $250,000 → $1,618 run. `pnpm capacity`, `pnpm check:tests`
and a `count()` read settle all of them.

---

## The X post — required, and the account must post it

`@reckonz_xyz` must publish a post mentioning `@XLayerOfficial` at submission time. Draft:

> Reckonz is live on @XLayerOfficial mainnet.
>
> Non-custodial execution and risk tooling for tokenised real-world assets — the xStocks equity
> tokens on X Layer.
>
> You write the thesis. The AI compiles it into the exit rules that would prove you wrong, and
> PolicyGuard enforces them inside the trade's own transaction.
>
> Ask it for $250k and it tells you $1,618 fits — then hands the rest back rather than force it
> into a market that cannot take it.
>
> 18 on-chain receipts, each with an evidence hash anyone can re-derive.
>
> reckonz.vercel.app
>
> #AISeason #XLayer

Keep the thread short. The description does the work; the post exists to satisfy the requirement
and to be readable by someone scrolling.
