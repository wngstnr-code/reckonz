# @reckonz_xyz

The account is a **submission requirement**, not marketing. The build-x-series page lists
"maintain an active X account throughout the project's lifetime" alongside the post that must
mention `@XLayerOfficial`. An account with three posts and a two-week gap fails a stated criterion
while the code passes every other one.

Seven days, 15 to 21 August 2026. One post a day, and the last one is the required submission post.

## Format: seven separate threads, not one running thread

Each day below is **its own thread**, posted fresh: one opening post, then two or three replies to
it from the same account. Every blockquote block is one post.

They are not chained day to day. A thread that keeps being extended only reaches people who already
saw the first post, whereas a new opening post gets distributed on its own. The requirement is an
*active account*, and seven separate days demonstrate that better than one thread being appended to
seven times. Each day also stands alone, so nothing needs reading in order.

The one link worth making is Day 7 quoting Day 1: the capacity re-measurement is the evidence for
the claim that we re-measure rather than quote.

Two mechanics:

- **Keep the site link out of the opening post**, and put it in the last reply. Common practice for
  reach, and it costs nothing to follow.
- **Every post is under 280 characters** as drafted. Check again after editing, because the whole
  point of a thread is lost when the last line silently truncates.

## How these are written

**For a general reader, not for engineers.** Nobody scrolling X wants a contract address. The
numbers stay because numbers are the most readable part of this project; the machinery behind them
does not. No command names, no contract names, no jargon that needs a footnote. If a sentence needs
the reader to know what an AMM is, rewrite it.

The exception is the developer detail in Day 3, which is deliberately pushed to the repo rather
than into the thread.

**Nothing goes out that cannot be checked.** Every post carries a number that is real and current.
That is the product's own discipline applied to its account.

Three specifics:

- **Dates on measurements.** Capacity moved 2x in four days. A number without its date reads as a
  property of the market and will be wrong within a week.
- **No em-dashes**, same as `10-submission.md`.
- **Never post what we have not done.** No roadmap written as though it shipped.

## Day 1, 15 Aug: the market moved under us

Opening with a finding rather than "introducing Reckonz". A new account that opens with an
advertisement reads as one. This one is real news and happens to flatter X Layer.

> Four days ago, the entire market for tokenised stocks on X Layer could absorb about $48,000
> before the price started running away from you.
>
> We measured again today. $97,000.
>
> Nobody launched anything in between. It just got deeper.

> The reason: OKX lets these stock tokens move freely between its own exchange and the chain.
> Traders close the gap between the two, and that flow leaves the on-chain market deeper than it
> was.
>
> $12 million changed hands in those pools in 24 hours.

> We re-measure this instead of quoting it, because the entire job is telling you what the market
> can take today. Not what it could take last week.

## Day 2, 16 Aug: what it actually does

> Say you want to put $250,000 behind a view on memory chips.
>
> Most tools would just do it, and the cost of moving a market that small would come out of your
> money without anyone showing you the number.

> Ours executes $6,627 and tells you the other $243,373 does not fit.
>
> Pushing the rest through would have cost $55,148 in price impact. The part that fits cost $33.

> You write the idea in plain English. The AI turns it into a specific, checkable claim, works out
> which stocks are actually tradable on X Layer, and sizes each one to what the market can really
> absorb.
>
> Your money never leaves your wallet. reckonz.vercel.app

## Day 3, 17 Aug: the week we lost

The developer version of this cost us days and is documented in the repo. The thread tells the
story instead, which travels further and sends the people who want the detail to the code.

> We lost a week to a piece of code that looked perfect.
>
> Right address. Right functions. Nearly 40,000 bytes of deployed contract. Every tool we used
> pointed at it.
>
> It could not do the one thing we needed.

> Buried inside it was an assumption copied from a different blockchain. On X Layer that assumption
> points at an address where nothing lives.
>
> So our trades did not fail loudly. They failed silently, with no error message at all.

> The rule we took from it, and now apply to everything:
>
> Something that exists and looks correct is not something that works. A dependency is unverified
> until you have watched it do the actual job, once, for real.

> If you are building on X Layer, the specific traps that cost us that week are written down in our
> repo. Take them, they are free.
>
> github.com/wngstnr-code/reckonz

## Day 4, 18 Aug: how you know we are not lying

> Every trade our system makes is recorded on the blockchain with a fingerprint of what it was
> looking at when it decided. The price it saw. The checks it ran. The verdict.
>
> That fingerprint is recorded before the trade is signed, not written up afterwards.

> Anyone can pull the file, recompute the fingerprint, and see whether it still matches.
>
> If somebody edited the reasoning after the fact, it stops matching, and everyone can see that it
> stopped matching.

> 18 real trades on mainnet so far. Every one of them auditable by a stranger, without asking us
> for anything.

## Day 5, 19 Aug: what the AI is for

"We use AI" is worth nothing in a field of AI projects. The constraint is the interesting part.

> Our AI does not pick trades.
>
> It reads your investment thesis and writes down the conditions that would tell you to get out.

> The failure mode with AI in finance is not a wrong answer. It is a confident rule nobody can
> actually check.
>
> "Exit if sentiment turns" sounds like a rule. Nothing can measure it, so it never fires, and you
> find out on the worst day.

> So ours is only allowed to write rules the blockchain can genuinely measure.
>
> Anything else is handed back to you as "you will have to watch this one yourself" instead of
> quietly becoming a rule that never triggers.

> We also attack it with hostile and manipulated inputs on every single code change, so a crafted
> thesis cannot talk it into a rule that does not hold.

## Day 6, 20 Aug: the refusals cost us money

The strongest post of the week, because it is against interest and cannot be faked by a project
that has not built it.

> We get paid when a trade goes through. 0.15% of it.
>
> Our system refuses trades constantly, and not one of those refusals pays us anything.

> It refuses when we cannot defend the price. If the source we price against goes quiet, we mark
> the value as "we do not know" rather than publishing a guess.
>
> Guessing would be easy, and profitable, and it is how people get hurt.

> There is even a case where we cannot measure how badly a sale went.
>
> We will not show you a comforting zero. It says the measurement failed, and you have to
> acknowledge that before anything continues.

## Day 7, 21 Aug: the submission post, required

`@XLayerOfficial` must be mentioned. Post it before the deadline rather than at it.

> Reckonz is live on @XLayerOfficial mainnet.
>
> It turns an investment thesis into real positions in tokenised stocks, sized to what the market
> can actually absorb, and into the rules that close them.

> You write the idea, and the conditions you would exit on. The AI turns those into rules a
> contract enforces inside the trade itself, not a reminder that arrives afterwards.

> Ask it for $250k and it tells you $6,627 fits, then hands the rest back rather than force it into
> a market that cannot take it.

> 18 trades on mainnet, each one auditable by anyone. Every contract published and verified. 322
> tests on every change.
>
> reckonz.vercel.app
>
> #AISeason #XLayer

## Images, one per thread

### Two rules before generating anything

**No generated text, ever.** Image models cannot spell numbers reliably, and a post claiming
$97,329 next to a picture reading $97,3Z9 destroys the one thing every thread here is asserting.
Every prompt below produces a **textless** composition with deliberate empty space. Set the real
numbers over it yourself afterwards, in a monospace face, using the palette below.

**For Day 1 and Day 2, consider a screenshot instead.** `pnpm capacity` and `pnpm thesis` already
print exactly the table the post is about, in the product's own voice. A real terminal readout beats
any illustration for this account, and it is evidence rather than decoration. Generate an image for
those two days only if the screenshot looks cramped at 16:9.

### The style block, append to every prompt

The palette is the product's, from `app/globals.css`, so the feed matches the app.

```
Flat 2D vector composition, dark technical instrument aesthetic. Background near-black
#0b0d10. Panel surfaces #12151a separated by thin 1px borders #232830. No drop shadows,
no glow, no bloom, no lens flare, no gradient mesh, no 3D render, no perspective.
Single accent colour mint green #6ee7b7, used sparingly. Amber #f0b429 only where
something is withheld or refused. Muted grey #5d6675 for anything inactive.
Sparse composition with generous empty space in the upper left for text to be added
later. No text, no letters, no numbers, no labels anywhere in the image.
No people, no robots, no brains, no glowing orbs, no circuit-board motifs, no upward
arrows, no candlestick charts. 16:9.
```

### Day 1, the market doubled

```
Two horizontal bars stacked with wide spacing on the near-black ground. The lower bar
is roughly twice the length of the upper one. Both are thin, flat, mint green #6ee7b7,
square ends. Nothing else in the frame. The whole left third is empty.
```

The image is the claim: same measurement, twice the length, four days apart.

### Day 2, $250,000 asked and $6,627 executed

```
One large rectangle drawn as a thin muted grey #5d6675 outline, occupying most of the
frame, unfilled. Inside its lower left corner sits a very small solid mint green
#6ee7b7 rectangle covering roughly three percent of the outlined area. The contrast in
area is the entire subject.
```

The proportion is literally accurate, which is why it works. Do not let it drift to something
that merely looks small.

### Day 3, the week we lost

```
A dense evenly spaced grid of small identical squares filling the frame, all in muted
grey #5d6675, all solid. Exactly one square, slightly off centre, is drawn as a hollow
outline in amber #f0b429 instead of being filled. Everything else is identical to it in
size and position, so the difference is only visible on a second look.
```

Something that looks right and is not. That is the whole thread in one frame.

### Day 4, the fingerprint

```
Two identical narrow vertical columns of small abstract glyph blocks, side by side with
a gap between them, in muted grey #5d6675. The blocks are pure rectangles, not letters.
A single horizontal row across both columns is mint green #6ee7b7, aligning exactly.
Thin connecting line between the two columns on that row only.
```

Two things being compared and found to match.

### Day 5, rules that can be measured

```
Two columns of short horizontal bars, evenly spaced. The left column bars are solid
mint green #6ee7b7. The right column bars are the same size but drawn as dashed amber
#f0b429 outlines, unfilled. Equal count, equal spacing, different treatment.
```

Measurable on the left, handed back to you on the right. Nothing is hidden and nothing is faked.

### Day 6, the refusals

```
A vertical stack of eight or nine thin horizontal rows, like rows in a ledger, on the
near-black ground with thin #232830 separators. Seven or eight rows are amber #f0b429.
Exactly one row is mint green #6ee7b7. The mint row is not at the top or bottom.
```

One executed, the rest refused, and only the one pays us. Amber rather than red on purpose: a
refusal is the product working, and `09-design.md` reserves red for a run that actually broke.

### Day 7, the submission

```
Eighteen small solid mint green #6ee7b7 squares arranged in an even grid, generously
spaced, on the near-black ground. All identical, all the same size, no highlight, no
variation. Wide empty margin around the grid.
```

Eighteen marks for eighteen receipts. Count them and the number is true, which is the point of the
account.

## Numbers to re-check on the morning you post

All of these have moved at least once, and two of them moved 2x in four days:

| Number | How to settle it |
|---|---|
| capacity, $97,329 at 0.5% | `TARGET=mainnet pnpm capacity` |
| the $250,000 to $6,627 run | `TARGET=mainnet LLM_PROVIDER=fixture pnpm thesis` |
| 24h pool volume, $12.0M | GeckoTerminal, network `x-layer` |
| receipts, 18 | `count()` on `ReceiptRegistry` at `0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6` |
| tests, 106 + 216 = 322 | `pnpm check:tests` |

Posting a stale number is the one failure here that a judge can catch in under a minute, and it
would undo the exact thing these posts are claiming.
