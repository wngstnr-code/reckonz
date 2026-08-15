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

Each block below is **one complete prompt**. Copy it, generate, post. Nothing to assemble and
nothing to overlay afterwards.

Only Day 1 and Day 2 carry text, because only those two are about a specific figure. The other five
compositions say what they mean without a single letter, which is also why they cannot render a
number wrongly.

**On the two that do carry text:** image models still misspell digits. Read the number in the
result before posting, character by character, against the table at the bottom of this file. If it
is wrong, regenerate rather than post it. A picture reading $97,3Z9 under a post asserting $97,329
undoes the one claim every thread here makes.

### Day 1, the market doubled

```
Flat 2D vector infographic on a near-black #0b0d10 background. Two thin horizontal
bars with square ends, stacked with wide vertical spacing, both mint green #6ee7b7.
The upper bar is short. The lower bar is exactly twice its length. To the right of
the upper bar, the text "$48,000" in a clean monospace font, muted grey #5d6675.
To the right of the lower bar, the text "$97,329" in the same monospace font, larger,
in mint green #6ee7b7. Render both numbers exactly as written, with the dollar signs
and commas. No other text anywhere. Generous empty space around everything.
No drop shadows, no glow, no bloom, no gradient, no 3D, no perspective, no icons,
no arrows, no charts, no people, no robots. Minimal technical instrument aesthetic.
16:9.
```

### Day 2, $250,000 asked and $6,627 executed

```
Flat 2D vector infographic on a near-black #0b0d10 background. One large rectangle
occupying most of the frame, drawn as a thin unfilled outline in muted grey #5d6675,
with the text "$250,000" in clean monospace along its top edge in the same grey.
Inside the lower left corner of that rectangle sits a small solid mint green #6ee7b7
rectangle covering roughly three percent of the large rectangle's area, with the text
"$6,627" in monospace immediately beside it in mint green. Render both numbers exactly
as written, with dollar signs and commas. No other text anywhere. The contrast in area
between the two shapes is the subject. No drop shadows, no glow, no gradient, no 3D,
no icons, no arrows, no charts. Minimal technical instrument aesthetic. 16:9.
```

The three percent is the true ratio. Do not accept a result where the small rectangle merely looks
small; it should be almost uncomfortably tiny.

### Day 3, the week we lost

```
Flat 2D vector composition on a near-black #0b0d10 background. A dense, evenly spaced
grid of many small identical squares filling the frame, every square solid muted grey
#5d6675. Exactly one square, positioned slightly off centre, is drawn instead as a
hollow outline in amber #f0b429, identical in size and alignment to all the others so
the difference is only noticeable on a second look. Absolutely no text, letters or
numbers anywhere in the image. No drop shadows, no glow, no gradient, no 3D, no icons,
no people, no robots. Minimal technical instrument aesthetic. 16:9.
```

Something that looks correct and is not. The whole thread in one frame.

### Day 4, the fingerprint

```
Flat 2D vector composition on a near-black #0b0d10 background. Two identical narrow
vertical columns of small abstract rectangular blocks, side by side with a clear gap
between them, all blocks muted grey #5d6675. The blocks are plain rectangles, never
letters or characters. One single horizontal row across both columns is mint green
#6ee7b7 instead, and the two mint blocks align exactly with each other, joined by a
thin mint horizontal line spanning the gap. Absolutely no text, letters or numbers
anywhere. No drop shadows, no glow, no gradient, no 3D, no icons. Minimal technical
instrument aesthetic. 16:9.
```

Two things compared and found to match.

### Day 5, rules that can be measured

```
Flat 2D vector composition on a near-black #0b0d10 background. Two vertical columns of
short horizontal bars, evenly spaced, equal number of bars in each column, all bars the
same size. Every bar in the left column is solid mint green #6ee7b7. Every bar in the
right column is an unfilled outline drawn with a dashed amber #f0b429 stroke. Thin
#232830 vertical divider between the columns. Absolutely no text, letters or numbers
anywhere. No drop shadows, no glow, no gradient, no 3D, no icons, no arrows. Minimal
technical instrument aesthetic. 16:9.
```

Measurable on the left, handed back to you on the right. Nothing hidden, nothing faked.

### Day 6, the refusals

```
Flat 2D vector composition on a near-black #0b0d10 background. A vertical stack of nine
thin horizontal rows spanning most of the width, like rows in a ledger, each separated
by a hairline #232830 rule. Eight of the rows are filled amber #f0b429. Exactly one row
is filled mint green #6ee7b7, and it sits neither at the top nor at the bottom of the
stack. Absolutely no text, letters or numbers anywhere. No drop shadows, no glow, no
gradient, no 3D, no icons. Minimal technical instrument aesthetic. 16:9.
```

One executed, eight refused, and only the one pays us. Amber rather than red on purpose:
`09-design.md` reserves red for a run that actually broke, and painting refusals with trading-UI
semantics makes the most valuable thing the product does look like a failure.

### Day 7, the submission

```
Flat 2D vector composition on a near-black #0b0d10 background. Exactly eighteen small
solid mint green #6ee7b7 squares, all identical in size, arranged in an evenly spaced
grid of six columns and three rows, centred, with a wide empty margin all around. No
highlight, no variation, no numbering. Absolutely no text, letters or numbers anywhere.
No drop shadows, no glow, no gradient, no 3D, no icons. Minimal technical instrument
aesthetic. 16:9.
```

Eighteen marks for eighteen receipts. Countable, and the count is true.

**If the receipt count has moved by the 21st**, change the number of squares in the prompt to match
and keep the grid even. That is the only edit any of these prompts should ever need.

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
