# The demo video

Written 2026-08-20. Not a submission requirement: the Google Form has eight fields and none of
them is a video (`00-hackathon.md`, read 2026-08-14). It is worth making anyway, because the
description links out and a judge who watches ninety seconds of a real fill has seen something no
paragraph can assert.

Two rules that override anything below.

**No em-dashes.** Not in the narration, not in the on-screen text, not in the captions, not in the
video description. Same house voice as `docs/10-submission.md`.

**Nothing staged.** Every number on screen is measured the day it is recorded, every command runs
for real, and the one fill in the video settles on mainnet. If a run refuses something, keep it.
The product is the refusal, and a demo that only ever shows green is arguing against itself.

---

## The argument, before any shot list

The video makes one argument in four moves. Everything else is decoration and can be cut.

1. **There is a live tokenised-equity market on X Layer with no application layer on it.** Thirty
   xStocks trading as ERC-20s, and nothing above them that sizes, prices or refuses.
2. **We size against what the pools can actually absorb, and hand the rest back.** Ask for
   $250,000, get a few thousand, and the number you did not get is stated out loud.
3. **The refusal is enforced by a contract, in the trade's own transaction.** Not a warning
   afterwards. `PolicyGuard` reverts, and it bounds on market condition rather than only on
   destination and size.
4. **The chain is the evidence.** Receipts in an append-only registry, each carrying a hash of the
   exact quote, oracle reading and guard verdict, published before anything is signed, and
   re-derivable by anyone from the archived bundle.

### Say these

- Tokenised real world assets, in the first ten seconds. It is the only thing that puts this in
  the AI-RWA track (see the note at the top of `10-submission.md`).
- Non-custodial. Funds never leave the viewer's wallet, at any point.
- The capacity figure with its date, and with the previous reading beside it. The number moves in
  both directions and saying so is the demonstration.

### Do not say these

Three claims are dead and repeating them costs credibility with anyone who knows the space (D49):

- "Nobody publishes a fair value with uncertainty." Pyth does, with Nasdaq data behind it.
- "Bounded agent execution is novel." Giza has processed billions under it.
- "The market-hours gap is an industry problem." It is a condition of this venue.

Also do not say "AI trading agent", do not call it an assistant, and do not claim any agent uses
the API. None does yet.

---

## Format decisions

| Decision | Value | Why |
|---|---|---|
| Length | **2:45 to 3:10**, target 3:00 | Long enough for one real fill, short enough that a judge finishes it |
| Aspect | 16:9, 1920x1080, 60fps | Record at 2560x1440 and downscale, so the dense type stays crisp |
| Voice | One narrator, unscripted-sounding, no music bed under speech | The UI is an instrument, and a music bed reads as a product ad |
| Captions | Burned in, always on | Most judges watch muted the first time |
| Cursor | Visible, no click ripples, no keystroke overlay | The interface is dense enough |
| Speed | Real time, except where marked, with a visible speed badge | Honest about latency, see below |

**On speeding things up.** The pipeline is slow for real reasons: an LLM call, a throttled public
RPC, thirty reference markets. Three places in the cut run faster than life. Every one of them
carries a small badge in the corner that says what the multiplier is and how long it really took,
for example `4x, real time 38s`. Cutting latency out silently would be the one dishonest thing in
the video.

---

## Cuts to produce

| Cut | Length | Where it goes |
|---|---|---|
| **Main** | 3:00 | Linked from the site and from the submission description |
| **Short** | 0:60 | Posted from `@reckonz_xyz`, see `docs/11-social.md` |
| **Silent loop** | 0:20 | The refusal number and the capacity slider collapse, no voice, for the site hero |

The short is not the main cut trimmed. It is scenes 1, 4 and 6 recut with three sentences of
narration. Trimming the main cut leaves a video that starts mid-argument.

---

## Pre-flight, on the day of recording

Do all of this. The most likely way this video goes wrong is a stale oracle refusing the fill on
camera, and that is a twenty second check.

```bash
cd /Users/mac/Desktop/okxai
set -a && source .env && set +a
git status --short                      # clean tree; a dirty diff on camera is a question you do not want
pnpm typecheck && pnpm test             # expect clean, then 296 unit and 106 Foundry
curl -s https://reckonz.xyz/api/health | jq   # must not be `down`, see below
```

**`GET /api/health` is the gate.** If it answers `down`, nothing can execute and the fill scene
will fail on camera. `degraded` is usually fine and answers 200 by design, but read the body and
find out which asset is stale before you point the fill at it. This route is the operational truth
(D81), not the fact that the site loads.

Then refresh every number the video will state:

```bash
pnpm capacity                  # the universe figure, at 0.5%, and today's date
pnpm plan 250000               # the asked / placed / refused / avoided-impact set, all four from ONE run
pnpm check:tests               # the two test counts, checked against the docs
pnpm index                     # bring observations/registry.jsonl current before reading receipt counts
```

Take all four plan figures from a single `pnpm plan 250000`. `pnpm showcase` sizes a slightly
different basket and has answered a different number to the same question minutes apart. Both are
honest; a sentence mixing them is not.

Write the four numbers on a sticky note. They go into the narration, the lower thirds, and the
video description, and they must agree in all three places.

### Gas and funds

The fill scene spends real money. Budget:

- **0.5 USDG** for the buy, which is the size every previous real fill used.
- **Mainnet OKB** for gas on the deployer, plus a margin for a retry. Read the balance from the
  chain, never from `05-status.md`, which is stale the moment it is written.
- Nothing on the publisher. Do not run a publish for the video; the publisher's gas is the scarce
  resource and the worker needs it.

If USDG is short, record the fill scene against **testnet** and say so on screen. Testnet cannot
swap (the v3 factory has no code there), so what you can honestly record on 1952 is the mandate,
the triggers, and the breaker, not the fill. Prefer one real mainnet fill over three testnet
screens.

### The desktop

- New browser profile, no bookmarks bar, no extensions visible except the wallet.
- The wallet holds demo funds only. Never show a seed phrase, a private key, a `.env`, or the full
  `~/.zsh_history`. Pause before every terminal scene and check what is scrolled above the prompt.
- Do Not Disturb on. Notifications in frame mean a re-record.
- Terminal at a large font, dark, no username or hostname in the prompt if it carries anything
  personal.
- Browser at 1440 logical width. The console is dense by design and the tables need the room.

---

## Shot list and script

Two columns: what the viewer sees, and what the narrator says. Narration is written to be spoken,
not read. Around 140 words a minute, so roughly 420 words total. Read it out loud once before
recording; anything that trips you up is a sentence to rewrite, not to practise.

Bracketed notes are direction and are never spoken.

---

### Scene 1. Cold open, the refusal (0:00 to 0:14)

**Screen.** Start already inside `/idea` on a finished run, scrolled to the capacity stage, with
the refused-notional line at display size. Hold it still for two seconds before the first word.
No logo card, no title card, no intro animation.

**Narration.**

> This is a request for two hundred and fifty thousand dollars of an investment thesis, on X Layer.
> And this is the system telling the person who asked that only about seventeen hundred of it fits.
> The rest goes back to their wallet. That refusal is the whole product.

[Say the real placed figure from today's `pnpm plan 250000`, not seventeen hundred, if it has
moved. It will have moved.]

---

### Scene 2. What it is, and where (0:14 to 0:32)

**Screen.** Cut to `reckonz.xyz`, the landing hero, with the thirty ticker wall visible. Slow
scroll, one screen height, no faster.

**Narration.**

> Reckonz is execution and risk tooling for tokenised real world assets. The assets are xStocks:
> tokenised Apple, Nvidia, Tesla and twenty seven more, trading as ERC-20 tokens on X Layer.
> They are real, they are live, and there is almost nothing built on top of them. Your funds never
> leave your wallet, at any point in this video.

---

### Scene 3. The thesis goes in (0:32 to 1:08)

**Screen.** `/idea`. Type the thesis by hand, at normal speed, into the box. Use the one already
recorded in `observations/showcase.json` so the run is reproducible:

> Stablecoin settlement volume keeps compounding onchain, so the issuers and the exchanges that
> clear it capture more of the payments margin than the incumbent card networks do.

Press run. The six stages appear greyed before they run: compile, universe, allocate, triggers,
capacity, guard. Let compile and universe play at real speed. Speed-ramp the middle at 4x with the
badge on.

**Narration.**

> You write what you think, in plain words. No form, no tickers, no allocation.
> The model turns that into a falsifiable claim, and into the conditions you said would change
> your mind. Then six stages run, and you can watch each one.
> It resolves the companies to tokens that actually exist here, and when one does not, it says so
> instead of substituting something close.
> The conditions you named become triggers a contract enforces. The ones nothing on chain can
> measure are handed back to you as things to watch yourself, rather than quietly becoming a rule
> that can never fire.

---

### Scene 4. Capacity, and the number that is refused (1:08 to 1:32)

**Screen.** The capacity stage expanded. The refused-notional line first, then the per-leg table:
symbol, target weight, planned size, naive impact, planned impact, slices.

**Narration.**

> Here is where it stops being a demo. Every leg is sized against live Uniswap V3 depth, not
> against the amount that was asked for.
> Two legs fit. Together they take about seventeen hundred dollars. Two hundred and forty eight
> thousand goes back.
> And this is the cost of not doing that: pushing the whole amount through in one shot would have
> paid about a hundred and fifty three thousand dollars in price impact. The part that fits pays
> under eight.

[All four figures from the same run. Lower third repeats them in text, right-aligned, mono.]

---

### Scene 5. The board, and the collapse (1:32 to 1:56)

**Screen.** `/assets`. Table view. Then drag the size slider through its measured rungs: $25,
$1,000, $5,000, $10,000. Let the verdict column collapse from allowed to refused as it goes. Hold
one second at the last rung.

**Narration.**

> All thirty markets, with a price we can defend, how risky the overnight gap is, and how much each
> one can really take.
> The slider is not a model. Those are ten measured rungs of real depth. At twenty five dollars
> nearly every market with liquidity is fine. By five thousand, four are. Past ten thousand, one.
> That collapse is the thing nobody else on this chain is measuring, and it is why the whole
> product is built to say no.

---

### Scene 6. The fill, and the signature (1:56 to 2:28)

**Screen.** `/trade`. Connect the wallet. Show the mandate already live: one dollar per trade,
twelve fills per twenty four hours, four allowed assets. Then the fill card: quote, guard verdict,
Permit2 approval, the signature dialog, and the transaction. Cut the confirmation wait, badge it.
Land on the receipt with its explorer link.

**Narration.**

> Now the part that needs a wallet. The mandate is the blast radius, and it lives on chain: a cap
> per trade, a cap per day, and the assets it is allowed to touch.
> The server quotes, checks the guard, and hands back a plan that cannot do anything on its own.
> It only moves when you sign, and what you are signing is narrow: one token, a capped amount,
> twenty minutes.
> No key on our side can move your money. There is no function anywhere in this system that lets
> the model rebalance you.
> That is a real fill, on X Layer mainnet, and the guard checked it inside the same transaction
> that moved the funds.

---

### Scene 7. Evidence anyone can re-derive (2:28 to 2:50)

**Screen.** `/receipts`, the new receipt at the top with its evidence hash. Then cut to the
terminal, full screen, and run:

```bash
pnpm evidence <hash>
```

Let it print. Do not speed this one up; it is the most persuasive twenty seconds in the video and
it is short.

**Narration.**

> Every fill leaves a receipt, and the receipt carries a hash of the exact quote, the oracle
> reading and the guard verdict it was decided on. The hash goes on chain before anything is
> signed, and the bundle is archived where anyone can fetch it.
> So this is not us showing you a log. This is the bundle being pulled down and the hash being
> derived again from it, and matching. Losses stay on that page as long as the wins do.

---

### Scene 8. Close (2:50 to 3:00)

**Screen.** Terminal, `pnpm capacity`, the universe figure landing with today's date. Then a still
frame: wordmark, `reckonz.xyz`, `@reckonz_xyz`, the GitHub URL, `Built on X Layer`.

**Narration.**

> One last number, and it is the weakest one we have. The entire xStock universe on X Layer
> absorbs about thirty eight thousand dollars today at half a percent of impact. It was ninety
> seven thousand five days ago.
> We publish that with the date because it is a reading of the pools, not a property of them.
> Thin, moving depth is exactly why this refuses size, and exactly why it never takes custody.

[Replace both figures with the day's `pnpm capacity` output and the previous recorded reading.]

---

## Capture guide, scene by scene

Record each scene as its own take. Do not attempt one continuous run; the fill scene will need
retries and you do not want to redo the narration for it.

| Scene | URL or command | Watch for |
|---|---|---|
| 1 | `/idea`, run finished beforehand | Refused figure must match scene 4's run |
| 2 | `reckonz.xyz` | Let the ticker wall settle before scrolling |
| 3 | `/idea` | Type at human speed. `/api/run` is rate limited to 3 burst, 6 a minute (D78), so do not spam retakes |
| 4 | same run as scene 3 | Expand capacity, collapse the rest |
| 5 | `/assets`, table view | Drag the slider slowly, one rung per beat |
| 6 | `/trade` | Health check first. Wallet on chain 196. Blur nothing; show a demo balance instead |
| 7 | `/receipts`, then `pnpm evidence <hash>` | Scroll history clear above the prompt |
| 8 | `pnpm capacity` | Takes a while; let it run and use the tail |

**Two extra takes, always.** Record scene 5's slider twice, and scene 7's terminal twice. They are
the two shots most likely to be spoiled by a stray notification or a mistyped hash, and they are
the two hardest to reproduce later because the underlying numbers move.

---

## Editing guide

### Tooling

Anything with a timeline works. DaVinci Resolve if you want the free grade and good text tools,
Final Cut if it is already installed, CapCut only for the vertical social cut. Screen capture with
the OS recorder at 60fps rather than a browser extension, which will drop frames on the dense
tables.

### Assembly order

1. **Lay the narration first.** Record all eight scenes of voice in one sitting, one file, with a
   clap or a marker between scenes. Cut it into eight clips and space them on the timeline before
   any picture goes down. The video is an argument and the argument lives in the voice.
2. **Drop picture under it.** Every scene's picture is trimmed to the narration, not the other way
   round. If a shot is too short, hold the last frame rather than slowing the whole clip.
3. **Then trim silence.** Cut breaths down to about 250ms and pauses between scenes to about
   400ms. Do not remove every pause; the numbers need a beat after them.

### Cutting rules

- **No transitions.** Hard cuts throughout. One exception: a 6 frame dissolve into the closing
  still, and only because a hard cut to a static card reads as a crash.
- **Cut on the action**, not after it. The frame the slider stops on is the frame that holds.
- **Never cut in the middle of a number being read aloud.**
- **Two seconds minimum** on any frame containing a figure the viewer is expected to read.
- Dead air over an unchanged screen is the sign to shorten the picture, not to add music.

### Zooms and emphasis

The console is dense, so most figures need help.

- Use a **punch-in**, a static scale to about 130% held for the duration, not a moving zoom.
  Recording at 2560 wide is what makes this stay sharp at 1080p.
- Punch in on exactly four things: the refused-notional line (scene 1 and 4), the verdict column
  collapsing (scene 5), the signature dialog's amount and expiry (scene 6), and the matching hash
  (scene 7). Four punch-ins in three minutes. A fifth starts to feel like a sales video.
- No highlight circles, no arrows, no drop shadows on callouts.

### On-screen text

Follow `docs/09-design.md`, because the video will sit beside the product.

- Monospace for every number, tabular figures, right-aligned.
- Lower thirds are a thin panel on near black with a hairline border. No gradient, no glass, no
  drop shadow.
- Colour semantics are the app's and they are not the trading convention. `signal` for allowed,
  `caution` for a refusal with its reason in words, and `refuse` red only when the run itself
  broke. **A refusal is not red here.** If a frame of a normal run is mostly red, the grade is
  wrong, not the run.
- Every refusal on screen carries its reason. `REJECT PRICE_IMPACT, 90bp against a 50bp limit`, not
  `REJECT`.
- No em-dashes in any card, caption or lower third.

### Speed badges

Three ramps, each with a badge in the lower right: `4x, real time 38s`. Same type as the lower
thirds, no box, 60% opacity. Badge appears with the ramp and leaves with it.

### Sound

- Voice recorded on a real microphone in a soft room, not the laptop's. One pass, then a second
  pass of just the sentences you fumbled.
- High-pass at 80Hz, light compression, normalise to about -16 LUFS integrated with true peak
  under -1dB.
- No music under the narration. If the open feels bare, a very quiet bed under scenes 1 and 2 only,
  ducked 18dB under voice, out by 0:32.
- Keep the UI's own sounds out. Mute system audio during capture.

### Captions

- Burn them in, two lines maximum, bottom centre, above the lower thirds.
- Caption what was actually said, including the fumbles you kept.
- Also export an `.srt` alongside, for platforms that want it.
- Numbers as digits in the caption even where the narration says them as words. `$248,298` reads
  faster than the spoken form.

### Export

| Setting | Value |
|---|---|
| Resolution | 1920x1080 |
| Frame rate | 60fps, matching capture |
| Codec | H.264, high profile |
| Bitrate | 16 to 20 Mbps VBR, two pass |
| Audio | AAC 320kbps stereo |
| Colour | Rec.709, no LUT, no grade beyond a small lift on the terminal scenes if they read as crushed |

Check the export on a phone before publishing. The tables are the thing that fails there, and if a
figure is unreadable on a phone it needs a punch-in it did not get.

---

## When something breaks on camera

It will. The house position is that a real system misbehaving on camera is worth more than a
staged one behaving, as long as you say what happened.

| What happens | What to do |
|---|---|
| The guard refuses the fill | **Keep it.** Re-record the narration for that scene to say what was refused and why. This is the product doing its job and it is a better scene than the one you planned |
| The oracle is stale and nothing can execute | Stop. Check `/api/health`, wait for the publisher, come back. Do not record a fill against a price the system will not defend |
| A run returns fewer legs than expected | Keep it and adjust the numbers. Do not re-run until the basket looks good; that turns a measurement into a selection |
| The wallet extension hangs | Reload, reconnect. The connection survives a reload by design |
| `/api/run` starts returning 429 | You have retaken too fast. Wait a minute. The limiter is per instance and deliberate (D78) |
| A number on screen disagrees with the narration | Re-record the line, not the shot. Never let the two disagree, it is the one thing a judge can falsify in a minute |

---

## Publishing checklist

- [ ] Every figure spoken matches every figure on screen matches the video description
- [ ] All plan figures came from one `pnpm plan 250000` run
- [ ] Capacity figure carries its date and the previous reading
- [ ] No em-dash anywhere: narration, captions, lower thirds, title, description
- [ ] No key, seed, `.env`, or private address in any frame. Scrub the terminal scenes frame by
      frame
- [ ] Test counts, receipt count and contract counts match `pnpm check:tests` and a `count()` read
- [ ] Contract counts stated as seven on mainnet plus seven on testnet, never fourteen on mainnet
- [ ] Captions burned in, `.srt` exported
- [ ] Checked on a phone
- [ ] Thumbnail is the refused-notional frame, not a logo
- [ ] Title says tokenised real world assets
- [ ] Linked from the site, from `10-submission.md`'s description if the field allows a link, and
      posted from `@reckonz_xyz` per `11-social.md`
- [ ] `05-status.md` updated: the demo video item moves out of "Blocking for a credible demo"

---

## Suggested title and description

**Title**

> Reckonz: tokenised stocks on X Layer, sized to what the market can actually absorb

**Description**

> Reckonz turns an investment thesis into on-chain positions in tokenised real world assets, sized
> to what the market can actually absorb, and into the exit rules that close them. The assets are
> xStocks: tokenised US equities trading as ERC-20s on X Layer. Funds never leave your wallet.
>
> In this video: a thesis compiled into a falsifiable claim, a $250,000 request sized down to what
> the pools can take, the guard refusing inside the trade's own transaction, one real fill on X
> Layer mainnet, and an evidence bundle fetched from the archive with its hash re-derived.
>
> Figures measured on [DATE]. Re-run them yourself: `pnpm capacity`, `pnpm plan 250000`.
>
> reckonz.xyz
> github.com/wngstnr-code/reckonz
> @reckonz_xyz
