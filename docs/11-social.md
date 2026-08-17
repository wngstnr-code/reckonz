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

**Tagging `@XLayerOfficial`: two days, not seven.** Only the submission post is required to
mention them, but the judges *are* X Layer and a mention is the only thing that actually notifies
them. Hashtags are close to useless for reach now, so the mention is the mechanism and `#AISeason`
stays on Day 7 alone.

| Day | Tagged | Why |
|---|---|---|
| 1 | yes, in the opening post | the post is about the depth of their market and OKX's own order book deepening it |
| 7 | yes, required | the submission post |
| 2, 3, 4, 5, 6 | no | these are about our product, not about X Layer, and tagging them anyway reads as farming |

Day 3 carried a mention until 17 Aug, when its subject changed from a trap we were handing to other
X Layer builders to how our own custody works. The rationale went with the subject.

## How these are written

**For a general reader, not for engineers.** Nobody scrolling X wants a contract address. The
numbers stay because numbers are the most readable part of this project; the machinery behind them
does not. No command names, no contract names, no jargon that needs a footnote. If a sentence needs
the reader to know what an AMM is, rewrite it.

**No post depends on the repo.** Day 3 used to close by sending builders there for the detail it
left out. Nothing does now: each thread carries everything it claims.

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

**The two figures are deliberately asymmetric.** "About $48,000" is approximate because that is all
we ever wrote down: the 11 August measurement was only ever recorded as ~$48k, and no exact value
for it exists anywhere in the repo. "$97,329" is exact because we measured it. Do not round the
second one to match the first. $97,000 reads as an estimate, $97,329 reads as a measurement, and
the whole post is about the difference between those two things. The image must carry the same
figure as the caption.

> Four days ago, the entire market for tokenised stocks on @XLayerOfficial could absorb about
> $48,000 before the price started running away from you.
>
> We measured again today. $97,329.
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

**All four figures re-measured 2026-08-16 and all four had moved in a day.** They were $6,627,
$243,373, $55,148 and $33 on the 15th. One leg did it: wNVDAx capacity went 1,222 to 14,928 USDG,
about 12x, while the other four moved by single digits. Depth on one name, not a market-wide shift.

**Take all four from one `pnpm plan 250000` run.** `pnpm thesis` reads a slightly different basket
(28/28/16/18/10 against 25/25/20/20/10) and the pools move between runs, so it returned $18,941 for
the same question minutes apart. Both are honest; mixing them is not.

> Say you want to put $250,000 behind a view on memory chips.
>
> Most tools would just do it, and the cost of moving a market that small would come out of your
> money without anyone showing you the number.

> Ours executes $20,361 and tells you the other $229,639 does not fit.
>
> Doing the whole $250,000 in one shot would have cost $51,348 in price impact. The part that fits
> cost $102.

The second line says **the whole $250,000 in one shot**, not "pushing the rest through". The naive
figure prices the entire basket at once; the remainder alone would cost more than that, since it is
the part that runs furthest up the curve. The draft said "the rest" until 16 Aug. A post whose
subject is being straight about a number cannot misread its own.

> You write the idea in plain English. The AI turns it into a specific, checkable claim, works out
> which stocks are actually tradable on X Layer, and sizes each one to what the market can really
> absorb.
>
> Your money never leaves your wallet. reckonz.xyz

## Day 3, 17 Aug: the key we do not have

The obvious objection to an AI that trades for you, answered with a mechanism rather than a
promise. **Nothing here points at the repo**, because the thread has to stand on its own.

Two things to keep exact. The permission really is scoped to one token, capped in amount and
expires in **20 minutes**, so do not round that to "a few minutes" or stretch it to an hour. And
the function that would have let us move a position without the owner signing was **only ever in
our own notes and never in the code**: the post says it was taken out of the notes, not out of the
product.

> The question people should ask an AI that trades for them: what stops it taking your money?
>
> Ours cannot. Not because we promise it. Because it never holds anything it could take.

> Your money stays in your wallet. To move any of it, our system needs a permission you sign
> yourself: one stock, a maximum amount, and it stops working 20 minutes later.
>
> With no fresh signature from you, the AI moves nothing at all.

> There is no button on our side that rebalances your position.
>
> That function sat in our own design notes for weeks while we built. It was never written. We
> deleted it from the notes rather than adding it to the product.

> And the limits you set are enforced inside the trade itself. Too much price impact, or a price we
> cannot defend, and the whole thing reverses in the same instant it was attempted.
>
> Not a warning afterwards. It simply does not happen.
>
> reckonz.xyz

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

> Ask it for $250k and it tells you $20,361 fits, then hands the rest back rather than force it
> into a market that cannot take it.

**Re-measure this one on the 21st before posting.** It is the same figure as Day 2 and it changed
by 3x between the 15th and the 16th. Five days out, treat the number above as a placeholder.

> 18 trades on mainnet, each one auditable by anyone. Every contract published and verified. 322
> tests on every change.
>
> reckonz.xyz
>
> #AISeason #XLayer

## Images, one per thread

### The house style, taken from @XLayerOfficial

Read off their timeline on 2026-08-15. Their posts share a strict system: pure black ground, fully
greyscale artwork, a header bar with their mark at the left and an uppercase letterspaced monospace
label at the right, a signature dithered ASCII-like diagonal texture, an enormous ghosted display
word sitting behind everything at very low contrast, and a tiny uppercase footnote at the base.

**We take all of that furniture and keep mint green #6ee7b7 for the data element only.** Copying
them completely would make the account look like an X Layer sub-brand with no identity of its own.
Keeping the structure means the images read as native to that timeline, and reserving the single
colour for the fact means the only thing in the frame with any colour in it is always the number.
That is `09-design.md`'s own rule: ground, one accent, grey.

### The mark

`public/logo-reckonz.svg` is four evenly spaced vertical tally strokes, **all four ending flat on
the same baseline**, with a diagonal rising from behind the fourth to form a tick. Counting, then
confirming. The tick is not a bend in the fourth stroke and there is no point at the elbow: the
bars bottom out level with each other, and the diagonal comes out from behind. Every prompt says it
in those words, and placing it identically in every image is what makes seven separate posts read
as one account. If a render gets it wrong, paste the real SVG over that corner rather than
regenerating.

### On text

These prompts carry more text than the last set, because the header label and the ghosted word are
what make the style read. Keep every string short, and **check each one character by character
before posting**. The ghosted word is the safe one: it is deliberately near-invisible, so a garbled
letter reads as texture. The header label and the figures are not safe. Regenerate rather than post
a mismatch.

### Day 1, the market doubled

```
Editorial infographic poster, pure black #000000 background, entirely greyscale except
for one accent colour. 16:9.

Across the top edge: a slim header bar. At its far left, the Reckonz mark, four evenly
spaced vertical bars of equal thickness in white, all four ending flat on the same
baseline, with a diagonal stroke rising to the upper right from behind the fourth bar to
form a tick. The bars are level at the bottom with no point or spike at the elbow. A thin
white hairline rule runs
from beside the mark to the right edge. At the far right of that rule, the text "CAPACITY"
in small uppercase monospace with wide letter spacing, white.

Filling the middle of the frame, an enormous ghosted display word "DEPTH" in heavy
condensed sans-serif, rendered entirely as a fine dithered ASCII halftone texture in dark
grey, barely emerging from the black, treated as texture rather than as a headline. Fine
diagonal streaks of the same dithered pixel texture drift across the upper right of the
frame like a degraded scan.

In front of all that, the only colour in the image: two horizontal bars with square ends,
flat mint green #6ee7b7, stacked with wide vertical separation, left edges aligned. The
upper bar is short. The lower bar is exactly 2.03 times the length of the upper bar,
measured precisely, not merely noticeably longer. Beside the upper bar the
text "$48,000" in white monospace; beside the lower bar the text "$97,329" in mint green
monospace, larger. Reproduce both strings exactly.

Along the bottom edge, very small uppercase monospace in dark grey: "MEASURED ON X LAYER
MAINNET, 15 AUG 2026".

No other text. No drop shadows, no glow, no lens flare, no 3D render, no perspective, no
icons, no arrows, no candlestick charts, no people, no robots.
```

### Day 2, $250,000 asked and $20,361 executed

```
Editorial infographic poster, pure black #000000 background, entirely greyscale except for
one accent colour. 16:9.

Across the top edge: a slim header bar. At its far left, the Reckonz mark, four evenly
spaced vertical bars of equal thickness in white, all four ending flat on the same
baseline, with a diagonal stroke rising to the upper right from behind the fourth bar to
form a tick. The bars are level at the bottom with no point or spike at the elbow. A thin
white hairline rule runs
to the right edge, and at the far right of it the text "SIZING" in small uppercase
monospace with wide letter spacing, white.

Behind everything, an enormous ghosted display word "FITS" in heavy condensed sans-serif,
rendered as a fine dithered ASCII halftone texture in dark grey, barely emerging from the
black. Diagonal dithered streaks drift across the lower left.

Foreground: one large rectangle occupying most of the frame, drawn as a thin unfilled white
outline with sharp corners, and the text "$250,000" in white monospace along its top edge.
Inside its lower left corner, a small solid mint green #6ee7b7 rectangle covering roughly
eight percent of the outlined area, clearly a small minority of it, with the text "$20,361"
in mint green monospace immediately beside it. Reproduce both strings exactly. The vast
empty interior of the outline is the subject and stays empty.

Along the bottom edge, very small uppercase monospace in dark grey: "THE REST IS REFUSED,
WITH THE NUMBER".

No other text. No drop shadows, no glow, no 3D, no perspective, no icons, no arrows.
```

### Day 3, the key we do not have

```
Editorial infographic poster, pure black #000000 background, entirely greyscale except for
one accent colour. 16:9.

Across the top edge: a slim header bar. At its far left, the Reckonz mark, four evenly
spaced vertical bars of equal thickness in white, all four ending flat on the same
baseline, with a diagonal stroke rising to the upper right from behind the fourth bar to
form a tick. The bars are level at the bottom with no point or spike at the elbow. A thin
white hairline rule runs
to the right edge, with the text "CUSTODY" in small uppercase monospace with wide letter
spacing at its far right, white.

Behind everything, an enormous ghosted display word "SIGNED" in heavy condensed sans-serif
as a fine dithered ASCII halftone texture in dark grey, barely visible against the black.

Foreground: a single long horizontal rule running nearly the full width of the frame at
mid height, drawn as a thin flat mid grey line with a small vertical tick at each end. One
short segment of that line, roughly one twentieth of its length and set left of centre, is
instead solid mint green #6ee7b7 and slightly thicker, with the text "20 MIN" in mint green
monospace directly above it. The overwhelming length of grey line on either side is the
subject and stays completely empty.

Along the bottom edge, very small uppercase monospace in dark grey: "ONE STOCK, ONE AMOUNT,
THEN IT IS GONE".

No other text. No drop shadows, no glow, no 3D, no perspective, no icons, no keys, no locks.
```

### Day 4, the fingerprint

```
Editorial infographic poster, pure black #000000 background, entirely greyscale except for
one accent colour. 16:9.

Across the top edge: a slim header bar. At its far left, the Reckonz mark, four evenly
spaced vertical bars of equal thickness in white, all four ending flat on the same
baseline, with a diagonal stroke rising to the upper right from behind the fourth bar to
form a tick. The bars are level at the bottom with no point or spike at the elbow. A thin white hairline rule to
the right edge, with "EVIDENCE" in small uppercase monospace with wide letter spacing at
its far right, white.

Behind everything, an enormous ghosted display word "PROOF" in heavy condensed sans-serif
as a fine dithered ASCII halftone texture in dark grey, barely emerging from the black.

Foreground: two identical narrow vertical columns of small abstract rectangular blocks of
varying widths, side by side with a clear vertical gap between them, all blocks mid grey,
plain rectangles that never resemble letters. The two columns are exact mirrors of each
other in rhythm. One single horizontal row, about two thirds down, is mint green #6ee7b7
in both columns, aligning precisely across the gap, joined by a thin mint green line
spanning it.

Along the bottom edge, very small uppercase monospace in dark grey: "HASHED BEFORE
SIGNING".

No other text. No drop shadows, no glow, no 3D, no perspective, no icons.
```

### Day 5, rules that can be measured

```
Editorial infographic poster, pure black #000000 background, entirely greyscale except for
one accent colour. 16:9.

Across the top edge: a slim header bar. At its far left, the Reckonz mark, four evenly
spaced vertical bars of equal thickness in white, all four ending flat on the same
baseline, with a diagonal stroke rising to the upper right from behind the fourth bar to
form a tick. The bars are level at the bottom with no point or spike at the elbow. A thin white hairline rule to
the right edge, with "RULES" in small uppercase monospace with wide letter spacing at its
far right, white.

Behind everything, an enormous ghosted display word "MEASURE" in heavy condensed
sans-serif as a fine dithered ASCII halftone texture in dark grey, barely visible.

Foreground: two vertical columns of short horizontal bars, evenly spaced, seven bars in
each column, every bar the same length and thickness, the columns aligned row for row.
Every bar in the left column is solid flat mint green #6ee7b7. Every bar in the right
column is an unfilled outline drawn with a dashed white stroke, identical dimensions. A
single thin white hairline rule runs vertically between the two columns.

Along the bottom edge, very small uppercase monospace in dark grey: "IF THE CHAIN CANNOT
MEASURE IT, IT IS NOT A RULE".

No other text. No drop shadows, no glow, no 3D, no perspective, no icons, no arrows.
```

### Day 6, the refusals

```
Editorial infographic poster, pure black #000000 background, entirely greyscale except for
one accent colour. 16:9.

Across the top edge: a slim header bar. At its far left, the Reckonz mark, four evenly
spaced vertical bars of equal thickness in white, all four ending flat on the same
baseline, with a diagonal stroke rising to the upper right from behind the fourth bar to
form a tick. The bars are level at the bottom with no point or spike at the elbow. A thin white hairline rule to
the right edge, with "REFUSALS" in small uppercase monospace with wide letter spacing at
its far right, white.

Behind everything, an enormous ghosted display word "NO" in heavy condensed sans-serif as
a fine dithered ASCII halftone texture in dark grey, barely emerging from the black,
occupying most of the frame width.

Foreground: a vertical stack of nine thin horizontal rows, like rows in a ledger, spanning
most of the frame width, separated by white hairline rules, equal in height and evenly
spaced. Eight of the rows are filled mid grey. Exactly one row, fourth from the top, is
filled mint green #6ee7b7.

Along the bottom edge, very small uppercase monospace in dark grey: "ONE EXECUTED. ONLY
THAT ONE PAYS US".

No other text. No red anywhere in the image. No drop shadows, no glow, no 3D, no
perspective, no icons.
```

Grey rather than red for the refused rows. `09-design.md` reserves red for a run that actually
broke, and painting refusals with trading-UI semantics makes the most valuable thing this product
does look like a failure.

### Day 7, the submission

```
Editorial infographic poster, pure black #000000 background, entirely greyscale except for
one accent colour. 16:9.

Across the top edge: a slim header bar. At its far left, the Reckonz mark, four evenly
spaced vertical bars of equal thickness in white, all four ending flat on the same
baseline, with a diagonal stroke rising to the upper right from behind the fourth bar to
form a tick. The bars are level at the bottom with no point or spike at the elbow. A thin white hairline rule to
the right edge, with "LIVE ON MAINNET" in small uppercase monospace with wide letter
spacing at its far right, white.

Behind everything, an enormous ghosted display word "LIVE" in heavy condensed sans-serif
as a fine dithered ASCII halftone texture in dark grey, barely visible against the black.
Fine diagonal dithered streaks drift across the upper right.

Foreground: exactly eighteen small solid mint green #6ee7b7 squares, all identical in
size, arranged in a precisely even grid of six columns and three rows, centred, with equal
generous gutters and a wide empty margin. No highlight, no variation, no connecting lines.
Each square clearly separated so all eighteen can be counted at a glance.

Along the bottom edge, very small uppercase monospace in dark grey: "EIGHTEEN RECEIPTS.
COUNT THEM".

No other text. No drop shadows, no glow, no 3D, no perspective, no icons, no people.
```

**If the receipt count has moved by the 21st**, change the number of squares, the grid and the
footnote to match. That is the only edit any of these prompts should ever need.

## The profile banner

1500 x 500. Two things eat into it and both are unavoidable, so the composition has to be built
around them: the **avatar covers the bottom left** and the **Follow button covers the bottom
right**. Everything that must be read lives in the upper centre band. Mobile also crops the sides,
so nothing important goes near the left or right edge.

Same house style as the post images: X Layer's black-and-greyscale system, with mint green #6ee7b7
reserved for one element only.

```
Wide banner image, 1500 x 500 pixels, 3:1 aspect ratio. Pure black #000000 background,
entirely greyscale except for one accent colour.

Composition is a wide horizontal band. The bottom left corner and the bottom right corner
must be completely empty black, with nothing in them, because they will be covered.
Everything of interest sits in the upper centre of the frame, away from the left and right
edges.

Filling the full width behind everything, an enormous ghosted display word "RECKONZ" in
heavy condensed sans-serif, rendered entirely as a fine dithered ASCII halftone texture in
very dark grey, barely emerging from the black, treated as texture rather than as a
headline. Fine diagonal streaks of the same dithered pixel texture drift across the upper
right of the frame like a degraded scan, fading out toward the centre.

Centred in the upper middle of the frame, on one line, the text "YOU CANNOT, AND HERE IS
THE NUMBER" in clean uppercase monospace with wide letter spacing, white, small relative
to the frame. Reproduce that string exactly. Directly beneath it, a single thin horizontal
mint green #6ee7b7 hairline rule, about a third of the frame width, centred. This rule is
the only colour anywhere in the image.

Along the very top edge, a full width white hairline rule, extremely thin.

No other text. No logo, no mark, no wordmark rendered as solid letters. No drop shadows,
no glow, no bloom, no lens flare, no gradient mesh, no 3D render, no perspective, no icons,
no arrows, no charts, no people, no robots, no circuit boards.
```

**The line is the one thing worth swapping.** "YOU CANNOT, AND HERE IS THE NUMBER" is the product's
own sentence from `10-submission.md` and it is the most distinctive thing the account can say. If it
reads as too cryptic standing alone, "SIZED TO WHAT THE MARKET CAN ACTUALLY TAKE" is the plain
version. Do not use both.

**No mark in the banner.** The avatar already carries it and sits directly on top of the bottom
left, so a second one competes with it at a distance of about forty pixels. Check the rendered text
character by character before uploading; a banner is seen far more often than any single post.

## Numbers to re-check on the morning you post

All of these have moved at least once. Capacity moved 2x in four days, and the sizing run moved 3x
in a single day. **Settle every one of them on the morning you post, not the night before:**

| Number | How to settle it |
|---|---|
| capacity, $97,329 at 0.5% | `TARGET=mainnet pnpm capacity` |
| the $250,000 run: $20,361 fits, $229,639 refused, $51,348 naive against $102 | `TARGET=mainnet pnpm plan 250000`, all four from this one run and not from `pnpm thesis` |
| 24h pool volume, $12.0M | GeckoTerminal, network `x-layer` |
| receipts, 18 | `count()` on `ReceiptRegistry` at `0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6` |
| tests, 106 + 216 = 322 | `pnpm check:tests` |

Posting a stale number is the one failure here that a judge can catch in under a minute, and it
would undo the exact thing these posts are claiming.
