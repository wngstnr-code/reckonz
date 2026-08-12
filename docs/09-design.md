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

Sixteen receipts on mainnet. Still small in number and large in meaning, so give them room.

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
