# The submission

Eight fields, closing **21 Aug 2026 23:59 UTC**. The form was read on 2026-08-14 and is analysed in
`00-hackathon.md`; this file is the answer to it.

> **Style note.** No em-dashes anywhere in this file. It is the one document a judge reads in full,
> and the house voice for it is plain punctuation.

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
| Github | `https://github.com/wngstnr-code/reckonz`. **Optional on the form, and blank forfeits a stated criterion:** Disclaimer §4 says the Organizer will consider *code quality*. The secret audit is clean (120 commits, nothing found). Decide before submitting. |
| Email | Wangsit's |
| Telegram | Wangsit's |
| X handle | `@reckonz_xyz` |
| X post URL | the `@XLayerOfficial` post; draft at the bottom |

---

## Description, the one to paste

> **Reckonz turns an investment thesis into on-chain positions in tokenised real-world assets,
> sized to what the market can actually absorb, and into the exit rules that close them.** The
> assets are xStocks: tokenised US equities (Apple, Nvidia, Tesla and 27 others) that trade as
> ERC-20s on X Layer. Your funds never leave your wallet, at any point.
>
> **How it works.** You write a thesis in plain language: *"HBM memory supply stays tight for two
> more quarters."* The AI compiles it into a falsifiable claim: a causal chain, the companies that
> benefit, and the conditions you said would change your mind. It resolves those companies to
> tokens that actually exist on X Layer, and tells you when one does not instead of substituting
> something close. It sizes each leg against live Uniswap V3 depth rather than against the amount
> you asked for. Your exit conditions become triggers a contract enforces: the decision made while
> you are calm, and enforced when you are not. You sign once, and it executes.
>
> **What it refuses is the product.** Ask for $250,000 of that thesis and it sizes **$6,627**,
> hands back $243,373, and shows that forcing the rest would have cost $55,148 in slippage against
> $33 for the part that fits. The oracle marks a value *unpublishable* rather than guessing when
> the issuer will not quote. `PolicyGuard` reverts inside the trade's own transaction when a bound
> breaks, instead of warning afterwards. Almost every financial product sells *you can*. This one
> sells *you cannot, and here is the number*.
>
> **The AI never holds a key that can move funds.** The server quotes, checks the guard and hands
> back a plan that is **inert**: only your signature activates it, and nothing on our side holds a
> key at any point. Every fill pulls against a Permit2 signature you just produced: one token, a
> capped amount, twenty minutes. Without a fresh signature nothing moves at all.
> `PolicyGuard` then bounds what it does with one, and unusually it bounds on **market
> conditions**: whether the price can be defended and the depth is really there, not only
> destination and size. A schema rather than a prompt bounds what the model may emit, so it can
> only name quantities the chain can measure; a condition nothing can measure is surfaced to you as
> a manual watch item instead of quietly becoming a rule that never fires. A red-team suite runs
> hostile and prompt-injected theses through that path on every commit.
>
> **It runs on X Layer mainnet, and the chain is the evidence.** 18 receipts in an append-only
> registry, each carrying a hash of the exact quote, oracle reading and guard verdict the decision
> was made on. That hash is published *before* anything is signed and the bundle is archived
> publicly, so anyone can re-derive it and check that it matches. Fees have been collected on
> mainnet; admin of the fee collector, the oracle and the receipt registry is a 2-of-3 Safe. Every
> contract is verified on Sourcify (seven on mainnet, seven on testnet), and 106 Solidity plus 216
> TypeScript tests run in CI on every push.
>
> **Honest about the market.** The entire xStock universe on X Layer absorbed $97,329 at 0.5%
> price impact on 15 August 2026, and about $48,000 four days earlier. We publish that number with
> its date rather than hide it, because it is a reading of the pools and not a property of them:
> OKX's own order book settles these tickers on X Layer, and arbitrage between the two is deepening
> the market underneath us. The same pools traded $12.0M in 24 hours. Thin depth is the reason this
> product refuses size, and the reason it was built non-custodially. The discipline layer is
> deployed, tested and audited now; the liquidity is arriving on its own.

**Word count ~630**, up from ~430 when the "How it works" paragraph was added. That paragraph is
the one that cannot be cut: without it a reader finishes the description without ever learning what
a user actually does. If the field is capped, cut from the **bottom**: "Honest about the market"
survives best as a follow-up post or on the site. Use the short version below rather than trimming
the flow out of the top.

---

## Short version, if the field is capped

**~230 words.** Same order as the long one: what it is, what you do, what it refuses, why it is
safe, proof, just with each step reduced to a sentence. It is not the long version with paragraphs
deleted, which is what makes it still readable. **"Tokenised real-world assets" stays in the first
sentence here too**, for the reason at the top of this file: it is the only thing putting this in
the AI-RWA track.

> **Reckonz turns an investment thesis into on-chain positions in tokenised real-world assets,
> sized to what the market can actually absorb.** The assets are xStocks: tokenised Apple, Nvidia,
> Tesla and 27 more, trading as ERC-20s on X Layer. Your funds never leave your wallet.
>
> You write a thesis in plain language. The AI compiles it into a falsifiable claim and into the
> conditions you said would change your mind; those become exit triggers a contract enforces. It
> sizes each leg against live pool depth rather than against the amount you asked for: request
> $250,000 and it executes $6,627, hands back $243,373, and shows that forcing the rest would have
> cost $55,148 in slippage against $33 for the part that fits.
>
> The AI never holds a key that can move funds. Every fill pulls against a Permit2 signature you
> just produced, and `PolicyGuard` reverts inside the trade's own transaction when a bound breaks.
> It bounds on market conditions, whether the price can be defended and the depth is really there,
> not only on destination and size.
>
> The oracle marks a value *unpublishable* rather than guessing when the issuer will not quote, so
> nothing executes against a price we cannot defend. Live on X Layer mainnet with 18 receipts, each
> carrying an evidence hash that is published before anything is signed and that anyone can
> re-derive. Every contract is verified on Sourcify.

### Shortest, if it is a one-line field

> Write an investment thesis in plain language; Reckonz turns it into positions in tokenised
> real-world assets, sized to what X Layer can actually absorb, refuses the rest with the number,
> and enforces your own exit conditions on-chain, from a wallet it never has the keys to.

---

## Why it is written this way

Each choice below is traceable to something in `00-hackathon.md` or `docs/06-assessment.md`. Change
the wording freely; change these decisions deliberately.

**It opens with refusal, not with the pipeline.** First place in OKX's Best Product round went to
Leadpoet, whose entire pitch is handing you *less*, and second to bench3, selling hallucination
filtering and severity grading: two features whose job is to suppress output. The judges' own
framing sentence was *"the strongest agents do more than demo."* Our pipeline is the least
differentiated thing we have, because every entrant has one. A system that declines is rare, and
ours declines in four different places.

**"Tokenised real-world assets" is in the first line** because that sentence is our only route into
the AI-RWA track.

**~~It says "and agents".~~ Removed 2026-08-15, and the reasoning it rested on was already dead.**
The argument was that both Genesis rounds rewarded serving other agents, PolyDesk explicitly and
Clawby entirely, and that `okx.ai/agents` sells a weaker version of our verdict endpoint at 0.15
USDT per call. But `00-hackathon.md` settled on 2026-08-14 that **Genesis was a different
competition with different rules**, and inferring one event's criteria from another's results is
the exact mistake D2 exists to prevent. Three reasons it is gone:

1. **No agent uses it.** The API is real and returns an inert plan, but "serves agents" is a claim
   about an audience that does not exist yet. This file does not get to assert what the rest of the
   repo would refuse to.
2. **It fought the track.** The note at the top of this file warns that reading as *"AI trading
   agent"* drops the entry into the 30,000 pool against every trading agent in the event. A
   paragraph headed "It serves agents as well as people" pulled in precisely that direction.
3. **Nothing load-bearing was lost.** The AI requirement is answered by the thesis compiler, which
   is real and used. The one fact worth keeping, that the server never holds a key, moved into the
   non-custodial paragraph where it belongs.

The endpoints stay built and public. When an agent actually calls one, that is a sentence worth
writing.

**It leads the AI section with the schema, not the model.** "We use an LLM" is worth nothing in a
field of LLM projects. "The schema bounds what the model may emit, and unmeasurable conditions are
surfaced rather than proxied" is a design decision a judge can evaluate, and it is the most literal
reading of the vocabulary they used to praise winners: *governed*, *verification*, *act with more
context*.

**It never competes with the venue.** OKX's own Unified Tokenized Stocks is live, with 40+
tokenised stocks on a shared order book, 24/7, settling on X Layer, reportedly with no fees and no
gas. Claiming to be a better place to buy loses in front of the people who built the better place.
Four things an exchange structurally cannot offer are the pitch instead: custody stays with the
user, execution bounded by a contract rather than an internal policy, a receipt nobody can polish
afterwards, and a **refusal** to trade in a bad window. No exchange declines a user's trade,
because that trade is its revenue.

**Three claims are deliberately absent** (D49). The market-hours gap is a condition of this venue,
not of the industry. Publishing a fair value with its uncertainty is table stakes next to Pyth, who
now distributes Nasdaq data. Bounded agent execution is commodity, and Giza has processed $3.96B
under it. What survives is enforcement on **market conditions**, and that is the sentence the
description makes.

**The capacity number is stated with its date, not buried and not rounded.** It is the weakest
fact about this project, and putting it in their hands first is the same move the product makes.
Since D84 it does more than that: the figure doubled in four days, so publishing it *with the
date and the previous value* turns the weakest fact into a demonstration that the system measures
rather than recites. Judges can re-run `pnpm capacity` and get a third number; that is the point
being made, not a risk to the claim. It also pre-empts the obvious objection and converts it into
the growth argument: the layer is deployed *before* the liquidity arrives, on the chain whose
parent company has just tied itself to tokenised equities with ICE alongside, and whose own order
book is visibly deepening these pools.

**Numbers to re-check before pasting, and every one of these has already moved once.** Receipts
(18), theses (3), tests (106 + 216), capacity ($97,329 at 0.5%, 2026-08-15), 24h pool volume
($12.0M, same day), and the $250,000 → $6,627 run. `pnpm capacity`, `pnpm plan 250000 50`,
`pnpm check:tests` and a `count()` read settle all of them. **Re-run them on the day you paste**:
capacity and the plan figure both changed by more than 2x between 11 and 15 August with no code
change, and a stale number in a submission is the one thing here a judge can falsify in a minute.

**On the contract count, which is easy to state wrongly.** Fourteen are ours and verified, but
that is **seven on mainnet plus seven on testnet**, not fourteen on mainnet. The eighth address in
the mainnet deployment is USDG, the issuer's stablecoin: not ours, and Sourcify holds nothing for
it. An earlier draft put "14 contracts are verified" inside the paragraph that opens *"It runs on X
Layer mainnet"*, which reads as fourteen on mainnet and is an overclaim by placement rather than by
arithmetic. The sentence now claims completeness instead of a count, which is both accurate and the
stronger thing to say. Re-checked 2026-08-14 against the Sourcify **v2** API, contract by contract:
all seven mainnet are `exact_match`, and on testnet six are `exact_match` with TestUSDG at `match`,
which is a mock nobody trades.

---

## The X post, required, and the account must post it

`@reckonz_xyz` must publish a post mentioning `@XLayerOfficial` at submission time. Draft:

> Reckonz is live on @XLayerOfficial mainnet.
>
> Non-custodial execution and risk tooling for tokenised real-world assets: the xStocks equity
> tokens on X Layer.
>
> You write the thesis, and the conditions you would exit on. The AI compiles those into rules
> PolicyGuard enforces inside the trade's own transaction, not in a reminder afterwards.
>
> Ask it for $250k and it tells you $6,627 fits, then hands the rest back rather than force it into
> a market that cannot take it.
>
> 18 on-chain receipts, each with an evidence hash anyone can re-derive.
>
> reckonz.vercel.app
>
> #AISeason #XLayer

Keep the thread short. The description does the work; the post exists to satisfy the requirement
and to be readable by someone scrolling.
