# Design direction

Written 2026-08-11 as input for the FE owner, not as instruction. `app/` is Nabil's; this is the
brief he can disagree with. It exists so the argument happens once, in writing, instead of being
re-had per component.

There is no `brand.md`. The tokens in `app/globals.css` are the de facto brand and they are
already right — this document mostly explains *why* they are right and where the UI should go
next, so nobody "improves" them into something generic.

---

## The one decision that matters most

**In a trading UI, red means the price went down. In this one, red would mean the guard refused —
and a refusal is the product working.**

Reckonz exists to say no. It refuses assets it cannot price, sizes that the chain cannot absorb,
and fills that breach a mandate. A run where two of five legs are refused is not a bad run; it is
the run that justifies the whole system. If refusals are painted with trading-UI semantics, a
correct page reads as a disaster, and the most valuable thing the product does looks like it is
broken.

So the palette needs a distinction the trading convention does not have:

| State | Means | Treatment |
|---|---|---|
| **ALLOW** | the guard would permit this | `signal` — used sparingly, it is not the point |
| **REFUSED** | a verdict: gap risk, impact, no reference, slippage | `caution` + the reason **as words**, never a bare red badge |
| **FAILED** | the run itself broke — RPC, provider, timeout | `refuse` red, and only here |

`--color-refuse` should be rare. If a screenshot of a normal run is mostly red, the semantics are
wrong, not the run.

Two supporting rules:

- **Every refusal carries its reason inline.** `REJECT PRICE_IMPACT · 90bp impact > 50bp` is the
  product. `REJECT` alone is an error message.
- **Group refusals by reason and count them.** Twenty-two rows of red is an alarm; *"22 refused —
  20 price impact, 2 no reference"* is an accounting, and it is what a judge should remember.

---

## Brief

```
Direction: Workstation Dense, adapted — an instrument, not an app
Density:   compact where the evidence is, comfortable where the story is
Surface:   panels on near-black; borders do the separating, not shadows
Type mood: mono-first, small, tight, label-driven
Motion:    fast and functional; data settles, it does not perform
```

**Do**

- Keep monospace for every number, and `tabular-nums` so columns do not shimmer as they stream in.
- Right-align numerics, left-align text, never centre data.
- Let borders and background shade separate panels. Shadows at 4–8% or not at all.
- Uppercase micro-labels with `+0.05em` tracking for column heads and stage names — already in use,
  keep it.
- Vary radius by role: panels `xl`, chips `full`. That variation is deliberate; do not unify it.

**Don't**

- Don't add a second accent hue. Ground, three semantic colours, and grey is the whole palette.
  A fourth colour means one of the existing three lost its meaning.
- Don't put a chatbot in it. `00-hackathon.md` records that no previous winner was an "AI
  assistant", and this is tooling, not an assistant. Chat bubbles would contradict the positioning
  the contracts spent four days earning.
- Don't add a gradient hero, sparkle icons, or "Powered by AI" chrome. The AI is one stage of six.
- Don't animate the numbers. A price that counts up is a price you cannot read.
- Don't centre everything. Data-dense surfaces stay symmetric and gridded; the page does not need
  a marketing rhythm.

---

## The four surfaces

### 1. The streamed run — six stages

This is a build log, not a spinner. The shape to copy is a CI run: **each stage is a row, it shows
its own state and elapsed time, and it collapses to one line when it succeeds.**

- Stages are visible **before** they run, greyed, so the viewer knows how long the pipeline is.
  A demo where the shape is unknown is a demo the viewer cannot follow.
- Show elapsed time per stage. The run is slow for honest reasons — an LLM call, a throttled
  public RPC, 28 reference markets — and showing where the time goes turns latency into evidence
  of work rather than dead air.
- The interesting stage is `oracle`. It should expand by default; the rest collapse.
- Never a full-screen loader. Content that has arrived stays on screen while the rest streams.

*Trait references: CI run views, LLM trace viewers. Take the stage list and the per-step timing;
leave the log-tailing firehose.*

### 2. Refusals

Covered above, and it is the surface most likely to be got wrong by making it look tidy. The
verdict list should read like a risk report: asset, size asked, size executable, verdict, reason.

The single most persuasive number the product produces is the **refused notional** — *"$250,000
asked, $2,191 executable, $247,809 refused."* That belongs at the top of the plan stage, at
display size, before any table. It is the whole thesis in one line.

### 3. The 30-asset table

A table, not cards — cross-asset comparison is the entire point. Compact density here.

- Columns: asset, spot, basis, gap risk, capacity, verdict. Numbers right-aligned and mono.
- Gap risk is 0–100 and reads badly as a bare integer. A four-part micro-bar already exists in the
  CLI (`staleness / displacement / uncertainty / basis`) — that decomposition is worth keeping,
  because it shows the score is measured rather than asserted.
- Sort by verdict, then by refused notional. The refusals are the story.
- Mobile: priority columns plus horizontal scroll. Do not stack a comparison table into cards.

### 4. Provenance

Nineteen receipts on mainnet. Still small in number and large in meaning, so give them room.

- Each receipt links to the explorer and to Sourcify. The affordance is boring on purpose;
  "verified" is a claim someone should be able to check in one click.
- Receipt `#2` resolves to thesis `#0` published 47 seconds earlier. **Show the ordering**, because
  reasoning-predates-outcome is the claim, and a timestamp pair proves it more cheaply than a
  paragraph does.
- The 2-of-3 Safe belongs here too: who administers the oracle is provenance, not a footnote.

---

## Density, resolved

The skill's default is "comfortable, never force compact on first-time users" — and our first-time
users are judges with a few minutes. The resolution is not a compromise but a split:

- **Comfortable** where the story is told once: thesis input, stage list, the headline
  asked/executable/refused numbers.
- **Compact** where the evidence lives: the asset table, the trigger list, the receipts.

A viewer should be able to follow the narrative without reading a single table, and then find that
every claim in the narrative has a table under it.

---

## Anti-slop check on what exists today

Run against the detection list, 2026-08-11. **No strong signals.** For the record:

- Palette is custom and semantic, not default shadcn grey. ✅
- Radius varies by role. ✅
- Mono is a deliberate choice, not a default. ✅
- Type sizes are specific (11 / 12 / 13.5 / 15 / 21) rather than a scale applied uniformly. ✅
- One borderline: the header's `bg-gradient-to-b from-[#10141a] to-ground`. It is a near-black to
  near-black surface shade doing structural work, not a violet hero gradient. Keep it, but do not
  let it become a pattern — that is the direction the "AI gradient" smell arrives from.

The header's `◇` placeholder is the one thing that reads unfinished; `public/logo-reckonz.svg` is
committed and the ticket is `07-team.md § FE 4`.

---

## References, by problem

Named per problem this UI actually has, not per product worth admiring. Each entry says what to
take, because copying a product wholesale is how a tool ends up looking like something it isn't.

**Caveat: these are from recall, and interfaces change. Look before committing to one.**

### For the streamed six-stage run

| Reference | Take |
|---|---|
| Vercel build logs, GitHub Actions run view | Stages collapse to one line on success; the failed one opens itself. Per-stage duration is always visible. |
| Langfuse / LangSmith trace views | Per-step input, output, and latency for an LLM call — the shape the `compile` stage wants. |

Leave behind: the tailing log firehose. Our stages are six, named, and known in advance.

### For refusals that must read as a feature

| Reference | Take |
|---|---|
| Aave health factor | Position *relative to a limit*, not a boolean. "90bp against a 50bp limit" beats "REJECTED". |
| Chaos Labs / Gauntlet risk dashboards | Parameters, caps, and where you sit against them, presented as neutral information. |
| CoW Swap | Explaining *why* the price is what it is, instead of only showing it. |

Leave behind: their chrome. All three are protocol dashboards; we are one page with a verdict.

### For the 30-asset table

| Reference | Take |
|---|---|
| Hyperliquid | Density, mono numerics as first-class content, no ornament. |
| Dune | Number formatting and table hierarchy that doesn't shout. |

### For provenance

| Reference | Take |
|---|---|
| Safe{Wallet} | Transaction queue with a signature threshold — directly relevant now that the oracle admin is 2-of-3. |
| Sourcify, OKLink | The boring, credible "verified" affordance. Every receipt should click through to it. |

### Avoided on purpose

Chat-bubble agent UIs, gradient heroes, sparkle-AI iconography. This is strategy, not taste:
`00-hackathon.md` records that no previous winner was an "AI assistant", and a chatbot surface
argues against the positioning the contracts spent four days earning.

---

## What this is not

Not a component spec, and not permission to spend the remaining days on polish. Ranked against
the deadline, **wallet connect beats every item above** — it changes the demo from *this system
computes* to *this system executes, and you press the button*. A beautiful read-only page is still
a read-only page.

---

# Addendum — the console rebuild

Added 2026-08-16 by FE, which is the side this document was written *for*. Everything above still
holds; nothing in it is revised. What follows are the decisions the brief deliberately left open —
information architecture and table anatomy — now settled, so the argument does not get re-had per
page.

## The direction, in one line

> **Product structure from Ondo. Table anatomy from Morpho. Palette and semantics stay Reckonz.**

Both references were opened and read on 2026-08-16 rather than recalled, which matters: this
document's own reference section warns that interfaces change, and Morpho had in fact already
moved to a dark surface.

## What the pages are

`(console)` is a Next route group, so none of this appears in a URL. The marketing surface keeps
`/`; the tool lives beside it and the old page stays reachable until the rebuild replaces it.

| Route | Nav | Holds |
|---|---|---|
| `/assets` | Assets | The way in. Verdict ribbon over the thirty-asset board |
| `/assets/<symbol>` | — | One asset: identity, reference, gap risk decomposed, depth, receipts |
| `/idea` | Idea | The six-stage streamed run |
| `/receipts` | Receipts | Track record joined from both registries |
| `/trade` | Trade | Everything that needs a wallet |
| `/preview` | — | Component states that cannot be summoned by waiting. `notFound()` outside `next dev` |

Four nav entries, not five: `/assets` **is** the asset table, and a single asset opens from a row
in it — which is also why the board owns that path rather than a separate `/verdict`, so a single
asset is its child rather than a second address for the same subject. Trade sits last because the
audience arrives without a wallet, and a nav that opens with it tells them they are in the wrong
place.

The words are one each, and everyday ones where they exist: `Receipts` rather than `Theses`,
because everybody already knows what a receipt is and the page is literally a list of them.
`Verdict` keeps its home as a column heading on the board, which is where it does real work.

## Taken from Ondo — structure

- **Named destinations instead of one long page.** The single most useful thing in that app, and
  the direct fix for eleven stacked cards.
- **A per-asset page that is a real destination**, with a stable URL. This document and
  `03-architecture.md` have both asked for one — "a per-asset page showing which reference is used
  and how well it has tracked" — and it has never had anywhere to live.
- **The identity block.** Ondo prints `Shares Per Token: 1 NVDAon = 1.0009 NVDA` in plain text. We
  compute exactly that multiplier and currently show it nowhere.
- **A limits table, stated without embarrassment.** Ondo publishes a max trade size per session
  ($1.2M–$3M). That is the same idea as `capacity`, and ours will read ~$2k per pool. The gap is
  the argument, not a weakness: they can quote millions because they mint on demand, and on
  X Layer nobody mints — there is only the pool, and we are the only ones measuring it.
- **A protections panel.** Theirs is attestation PDFs on Dropbox. Ours is the same slot with
  stronger contents: fourteen contracts verified on Sourcify, a 2-of-3 Safe, an append-only
  registry, an evidence hash anyone can re-derive.

## Taken from Morpho — table anatomy

Read from `/vaults` on 2026-08-16:

- **Page header = title, one sentence, one aggregate number.** Morpho leads with Total Deposits
  at $12.4B.
- **A control row above the table**: filters, a sort dropdown, free-text filter, a column chooser,
  full-screen.
- **Per-column sort affordances**, not a single global sort.
- **Two-line cells** — the primary value with its context dimmed underneath (`587.27M USDC` over
  `$586.96M`). This is the pattern that lets a dense table stay readable, and it is what our
  `fair value` over `± band`, and `capacity` over `at 0.5% impact`, should use.
- **A compact composition column.** Morpho renders collateral exposure as a row of avatars. Ours
  is the four-part gap-risk micro-bar — the decomposition already in the CLI, which is what shows
  the score is measured rather than asserted.
- **The whole row is a link** to the detail page.
- **A "How it works" button beside the heading.** We need one more than they do: gap risk and
  capacity are ours to explain, and nobody arrives knowing them.

## Where the references disagree with us — resolved, not copied

Three places where following the reference would cost us the pitch.

**1. The aggregate number is not a growth metric.** Morpho's headline is Total Deposits, because
more deposits is their good outcome. Ours cannot be volume or TVL: `02-product.md` records that
AUM is dead here at any capacity yet measured, and a headline promising scale would be arguing for
a business this repo has already disproven. **The aggregate is the refused notional**, with total
absorbable capacity beside it, both dated.

**2. Ondo's home sorts by what is most appealing to buy** — Top Gainers, Trending, 24H green and
red. Ours sorts by verdict, then by refused notional. Same slot, opposite question: theirs asks
*which one do you want*, ours asks *which of these can be defended right now*. Carrying over
trading-UI green/red would also break the palette rule at the top of this document, where red
means the system is broken and a refusal is the product working.

**3. No company logos in the table.** Both references lean on them, and for a shopping surface
they are right — a logo is faster to scan than a word. Thirty rows of `wNVDAx` in mono is
slower to scan and reads as an instrument rather than a storefront, which is the trade this
project should take every time. Revisit only if the table proves genuinely hard to scan in use.

## The ground moved to true black

Changed 2026-08-17. This document opens by saying the tokens in `app/globals.css` are the de facto
brand and warning against improving them into something generic, so a change to them owes a
reason.

The reason is that the app was the only Reckonz surface **not** on the brand's own background.
`public/logo-reckonz-black.svg` is mint on `#000000`, every post image is mint on `#000000`, and
`11-social.md` says "pure black" eight times and names `#6ee7b7` ten. The page sat on `#0b0d10`
while everything published beside it sat on black.

Nothing else moved. `#6ee7b7` was already exactly the brand mint and `#8b95a4` already exactly the
brand grey, so **no colour was picked and none was replaced.** The surface ladder shifted down one
step and every gap between steps is unchanged:

```
ground   #0b0d10 → #000000
panel    #12151a → #0b0d10     (itself a brand colour, baked into logo-reckonz.png)
raised   #171b21 → #12151a
line     #232830 → unchanged   — reads a little stronger on black, which it needed
edge     #2b323d → unchanged
```

Two things deliberately not done. `ink` stays `#e6e9ee` rather than going to `#ffffff`: pure white
on pure black is harsh at body sizes, and the brand assets use white only for display type. And
form fields now take `var(--color-ground)` instead of a hard-coded `#0c0f13`, so a field reads as a
hole cut through the panel rather than as a fourth surface that drifts the next time the ladder
moves.

### Superseded the same day: light is the default, dark is a swap

Later on 2026-08-17, the design owner's call. Both palettes now live in `globals.css` under the
same eleven token names, so no component knows which theme it is in and none of them carries a
`dark:` variant. Light is the default; `data-theme="dark"` on `<html>` restores every value in the
block above, and a toggle is planned.

The section above is left standing rather than deleted, because the reasoning in it is what makes
dark mode *correct* rather than optional: the brand publishes mint on pure black, and that is the
theme those assets belong to.

What did not carry over is the part worth writing down. **The three semantic colours cannot be
shared across themes.** `#6ee7b7` on white is roughly 1.6:1 and `#f0b429` about 1.9:1, so both are
unreadable as text there. The hue is held and the value drops: `#0d9668`, `#9a6400`, `#c2352a`.
`--color-faint` is the one that needed nothing — `#8b95a4` is the brand grey from
`logo-reckonz-grey.svg` and sits legibly on both grounds.

### One family, and what `font-mono` means now

Also 2026-08-17. Monospace is gone; **Outfit** is the only face, self-hosted through `next/font`.

The brief above asks for monospace on every number, and the reason it gives is the real one:
columns of figures have to line up or they cannot be compared down the page, and the assets board
is thirty rows of exactly that. The replacement is `font-variant-numeric: tabular-nums`, applied in
the base layer to the `.font-mono` class — so every existing call site keeps working and the class
now means *this is measured data* rather than *this is monospaced*.

**Unverified, and it must be checked against the real table:** tabular figures are a font feature a
face either ships or does not. If Outfit lacks them, the columns will shimmer and the answer is one
monospaced family scoped to the table, not a return to mono everywhere.

## Type scale

The sizes are unchanged — 10.5 / 11 / 12.5 / 13.5 / 15 / 21, which this document records as a
property worth keeping. They are now *named* in `app/globals.css` (`text-micro`, `text-meta`,
`text-data`, `text-body`, `text-lead`, `text-title`) so a component reaches for a step instead of
retyping `text-[11px]` and drifting half a pixel at a time. One addition, `text-display` at 34px,
exists for exactly one job: the refused notional, which the brief above already puts at display
size.

## Note on ownership

`docs/` is BE's by `07-team.md`. This addendum was written by FE because the document is
explicitly addressed to FE — "the brief he can disagree with" — and a design decision recorded
nowhere is a design decision that gets re-argued. Nothing above the addendum line was altered.
