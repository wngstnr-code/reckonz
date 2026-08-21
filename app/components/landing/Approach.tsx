'use client';

import { useEffect, useRef, useState } from 'react';

import { Logo } from '../console/Logo';
import { DrawnStroke } from './DrawnStroke';
import { useInView } from './useInView';

/**
 * The second screen: what the thing actually does.
 *
 * The reference sets its heading left, its prose right and its media bottom
 * left. This is that layout mirrored — heading right, prose left, media right —
 * and the mirror is not decoration: the hero's wall travels left, so a section
 * that also arrives from the left would read as the same movement continuing.
 * Coming from the other side is what makes it a second thing.
 *
 * **The prose and the card share a row.** They were stacked, and side by side
 * is the better version of the same idea: a paragraph, and beside it an
 * ordinary rectangle of the kind any page puts next to its text. Everything
 * that happens afterwards depends on that rectangle being unremarkable first.
 *
 * Three arrivals, all on scroll and all reversible:
 *
 *  - the heading rises a line at a time out of its own mask,
 *  - the ornament draws itself along its own path,
 *  - the demo leaves the paragraph, turns, and lands as the whole screen.
 *
 * **All three run backwards too.** They are tied to where the section is, not
 * to whether it has ever been on screen — scroll back up and the heading drops
 * into its mask, the stroke undraws, the card returns to the gap it came from.
 * An animation that can only be seen once is an animation most readers never
 * see.
 *
 * All three are CSS. The JavaScript answers only what a stylesheet cannot:
 * where two rectangles currently are, and whether a click should reach a
 * handler.
 *
 * ## The demo, in four movements
 *
 * **It scrolls.** For the first stretch the card is a plain rectangle sitting
 * in the gap beside the prose, moving exactly as the page moves. It is already
 * `fixed` and already in front of everything, but nothing says so yet, and
 * that is the point: the reader has to believe it is an ordinary block before
 * it stops being one.
 *
 * **It flies.** When the gap reaches the middle of the screen the card leaves
 * it, turning as it goes — angled hardest halfway across, square again on
 * arrival — and lands as a panel the size of the screen, clear of the bar.
 *
 * **It invites.** A quarter of a viewport later the play control fades up out
 * of the video. Its own clock, so it is the reader's next scroll that produces
 * it rather than a timer that would have run whether anybody was still there.
 *
 * **It leaves.** Then the pin releases and the card moves up one pixel per
 * pixel scrolled, which is what every other element on the page is doing. It
 * has to be told, because `fixed` means the scroll cannot carry it — but the
 * result is the card going away with the page rather than dissolving on it.
 *
 * **The section ends while that is still happening**, and that is the reason
 * for its height. The exit needs no room of its own: the card is fixed, so it
 * keeps riding on whatever is under it. Reserving a screen for it anyway left
 * the card leaving over nothing — an empty page between this section and the
 * next. At `230svh` the section runs out just as the release begins, so the
 * card goes up while the section below comes up to meet it, both at the speed
 * of the scroll. That is one movement, not two.
 *
 * There is no opacity anywhere in that sequence. Both ends are movement, and a
 * fade at either one would be the layer admitting it was never in the flow.
 */

/** Broken by hand, because the line breaks are the composition. */
const HEADING = ['You write the thesis.', 'The chain answers.'];

export function Approach({
  videoSrc,
  loopSrc,
}: {
  videoSrc?: string;
  /* The card's thumbnail, not a second video. `videoSrc` is the recorded run
     and it brings a `PLAY` control with it; `loopSrc` is silent brand motion
     that holds the frame until the reader starts the run — and holds it alone,
     with the sentence instead of the control, if there is no run yet. Either
     way it is gone the moment the recording is playing.
     A list, in preference order, because one file is not enough — see the
     `<source>` comment in DemoFrame. */
  loopSrc?: string[];
}) {
  const { ref, seen } = useInView<HTMLElement>();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const restRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);

  /* The card is only clickable once it has landed.
   *
   * It is fixed and in front of the page for the whole flight, so a card that
   * took clicks the whole way would be swallowing them on behalf of a video
   * the reader cannot see yet — and it covers the heading while it does it.
   *
   * It goes on the card rather than on the shell around it. The shell is the
   * measuring box and never moves; the card is what the reader can actually
   * point at.
   *
   * This is the one thing in the section that has to be React state rather than
   * a custom property: `pointer-events` decides whether an event reaches a
   * handler, and a handler is not something CSS owns. It flips twice in the
   * life of the section, so it costs two renders. */
  const [landed, setLanded] = useState(false);

  /**
   * Where the card is, written straight to the node.
   *
   * It reads two rectangles and nothing else — the section's own position is no
   * longer part of the answer, because the card's clock is the gap it starts in
   * and the stroke's clock moved into `DrawnStroke` with the stroke. There is
   * no pointer handling either: everything this section does is answerable from
   * the scroll position, and a hover effect on a block already moving under the
   * reader is a second thing competing with the first.
   *
   * Every value here is written straight to the node. State would re-render
   * React on every scroll frame to change one number that only CSS reads. The
   * exception is `landed`, and it is an exception because it decides whether a
   * click reaches a handler rather than how something looks.
   */
  useEffect(() => {
    const shell = shellRef.current;
    const rest = restRef.current;
    if (!shell || !rest) return;

    const clamp = (n: number) => Math.max(0, Math.min(1, n));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // The finished state, said out loud. `--reveal` does not default to it,
      // and a card with no invitation on it is a video nobody can start. The
      // stroke answers this question for itself, inside `DrawnStroke`.
      shell.style.setProperty('--reveal', '1');
      setLanded(true);
      return;
    }

    let ticking = 0;

    const measure = () => {
      ticking = 0;

      const H = window.innerHeight;

      /* Two rectangles, and everything else is between them.
       *
       * `box` is the shell: fixed, untransformed, and already the panel the
       * card becomes — which is why the transform lives on a child. Measuring
       * an element you are also transforming gives you the transformed box, and
       * the arithmetic below would then be reading its own output.
       *
       * `start` is the gap in the flow beside the prose. It is measured live,
       * every frame, so while the card is still sitting on it the card scrolls
       * exactly as the page does — not because anything animates, but because
       * it is being told where a scrolling element currently is. */
      const box = shell.getBoundingClientRect();
      const start = rest.getBoundingClientRect();

      // The gap has to be the card's own shape, or the card at rest would not
      // fill the hole it leaves. Measured rather than guessed, because the
      // panel's ratio is a viewport minus two fixed insets and changes with it.
      const ratio = (box.width / box.height).toFixed(4);
      if (rest.dataset.ratio !== ratio) {
        rest.dataset.ratio = ratio;
        rest.style.aspectRatio = ratio;
      }

      /* `t` is the flight, and it is read from the gap rather than from the
         section: the card takes off when the place it is sitting reaches the
         middle of the screen, which is a thing the reader can see, rather than
         when some fraction of a section has gone by. */
      const t = clamp((H * 0.5 - start.top) / (H * 0.65));
      const scale = start.width / box.width;

      /* The exit is not an effect. Once the invitation has been read the card
         is released and moves up one pixel per pixel scrolled, which is what
         every other element on the page is doing — the difference is that this
         one had to be told, because `fixed` means the scroll cannot carry it. */
      const past = -start.top;
      const shift = Math.max(0, past - H * 0.65);

      /* Centre to centre, decaying to nothing as the flight completes. A
         translate before a scale is in unscaled pixels, and neither the scale
         nor the rotations move the centre, so these two numbers place the card
         on their own. */
      const dx = (start.left + start.width / 2 - box.left - box.width / 2) * (1 - t);
      const dy = (start.top + start.height / 2 - box.top - box.height / 2) * (1 - t);

      shell.style.setProperty('--s', (scale + (1 - scale) * t).toFixed(4));
      shell.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      shell.style.setProperty('--dy', `${(dy - shift).toFixed(1)}px`);

      /* The turn is a bump, not an unwind: flat at rest, fully angled halfway
         across, flat again on landing. That is the reference read literally —
         its first and last frames are both square, and only the ones in between
         are seen from the side. An angle that merely decayed to zero would mean
         the card was already turned before it had moved, and the section would
         open on a skewed rectangle sitting in the middle of the prose. */
      shell.style.setProperty('--b', Math.sin(Math.PI * t).toFixed(4));

      /* And the invitation, on the scroll after the landing. */
      shell.style.setProperty('--reveal', clamp((past - H * 0.25) / (H * 0.35)).toFixed(3));

      setLanded(t >= 1);
    };

    const onScroll = () => {
      if (!ticking) ticking = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(ticking);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section
      ref={ref}
      id="what-it-does"
      className={`relative min-h-[230svh] overflow-hidden px-[max(2rem,5vw)] pt-[clamp(6rem,14vh,10rem)] pb-[clamp(5rem,12vh,8rem)] ${
        seen ? 'reveal-on' : ''
      }`}
    >
      <Ornament />

      {/* Right-aligned, and the whole width is its measure: no cap, because the
          two lines are written to be two lines and a wrapper that decides to
          break them somewhere else would be overruling the composition. */}
      <h2 className="relative z-30 mt-[clamp(3rem,9vh,7rem)] text-right text-[clamp(3rem,8.6vw,8.2rem)] leading-[1.02] font-medium tracking-[-0.03em] text-ink">
        {HEADING.map((line, i) => (
          <span key={line} className="rise-mask" style={{ ['--rise-delay' as string]: `${i * 130}ms` }}>
            <span>{line}</span>
          </span>
        ))}
      </h2>

      {/* The prose and the gap the card sits in, one row.
       *
       * They were stacked, on the argument that a screen should hold a heading,
       * a paragraph and the top edge of something worth scrolling for. Side by
       * side is the better version of the same idea: the card is a plain
       * rectangle beside the sentence that explains it, the way any page puts a
       * figure next to its text, and the whole point of what happens next is
       * that it starts from something completely ordinary.
       *
       * One column below `lg`, where two would leave the prose at a measure
       * nobody can read. */}
      <div className="relative z-30 mt-[clamp(2rem,7vh,4.5rem)] flex flex-col items-start gap-[clamp(2rem,4vw,4.5rem)] lg:flex-row">
        <p className="max-w-[46ch] text-[clamp(1rem,1.15vw,1.2rem)] leading-relaxed text-ink">
          Type it in plain language. Reckonz maps it onto the thirty tokenised stocks that actually
          trade on X Layer, walks live pool depth to size every leg, and refuses whatever the market
          cannot take. Each fill leaves a receipt on chain, and the evidence behind it can be
          re-derived by anyone who doubts it.
        </p>

        {/* The gap, and nothing else.
         *
         * The card that appears to be here is `fixed` and one element down the
         * page; this reserves its space and reports where that space currently
         * is. Empty on purpose — two elements that both drew the card would
         * have to agree pixel for pixel, and they would stop agreeing the first
         * time one of them was styled.
         *
         * Its ratio is written from the panel's, so the hole the card leaves
         * when it takes off is the shape of the card that left it. The class is
         * the value before that measurement lands. */}
        <div
          ref={restRef}
          aria-hidden
          className="aspect-[16/9] w-full shrink-0 lg:ml-auto lg:w-[min(48%,40rem)]"
        />
      </div>

      {/* Its own canvas, in front of the page.
       *
       * `fixed`, so the scroll cannot carry it — which is what lets it be told
       * where to be instead. For the first stretch that means sitting exactly
       * on the gap above and moving with it, so it reads as an ordinary block
       * in the flow; then it leaves, and the page keeps scrolling underneath.
       * It ends up over the heading it started beneath because it is not in
       * that stacking order at all any more.
       *
       * **The box is the finished state and the transform is everything else.**
       * The element is already the panel it becomes: the largest 16:9 rectangle
       * that fits between the page's own left and right inset, clear of the
       * bar, centred in what is left. So the landing is the untransformed
       * element rather than a set of numbers that cancel out.
       *
       * 7rem clears the bar's pill with air to spare, and it is a literal
       * because the bar is `fixed` and takes no space in the flow — there is
       * nothing here that could measure it. It is spent twice: once as the top
       * inset, and once inside the width below, where the 9rem is it plus the
       * 2rem at the bottom.
       *
       * Not clipped by the section's `overflow-hidden`: a fixed element's
       * containing block is the viewport, and nothing above it sets a transform
       * or filter that would take that over. */}
      <div className="pointer-events-none fixed inset-x-[max(2rem,5vw)] top-[7rem] bottom-[2rem] z-30 flex items-center justify-center">
        {/* **The panel is the recording's shape, not the window's.**
         *
         * It was the whole area between those insets, which is whatever ratio
         * the window happens to be — so a 16:9 capture either sat in a band of
         * card or lost an edge of the interface it was demonstrating. Neither
         * is a demo. The box is 16:9 and as large as fits: the width is the
         * lesser of the room across and the room down converted through the
         * ratio, and the flex parent centres whichever axis had the slack.
         *
         * `dvh` rather than `svh`, because the reference is the box drawn just
         * above — inset from the *current* viewport — and with a phone's bars
         * retracted `svh` describes a shorter screen than the insets do.
         *
         * This is still the untransformed box the flight is measured from, and
         * the gap up the page copies its ratio, so the hole the card leaves is
         * the shape of the card that left it. Only the shape changed. */}
        <div ref={shellRef} className="aspect-[16/9] w-[min(100%,calc((100dvh_-_9rem)*16/9))]">
          {/* **The events belong on the thing that moves.**
           *
           * They were on the shell, and the shell never moves — it is the box the
           * card is measured against, pinned over the viewport from the first
           * paint to the last. So once the card had ridden away it left behind an
           * invisible rectangle, still covering most of the screen, still taking
           * every click. Everything below this section stopped being clickable,
           * and nothing looked wrong.
           *
           * The card is the transformed element, so its hit area travels with it.
           * When it is a third of the size and off in the corner, that corner is
           * the only part of the screen that answers; when it has left over the
           * top, nothing does. */}
          <div className={`card-zoom h-full w-full ${landed ? 'pointer-events-auto' : ''}`}>
            <DemoFrame
              src={videoSrc}
              loopSrc={loopSrc}
              playing={playing}
              landed={landed}
              onPlay={() => setPlaying(true)}
              onEnd={() => setPlaying(false)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The accent stroke, and where it sits.
 *
 * The line was drawn with a mouse and captured verbatim: a long arc in from the
 * left, one closed loop, then a wave that flattens out to the right. `Vector
 * 6.svg` was the first attempt at this and a traced copy of it was the second;
 * both are gone. What replaced them was not a better trace — it was dropping
 * the tracing step, because every version of a line redrawn from a picture of a
 * line loses the thing that made it worth drawing.
 *
 * So the numbers are ugly on purpose. They are pointer samples, smoothed and
 * thinned and fitted with a curve that passes *through* each anchor rather than
 * near it, which is what keeps the cusp where the loop closes. Rounding them to
 * something a reader could scan would be re-drawing it again.
 *
 * **The viewBox is the sheet the line was drawn on, not the line's own bounds.**
 * 960 by 480 is the canvas; the drawing runs past its right edge and stops short
 * of the left, and both of those are the composition. Cropping the box to the
 * ink re-centres the drawing inside its own extents and throws away the fact
 * that it was leaving the frame. So the sheet is the page: `w-full` with no
 * inset and no cap, and the tail that left the canvas on the right leaves the
 * screen on the right.
 *
 * Everything about *how* it is drawn lives in `DrawnStroke`, which the closing
 * section's line shares. What is left here is this drawing and this position.
 *
 * ## Why it is behind, and why that took saying
 *
 * It was `-z-10` inside a `relative` section. A positioned element with
 * `z-index: auto` does not create a stacking context, so the negative index did
 * not put the stroke behind its own section — it put it behind `<main>`, whose
 * `bg-ground` painted straight over it. The animation had been running the
 * whole time, on an element nobody could see.
 *
 * The layers are explicit now: the stroke behind the card, the card behind the
 * type. It passes behind the frame rather than over it, which is what makes the
 * frame read as an object standing in front of something rather than a picture
 * with a line scribbled across it.
 */
function Ornament() {
  return (
    <DrawnStroke
      viewBox="0 0 960 480"
      d="M1.3 120.6C11.9 118.1 43.4 109.7 64.6 105.5C85.7 101.3 109.1 97.8 128 95.5C146.9 93.1 163.8 91.8 178 91.3C192.3 90.9 201.3 91.3 213.6 92.7C225.8 94.1 238.4 96 251.4 99.6C264.4 103.3 279.1 108.8 291.4 114.7C303.7 120.6 315.9 128 325.3 134.8C334.8 141.7 340.6 146.1 348 156C355.5 165.8 364.5 179.4 370.1 194C375.7 208.5 379.3 225.8 381.7 243.5C384 261.1 385.3 282.9 384.1 299.8C382.8 316.7 378.6 333.1 374 345C369.5 357 365.2 363 356.6 371.5C348.1 380 335.5 389.4 322.8 396.1C310.1 402.8 293.6 409 280.6 411.8C267.5 414.5 254.6 413.8 244.5 412.5C234.3 411.2 226.7 407.8 219.4 404.1C212.2 400.5 205.9 395.5 201 390.6C196.1 385.8 193.2 381.6 190.2 375.1C187.2 368.7 184.1 359.5 182.9 351.9C181.7 344.2 181.7 337.4 182.8 329.1C184 320.9 186.6 311.2 189.7 302.5C192.8 293.9 197.1 285.1 201.7 277.3C206.3 269.5 210 263.4 217.3 255.7C224.6 248 233 238.5 245.4 231.2C257.8 223.9 276.9 216.4 291.6 211.8C306.4 207.1 309.1 206.5 333.8 203.3C358.5 200.2 414.5 194.1 439.9 192.8C465.3 191.5 470.2 191.7 486 195.4C501.9 199.1 520 205.4 535.1 214.9C550.2 224.4 557 231.6 576.6 252.5C596.1 273.4 636.6 323 652.6 340.1C668.7 357.2 666.2 351.1 672.8 354.9C679.5 358.7 685.2 361.1 692.3 362.7C699.5 364.3 708 365.2 715.8 364.5C723.6 363.7 722.4 367.6 739.3 358.2C756.1 348.8 797.7 318.4 816.8 308C835.8 297.7 840.5 297.5 853.7 296.2C866.9 295 876.9 294.7 896.1 300.5C915.2 306.3 950 324.5 968.6 331.1C987.2 337.7 998.7 338.4 1007.6 340.1C1016.6 341.8 1013.3 342.3 1022.3 341.4C1031.3 340.6 1055.2 335.9 1061.8 334.8"
      className="pointer-events-none absolute top-0 left-0 z-10 h-auto w-full"
    />
  );
}

/** How long the two layers overlap, in milliseconds.
 *
 * Long enough to read as one picture becoming another rather than as a switch,
 * short enough that a reader who has just pressed PLAY is not waiting on it.
 * The number is shared by the CSS transition and the two bits of bookkeeping
 * that must not happen until it is over, so it lives here rather than in a
 * class name that a timer would have to be kept in step with.
 */
const DISSOLVE = 420;

/** The player's three words. White from a literal for the same reason the
 *  lockup is: this card is #0b0d10 in both themes and off the token ladder. */
const LABEL =
  'text-[clamp(0.7rem,0.9vw,0.9rem)] font-medium tracking-[0.08em] text-white uppercase [text-shadow:0_1px_12px_rgba(0,0,0,0.85)] transition-opacity duration-200 hover:opacity-60';

/**
 * What the wheel does when it has to share the frame with the control.
 *
 * **The collision is unavoidable, so the loop gives way.** `PLAY ▶ REEL` is set
 * at display size in the middle of the card, and the loop carries the wordmark
 * in exactly that place — white type over white type, which no amount of
 * dimming separates because the two are the same colour. Dropping the control
 * to the bottom edge, where the empty state puts its sentence, only moves the
 * problem: the bottom of the ring is a row of bright logos, and a 6rem lockup
 * lands straight on them. The composition is a circle, so it is loud in the
 * middle and loud around the outside, and there is no quiet corner to retreat
 * to.
 *
 * So the middle is cut out of it. A radial mask makes the loop transparent
 * inside `57%` of its half-height and solid again by `68%`, which takes the
 * wordmark with it and leaves every logo on the ring untouched — the card's own
 * ground shows through the hole, and the lockup sits on flat #0b0d10.
 *
 * The scale is what makes the hole big enough. The mask is a fraction of the
 * element, so scaling the loop scales the hole with it: at `1.2` the opening is
 * wider than the words on a desktop card, where at `1` the ends of `PLAY` and
 * `REEL` sat on the ring. It costs nothing at the top and bottom — the ring
 * occupies about four fifths of the frame's height, so a fifth more still
 * clears the edges.
 *
 * **And below `sm` the wheel does not run at all.** The lockup is sized off the
 * viewport and the ring off the card, and on a phone the words come out wider
 * than the whole ring — there is no hole that fits them, at any scale. The
 * choice there is between a control laid across the logos and no wheel, and it
 * is not close: the card falls back to its own ground, which is what it was
 * before any of this, and the wheel is a thing the phone never sees rather than
 * a thing the phone sees broken. It is also 200px of ring with unreadable
 * tickers in it, so little is lost.
 *
 * Not applied in the empty state. There is no lockup there, only a line of 13px
 * type along the bottom, and a wheel with its middle removed to make room for
 * nothing is just a broken wheel.
 */
const BEHIND_CONTROL =
  'max-sm:hidden scale-[1.2] [mask-image:radial-gradient(circle_closest-side_at_50%_50%,transparent_57%,#000_68%)] [-webkit-mask-image:radial-gradient(circle_closest-side_at_50%_50%,transparent_57%,#000_68%)]';

/**
 * The demo, and what to show while there is not one.
 *
 * This was briefly a WebGL mesh, to reproduce the curved edges in the
 * reference — an affine transform cannot bend a straight line, so matching that
 * exactly does need a subdivided surface. It is out again: three hundred lines
 * of shader for a frame whose contents do not exist yet, on a page that is
 * otherwise entirely CSS, is a cost taken before the thing it is decorating.
 * If the recording lands and the flat frame is what looks wrong, that is the
 * moment to spend it.
 *
 * `src` is optional and the frame ships before the recording does, so the empty
 * state says what it is rather than offering a control that cannot work. A play
 * button over a video that does not exist is the same dishonesty as a nav link
 * to a page nobody built.
 *
 * Nothing autoplays: a landing page that starts making noise is a landing page
 * people close.
 */
function DemoFrame({
  src,
  loopSrc,
  playing,
  landed,
  onPlay,
  onEnd,
}: {
  src?: string;
  loopSrc?: string[];
  playing: boolean;
  landed: boolean;
  onPlay: () => void;
  onEnd: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const loop = useRef<HTMLVideoElement | null>(null);
  /* The two nodes the player writes to every few frames. Refs, not state: the
     progress bar moves four times a second and the cursor moves with the hand,
     and neither is a fact any other part of this component reads. */
  const progress = useRef<HTMLDivElement | null>(null);
  const cursor = useRef<HTMLDivElement | null>(null);
  const seeker = useRef<HTMLInputElement | null>(null);
  /* These two are state, because they are words on the screen: the label says
     PLAY or PAUSE and MUTE or UNMUTE, and it changes about as often as the
     reader presses it. */
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  /**
   * Whether the controls are showing.
   *
   * They follow the pointer being over the card: hand on it and the bar rises
   * out of the bottom edge with its gradient; hand off and both go, leaving the
   * recording with nothing on it at all. That is the point of a player drawn by
   * hand rather than the browser's — the chrome is only there while it is being
   * used, and a demo nobody is touching is just the demo.
   *
   * It starts **true**, and that is not a detail. A touch screen has no pointer
   * to be over anything, so a bar that waited for `pointerenter` would never
   * appear on a phone; starting shown means the only thing that hides it is a
   * pointer actually leaving, which is an event that device never sends.
   */
  const [hover, setHover] = useState(true);

  /**
   * Closing the run, which is the only way out of it that is not the end.
   *
   * The recording stops on the click rather than at the end of the dissolve —
   * it is the one part of this that is audible, and a reader who has just
   * dismissed something should not still be hearing it. The rewind stays where
   * it was, after the fade, for the reason written on the effect above.
   */
  const close = () => {
    video.current?.pause();
    onEnd();
  };

  /* Escape closes it too. The cursor is the affordance and a pointer is what
     that assumes; this is the same door for anyone not using one. Bound only
     while the run is up, so nothing on the rest of the page answers Escape. */
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  /**
   * What has to happen at the far end of the dissolve, in both directions.
   *
   * The two layers cross-fade, which means both are on screen for `DISSOLVE`
   * milliseconds and neither may be touched until it is over:
   *
   *  - **Into the run.** The wheel keeps turning while it fades. Pausing it on
   *    the click freezes a picture the reader is still looking at, and a still
   *    frame dissolving out is the one thing that would make the swap read as a
   *    swap. It stops once it is invisible, so nothing decodes two videos for
   *    longer than the fade.
   *  - **Back to the wheel.** The recording is rewound *after* it is covered.
   *    Rewinding it on `ended` — which is where this started — cuts to the
   *    title card underneath a half-transparent wheel, so the reader watches
   *    the demo start again through the thing that replaced it.
   *
   * A timer rather than `transitionend`, because the transition is off under
   * `prefers-reduced-motion` and the event would then never arrive: the pause
   * and the rewind are bookkeeping, and they have to happen whether or not
   * anything animated. Cleared on the way out, so a reader who presses PLAY
   * again mid-fade cancels the pause rather than racing it.
   */
  useEffect(() => {
    if (playing) {
      // Every run opens with its controls up, wherever the hand happens to be.
      setHover(true);
      const t = setTimeout(() => loop.current?.pause(), DISSOLVE);
      return () => clearTimeout(t);
    }
    // `catch`: autoplay of a muted, inline video is allowed, but a promise
    // rejected by a policy we cannot see should not become an unhandled one.
    void loop.current?.play().catch(() => {});
    const t = setTimeout(() => {
      if (video.current) video.current.currentTime = 0;
      // The bar goes back to nothing with it. `timeupdate` would do this by
      // itself on the next play, but not until a frame had been shown.
      if (progress.current) progress.current.style.width = '0%';
      if (seeker.current) seeker.current.value = '0';
    }, DISSOLVE);
    return () => clearTimeout(t);
  }, [playing]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-[#0b0d10]">
      {src && (
        <video
          ref={video}
          src={src}
          playsInline
          /* **No native chrome, and no way to leave the card.**
           *
           * `controls` would put the browser's own bar over a composition that
           * has one of its own, and it brings a fullscreen button with it — the
           * card is a fixed 16:9 panel in the middle of a page, and a reader who
           * blows it up to the screen leaves the page to come back to. So the
           * controls below are the whole of it: play, position, sound. There is
           * nothing here that changes the size of anything.
           *
           * `controlsList` and `disablePictureInPicture` close the two doors
           * that are left when a browser decides to offer its own menu anyway. */
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          onPlaying={() => setPaused(false)}
          onPause={() => setPaused(true)}
          /* Four times a second, straight to the node — see the ref above. */
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (!el.duration) return;
            const at = el.currentTime / el.duration;
            if (progress.current) progress.current.style.width = `${at * 100}%`;
            // The invisible range carries the same number, or the first arrow
            // key would jump the recording back to wherever it was left.
            if (seeker.current) seeker.current.value = String(Math.round(at * 1000));
          }}
          /* Metadata only. The card is click-to-play and the recording is tens of
             megabytes; `auto` would spend all of it on every reader who scrolls
             past without ever pressing PLAY. */
          preload="metadata"
          /* **The run ends where it started.**
           *
           * A recording that stops on its own last frame leaves the card as a
           * still of whatever the demo happened to close on, with no way back
           * to the thumbnail short of a reload. So the end of the video puts
           * the idle state back: the wheel returns, and the control with it.
           *
           * The rewind that goes with it is in the effect above, at the end of
           * the dissolve, not here — the frame this is parked on is still being
           * looked at through the wheel coming back over it.
           *
           * The reader who has just watched it is still at the scroll position
           * that produced the control, so `--reveal` is already 1: what comes
           * back is the wheel with `PLAY ▶ REEL` on it, not the mark. The mark
           * belongs to the arrival, and the card has already arrived. */
          onEnded={onEnd}
          className="h-full w-full object-cover"
        />
      )}

      {/* **The idle layer, and why it stays mounted through the run.**
       *
       * It used to be conditional, on the sound principle that nothing belongs
       * over the video once it is running. But a layer that unmounts cannot
       * fade, and one that remounts arrives as a black rectangle while the
       * wheel decodes its first frame — so the swap in both directions was a
       * cut. It is opaque, so fading it out *is* the cross-dissolve: there is
       * no second animation on the recording, and nothing to keep in step.
       *
       * `pointer-events-none` while it is going: it covers the whole card, and
       * the browser's own controls are underneath it. */}
      <div
        className={`absolute inset-0 transition-opacity ease-out motion-reduce:transition-none ${
          playing ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        /* The duration is written here rather than as a `duration-*` class so
           that it and the timers in the effect above cannot drift apart:
           `DISSOLVE` is the only place the number exists. `transition-none`
           under reduced motion overrides the property, so this is inert there
           rather than fighting it. */
        style={{ transitionDuration: `${DISSOLVE}ms` }}
      >
          {/* **The wheel is the thumbnail, in both states.**
           *
           * It was the empty state only, on the argument that a logo loop
           * behind a control reading "play the recorded run" would be the page
           * claiming the loop is the run. That was the wrong end of the
           * problem: what a thumbnail claims is *this is the thing you are
           * about to start*, and every video on the web makes that claim with a
           * frame that is not the film. The fix for the collision is
           * `BEHIND_CONTROL` and the scrim under it, which put the loop behind
           * the control rather than beside it — not withholding the brand
           * motion and leaving a black rectangle where a thumbnail goes.
           *
           * The ground under it is the card's own, and it is not decoration.
           * `preload="metadata"` gives the recording a first frame, and the
           * mask cuts a hole in the middle of the loop: without something
           * opaque between them, that hole is a keyhole onto the recording's
           * title card — neither the wheel nor the run, and bright enough to
           * take the white control with it. */}
          {loopSrc && loopSrc.length > 0 && <div aria-hidden className="absolute inset-0 bg-[#0b0d10]" />}

          {loopSrc && loopSrc.length > 0 && (
            <video
              ref={loop}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
              /* Decorative and silent, so it is hidden from assistive tech and
                 stood down entirely for anyone who has asked for less motion.
                 `motion-reduce:hidden` leaves the card its own #0b0d10 ground,
                 which is what it looked like before this existed.
                 The mask and the scale are the control's, not the loop's — see
                 the comment on them below, and they are only applied when there
                 is a control to make room for. */
              className={`motion-reduce:hidden absolute inset-0 h-full w-full object-cover ${
                src ? BEHIND_CONTROL : ''
              }`}
            >
              {/* **One file is not enough, and the failure is silent.** The
                  first cut of this was a single H.264 High@L5.0 mp4. It served
                  fine, reported no error, and sat at `readyState 0` forever:
                  the browser had accepted the element, started the fetch, and
                  could not decode it. A black card and a clean console.
                  `<source>` lets the browser pick what it can actually play,
                  so a codec it refuses costs the next line rather than the
                  whole card. The mp4 is deliberately Main@L4.0. */}
              {loopSrc.map((s) => (
                <source key={s} src={s} type={s.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
              ))}
            </video>
          )}

          {src ? (
            <>
              {/* The last of it, where the hole does not reach.
               *
               * The mask takes the wordmark out; this takes the edge off what
               * is left, because the ends of `PLAY` and `REEL` still pass close
               * to the ring. A third is enough — any more and the wheel stops
               * being the thing the card is showing.
               *
               * It arrives on the control's own clock, so the wheel is at full
               * strength for the whole flight and only steps back once there is
               * something on top of it to read. */}
              {loopSrc && loopSrc.length > 0 && (
                <div aria-hidden className="reel-fade absolute inset-0 bg-[#0b0d10]/35" />
              )}

              {/* **What is in the hole before the control is.**
               *
               * The mask leaves a clean opening in the middle of the wheel and
               * the control does not arrive until a quarter of a viewport after
               * the landing, so without this the card flies with a hole in it.
               * The mark fills it, at the size the wordmark it replaced was
               * never allowed to be — and it is the *mark*, not the lockup from
               * the header: the wheel is already a ring of thirty logos, and a
               * word set in the middle of it competes with every one of them.
               *
               * Mint, as everywhere else the mark appears. White was tried
               * first, on the argument that it should match the control it
               * hands over to; it read as the control's own placeholder rather
               * than as the brand, and the card lost the one coloured thing on
               * it. The exchange is legible either way — the two never share a
               * frame — so the mark keeps its colour.
               *
               * It is on `--reveal` read backwards, so it is gone by the time
               * the control is readable. `aria-hidden`, because it says
               * "Reckonz" to a screen reader on a page whose header already
               * does, and the button behind it carries the only label that
               * matters here. */}
              <span
                aria-hidden
                className="reel-out pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <Logo className="h-[34%] w-auto text-signal" />
              </span>

              {/* `disabled` rather than only `pointer-events-none` on the card:
                 a pointer can be told to pass through an element, a keyboard
                 cannot, and a control the page has not offered yet should not be
                 reachable by tab either. */}
              <button
                type="button"
                disabled={!landed}
                onClick={() => {
                  onPlay();
                  void video.current?.play();
                }}
                className="reel-in group absolute inset-0 flex items-center justify-center"
                aria-label="Play the recorded run"
              >
                <ReelLockup />
              </button>
            </>
          ) : (
            /* No video, so no invitation to play one. The reveal is the same
               clock and the same position; only the sentence changes, because a
               `PLAY` control over a card with nothing behind it is a button that
               lies. */
            /* Bottom, not centre: the loop carries the wordmark in the middle
               of the frame, and the two stacked on each other are unreadable.
               The control above solves the same collision the other way, with a
               scrim — a line of 13px type does not need one, and dimming the
               whole card to carry it would be spending the wheel on a caption. */
            <p
              className={`reel-in absolute inset-x-0 flex justify-center font-mono text-fine tracking-[0.12em] text-faint uppercase ${
                loopSrc?.length ? 'bottom-10' : 'inset-y-0 items-center'
              }`}
            >
              The recorded run lands here
            </p>
          )}
      </div>

      {/* **The player, and why it is not the browser's.**
       *
       * Three controls and a cursor. `PLAY` at one end, `MUTE` at the other,
       * the position between them — which is every control a recording on a
       * landing page needs, and the native bar's own list plus a fullscreen
       * button the card cannot honour.
       *
       * It fades opposite the idle layer on the same clock, so the two halves
       * of the dissolve are one movement: the wheel goes as the controls come,
       * and the recording underneath never moves.
       */}
      {src && (
        <div
          /* On the wrapper rather than on the close button under it: these two
             do not bubble, so they fire when the pointer crosses the card's own
             edge and not when it passes from the video to a control. */
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          className={`absolute inset-0 transition-opacity ease-out motion-reduce:transition-none ${
            playing ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ transitionDuration: `${DISSOLVE}ms` }}
        >
          {/* **The whole picture is the way out, and the cursor says so.**
           *
           * A close button parked in a corner is a widget on top of a film. The
           * reference's move is better: the pointer itself becomes the control,
           * so there is nothing over the recording until the reader's hand is,
           * and the thing under their hand is the size of a coin rather than
           * something to aim at.
           *
           * The native cursor goes off (`cursor-none`) and the circle is drawn
           * at the pointer instead, written straight to the node — a `mousemove`
           * that set React state would re-render the player on every pixel of
           * hand movement to move one element.
           *
           * It is a real `<button>` with a real label, so it is reachable and
           * announced; the circle is `aria-hidden` decoration on top of it. */}
          <button
            type="button"
            aria-label="Close the recorded run"
            onClick={close}
            onPointerMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              if (!cursor.current) return;
              cursor.current.style.transform = `translate3d(${e.clientX - box.left}px, ${
                e.clientY - box.top
              }px, 0) translate(-50%, -50%)`;
            }}
            onPointerEnter={() => cursor.current?.style.setProperty('opacity', '1')}
            onPointerLeave={() => cursor.current?.style.setProperty('opacity', '0')}
            className="absolute inset-0 cursor-none"
          />

          <div
            ref={cursor}
            aria-hidden
            /* The ring is the same concession as the scrim: a white disc on the
               recording's white panels is a hole in the picture rather than a
               control. It costs nothing where the reference's black frame would
               have been. */
            className="pointer-events-none absolute top-0 left-0 flex h-[clamp(3rem,6vw,5.5rem)] w-[clamp(3rem,6vw,5.5rem)] items-center justify-center rounded-full bg-white opacity-0 ring-1 ring-ink/15 transition-opacity duration-200"
          >
            {/* Thin, and drawn rather than typed: a multiplication sign at this
                size is a glyph with a typeface's opinion in it. */}
            <svg viewBox="0 0 24 24" className="h-[38%] w-[38%] text-ink" aria-hidden>
              <path
                d="M5 5 19 19M19 5 5 19"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* **The scrim under the bar, which the reference does not have.**
           *
           * Theirs is a film of a black speaker in a black room; ours is a
           * screen recording of a light interface, and white labels on it are
           * invisible for most of its three minutes.
           *
           * As little of it as the labels need, and no more. It was a quarter
           * of the card at 85%, which read as a black band laid over the demo
           * rather than as the demo. At a seventh and 60% it is enough to hold
           * three words and a line — the shadow on the type below does the rest
           * of the work, and it costs nothing anywhere the type is not. */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-[14%] bg-gradient-to-t from-[#0b0d10]/60 via-[#0b0d10]/20 to-transparent transition-opacity duration-300 ease-out motion-reduce:transition-none ${
              hover ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* The bar. `pointer-events-none` on the row and back on for each
              control, so the gaps between them still close the video — the row
              runs the full width of the card and most of it is empty.

              **Hard against the bottom edge**, because the recording burns its
              own subtitles in about a fifth of the way up. Anything with air
              under it lands on them, and two lines of white type crossing each
              other is worse than either alone. The padding left is the rounded
              corner's, not composition: the card is `rounded-[2rem]`, and a
              label flush to the edge would be clipped by the curve. */}
          <div
            /* It leaves downward rather than fading on the spot: the card
               clips, so `translate-y-full` puts the row past the bottom edge
               and the controls read as having gone somewhere. The opacity is
               there for the corners the curve exposes on the way. */
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-[clamp(0.75rem,1.1vw,1.15rem)] px-[clamp(1.5rem,3vw,3rem)] pb-[clamp(0.5rem,0.9vw,0.9rem)] transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
              hover ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
            }`}
          >
            {/* **Both labels are one fixed width, and it is the wider word's.**
             *
             * They sit against the track now rather than out at the card's
             * edges, which means their width is the track's position: `PLAY` is
             * two characters shorter than `PAUSE` and `MUTE` three shorter than
             * `UNMUTE`, so text that measured itself would shove the line
             * sideways every time the reader pressed something. At a fixed
             * `7.5ch` each — with the left one set left and the right one right
             * — the words change inside a box that does not, and the line stays
             * exactly where it was put. */}
            <button
              type="button"
              onClick={() => {
                const el = video.current;
                if (!el) return;
                if (el.paused) void el.play();
                else el.pause();
              }}
              className={`${LABEL} pointer-events-auto w-[7.5ch] text-left`}
            >
              {paused ? 'Play' : 'Pause'}
            </button>

            {/* The position, and the only part of this that is two elements.
             *
             * What is drawn is the pair of bars; what takes the input is a
             * native range on top of them at zero opacity. That is what buys
             * dragging, arrow keys and a real accessible name for the cost of
             * one invisible element — a div with a click handler would give the
             * mouse a seek and everyone else nothing. */}
            {/* **A measure, not a stretch.**
             *
             * It was `flex-1`, so the line was as long as the card was wide —
             * on a large screen that is well over a metre of track for three
             * minutes of video, and the head moves so slowly across it that it
             * reads as not moving. A fixed 780px is about two thirds of what it
             * was and the same on every screen, which is the point: this is a
             * ruler, and a ruler that changes length is not one.
             *
             * `max-w-full` is the one thing that may still shrink it, and only
             * where the alternative is a row wider than the card it sits in. */}
            <div className="pointer-events-auto relative w-[780px] max-w-full">
              <div className="h-[6px] w-full bg-white/25 shadow-[0_1px_12px_rgba(0,0,0,0.55)]">
                <div ref={progress} className="h-full w-0 bg-white" />
              </div>
              <input
                type="range"
                min={0}
                max={1000}
                defaultValue={0}
                ref={seeker}
                aria-label="Seek within the recorded run"
                onChange={(e) => {
                  const el = video.current;
                  if (!el || !el.duration) return;
                  el.currentTime = (Number(e.currentTarget.value) / 1000) * el.duration;
                }}
                /* Taller than what it drives. The line is 6px and a 6px hit
                   area is a line you have to aim at; the input reaches a little
                   above and below it, where a hand going for the track already
                   is. */
                className="absolute inset-x-0 -inset-y-2.5 w-full cursor-pointer opacity-0"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const el = video.current;
                if (!el) return;
                el.muted = !el.muted;
                setMuted(el.muted);
              }}
              className={`${LABEL} pointer-events-auto w-[7.5ch] text-right`}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * `PLAY` — the control — `REEL`.
 *
 * The button is the word: set at display size and split by the thing it does,
 * so the control is not a widget parked on top of a video but the middle of a
 * sentence. Lusion's move, and it works because the video underneath is already
 * the loudest thing on the screen — a small circular button in the same place
 * would be asking to be found rather than read.
 *
 * White, from a literal rather than a token. This card is not on the light/dark
 * ladder: it is `#0b0d10` in both themes, the same ground the hero lights its
 * tiles against, so the foreground over it is fixed too.
 *
 * Everything is set in `em` off the one clamped size on the wrapper, so the
 * pill, the triangle and the gaps stay in proportion at every width instead of
 * three sizes disagreeing about how big the lockup is.
 */
function ReelLockup() {
  return (
    <span className="flex items-center gap-[0.28em] text-[clamp(2.2rem,7vw,6rem)] leading-none font-medium tracking-[-0.01em] text-white">
      PLAY
      <span className="flex h-[0.78em] w-[1.55em] items-center justify-center rounded-full bg-white transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="ml-[0.06em] h-[0.32em] w-[0.32em] text-ink" aria-hidden>
          <path d="M6 3.5 20 12 6 20.5Z" fill="currentColor" />
        </svg>
      </span>
      REEL
    </span>
  );
}
