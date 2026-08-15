# @reckonz_xyz

The account is a **submission requirement**, not marketing. The build-x-series page lists
"maintain an active X account throughout the project's lifetime" alongside the post that must
mention `@XLayerOfficial`. An account with three posts and a two-week gap fails a stated criterion
while the code passes every other one.

Seven days, 15 to 21 August 2026. One post a day, and the last one is the required submission post.

## The rule every draft below obeys

**Nothing goes out that a judge cannot re-run.** Every post carries a number, and every number has
a command or an address behind it. That is the product's own discipline applied to its account, and
it is also the only thing that makes a hackathon feed worth following: everyone else posts
screenshots of a UI.

Three specifics:

- **Dates on measurements.** Capacity moved 2x in four days (D84). A number without its date reads
  as a property of the market and will be wrong within a week.
- **No em-dashes**, same as `10-submission.md`. Plain punctuation is the house voice.
- **Never post what we have not done.** No roadmap as though it shipped, no "agents can use this"
  until one has. `06-assessment.md` is the standard.

## Day 1, 15 Aug: the market moved under us

Lead with the finding rather than the product. It is genuinely news, it is favourable to X Layer,
and it demonstrates measurement rather than claiming it.

> Four days ago the entire tokenised equity market on X Layer absorbed about $48,000 at 0.5% price
> impact.
>
> We re-measured today. $97,329.
>
> We deployed nothing in between.

> OKX's own order book settles these tickers on X Layer, so arbitrage flows between book and pool
> and keeps deepening it. The same 26 pools traded $12.0M in 24h.
>
> This is the number our sizing engine refuses trades against, so we re-run it rather than quote it.
>
> `pnpm capacity`

## Day 2, 16 Aug: what the product actually does

> Ask Reckonz for $250,000 of a semiconductor thesis.
>
> It executes $6,627 and hands back $243,373.
>
> Forcing the rest would have cost $55,148 in slippage. The part that fits cost $33.

> You write the thesis in plain language. The AI compiles it into a falsifiable claim, resolves the
> companies to tokens that actually exist on X Layer, and sizes each leg against live pool depth
> instead of against the number you asked for.
>
> Non-custodial the whole way. reckonz.vercel.app

## Day 3, 17 Aug: the X Layer thread

The one other builders will repost, and the one most likely to be seen by the people running the
event. All of it is in `CLAUDE.md` already because it cost us days.

> Four things about X Layer that cost us a week. Posting them so they cost you nothing.

> 1. The Uniswap V3 factory is not at the canonical address. It is at
> `0x4b2ab38dbf28d31d467aa8993f6c2585981d6804`.
>
> SDK defaults do not error. They resolve to an empty address and fail silently.

> 2. The Universal Router cannot swap here. It carries the canonical factory in its own bytecode,
> so every V3 swap through it reverts with no data.
>
> 39,001 bytes of deployed contract with the exact right selector, and it does not work. Derive the
> pool yourself.

> 3. The RPC load-balances, so a confirmed write is not immediately readable. A read straight after
> a write can hit an unsynced node and return zeroes rather than an error.
>
> Poll until the state is visible before sending anything that depends on it.

> 4. DexScreener does not index X Layer. GeckoTerminal does, as network `x-layer`.
>
> A deployed address with the right selector proves nothing. An external dependency is unverified
> until a call that does the actual work succeeds against it.

## Day 4, 18 Aug: evidence

> 18 fills on X Layer mainnet. Each one carries a hash of the exact quote, oracle reading and guard
> verdict the decision was made on.
>
> The hash goes on chain before anything is signed, not written up afterwards.

> The bundle is public, so anyone can fetch it and re-derive the hash the receipt already holds.
> A bundle that no longer hashes to the recorded value has been edited, and saying so is more useful
> than any amount of assurance that it has not.
>
> `pnpm evidence <hash>`

## Day 5, 19 Aug: the AI part, led by the constraint

"We use an LLM" is worth nothing in a field of LLM projects.

> Our AI does not choose trades. It writes rules.
>
> A schema, not a prompt, bounds what the model may emit. It can only name quantities the chain can
> measure.

> A condition nothing on chain can measure is surfaced to you as a manual watch item, rather than
> quietly becoming a rule that never fires. That silent failure is the one that would actually hurt
> someone.
>
> A red-team suite runs hostile and prompt-injected theses through that path on every commit.

## Day 6, 20 Aug: the refusal that costs us money

The strongest post of the week, because it is against interest. We are paid 15 bps on what
executes, so every refusal below earns us nothing.

> Our oracle marks a value unpublishable rather than guessing when the issuer will not quote.
>
> Our guard reverts inside the trade's own transaction when a bound breaks.
>
> We earn 15 bps on what executes. Every one of those refusals pays us nothing.

> There is a state where a sale cannot be measured at all: the oracle has gone stale, so the
> shortfall computes as zero. Zero and "nothing measured it" are not the same fact and we refuse to
> render them the same way.
>
> Selling in that state takes an explicit acknowledgement.

## Day 7, 21 Aug: the submission post, required

`@XLayerOfficial` must be mentioned. This is the one that satisfies the rule, so post it before the
deadline rather than at it. The draft lives in `10-submission.md` and is repeated here so the
account has one thread to schedule:

> Reckonz is live on @XLayerOfficial mainnet.
>
> Non-custodial execution and risk tooling for tokenised real-world assets: the xStocks equity
> tokens on X Layer.

> You write the thesis, and the conditions you would exit on. The AI compiles those into rules
> PolicyGuard enforces inside the trade's own transaction, not in a reminder afterwards.
>
> Ask it for $250k and it tells you $6,627 fits, then hands the rest back rather than force it into
> a market that cannot take it.

> 18 on-chain receipts, each with an evidence hash anyone can re-derive. Every contract verified on
> Sourcify. 106 Solidity and 216 TypeScript tests in CI.
>
> reckonz.vercel.app
>
> #AISeason #XLayer

## Numbers to re-check on the morning you post

All of these have moved at least once, and two of them moved 2x in four days:

| Number | How to settle it |
|---|---|
| capacity, $97,329 at 0.5% | `TARGET=mainnet pnpm capacity` |
| the $250,000 to $6,627 run | `TARGET=mainnet LLM_PROVIDER=fixture pnpm thesis` |
| 24h pool volume, $12.0M | GeckoTerminal, network `x-layer` |
| receipts, 18 | `count()` on `ReceiptRegistry` at `0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6` |
| tests, 106 + 216 | `pnpm check:tests` |

Posting a stale number is the one failure here that a judge can catch in under a minute, and it
would undo the exact thing these posts are claiming.
