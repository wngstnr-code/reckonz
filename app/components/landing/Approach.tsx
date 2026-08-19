'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
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

export function Approach({ videoSrc }: { videoSrc?: string }) {
  const { ref, seen } = useInView<HTMLElement>();
  const strokeRef = useRef<SVGPathElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const restRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);

  /* The card is only clickable once it has landed.
   *
   * It is fixed and in front of the page for the whole flight, so a card that
   * took clicks the whole way would be swallowing them on behalf of a video
   * the reader cannot see yet — and it covers the heading while it does it.
   *
   * This is the one thing in the section that has to be React state rather than
   * a custom property: `pointer-events` decides whether an event reaches a
   * handler, and a handler is not something CSS owns. It flips twice in the
   * life of the section, so it costs two renders. */
  const [landed, setLanded] = useState(false);

  /**
   * How far the section has been read, written straight to a custom property.
   *
   * The only JavaScript left in here besides the question of whether the reader
   * has arrived. There is no pointer handling at all: everything this section
   * does is answerable from the scroll position, and a hover effect on a block
   * that is already moving under the reader is a second thing competing with
   * the first.
   *
   * Every value here is written straight to the node. State would re-render
   * React on every scroll frame to change one number that only CSS reads. The
   * exception is `landed`, and it is an exception because it decides whether a
   * click reaches a handler rather than how something looks.
   */
  useEffect(() => {
    const shell = shellRef.current;
    const rest = restRef.current;
    const stroke = strokeRef.current;
    const section = ref.current;
    if (!shell || !rest || !stroke || !section) return;

    const clamp = (n: number) => Math.max(0, Math.min(1, n));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // The finished state, said out loud. None of these default to it: at
      // `--s: 1` with everything else unset the card is already the panel, but
      // `--draw` and `--reveal` are not, and a card with no invitation on it is
      // a video nobody can start.
      section.style.setProperty('--draw', '1');
      shell.style.setProperty('--reveal', '1');
      setLanded(true);
      return;
    }

    /* Where the stroke begins, as a fraction of its own box.
     *
     * Read off the path rather than written down: `getPointAtLength(0)` is the
     * pen's first contact in user units, and the viewBox says how far down the
     * drawing that is. The line currently starts a quarter of the way down, and
     * measuring it means a different drawing does not need this number changed.
     *
     * Once, not per frame. It is a property of the `d`, and the `d` does not
     * move. */
    const viewBox = stroke.ownerSVGElement?.viewBox.baseVal;
    const head = viewBox ? stroke.getPointAtLength(0).y / viewBox.height : 0;

    let ticking = 0;

    const measure = () => {
      ticking = 0;

      const H = window.innerHeight;
      const top = section.getBoundingClientRect().top;

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

      /* The stroke's own clock, and it starts where the stroke does.
       *
       * It used to be read from the section's top edge, which is not where the
       * drawing begins: the line starts a quarter of the way down its own box,
       * so by the time the reader could see the first stroke about a fifth of
       * the path was already down. The pen appeared to have been at work
       * off-screen.
       *
       * Zero when that first point is at the bottom of the screen — the reader
       * sees the pen touch down — and one a little after it has left the top,
       * so the line finishes before the card lands on top of it. */
      const svg = stroke.ownerSVGElement?.getBoundingClientRect();
      const pen = svg ? svg.top + svg.height * head : top;
      section.style.setProperty('--draw', clamp((H - pen) / (H * 1.05)).toFixed(4));

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
  }, [ref]);

  return (
    <section
      ref={ref}
      id="what-it-does"
      className={`relative min-h-[230svh] overflow-hidden px-[max(2rem,5vw)] pt-[clamp(6rem,14vh,10rem)] pb-[clamp(5rem,12vh,8rem)] ${
        seen ? 'reveal-on' : ''
      }`}
    >
      <Ornament pathRef={strokeRef} />

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
       * The element is already the panel it becomes: the page's own left and
       * right inset, clear of the bar, a screen tall. So the landing is the
       * untransformed element rather than a set of numbers that cancel out.
       *
       * 7rem clears the bar's pill with air to spare, and it is a literal
       * because the bar is `fixed` and takes no space in the flow — there is
       * nothing here that could measure it.
       *
       * Not clipped by the section's `overflow-hidden`: a fixed element's
       * containing block is the viewport, and nothing above it sets a transform
       * or filter that would take that over. */}
      <div
        ref={shellRef}
        className={`fixed inset-x-[max(2rem,5vw)] top-[7rem] bottom-[2rem] z-30 ${
          landed ? '' : 'pointer-events-none'
        }`}
      >
        <div className="card-zoom h-full w-full">
          <DemoFrame
            src={videoSrc}
            playing={playing}
            landed={landed}
            onPlay={() => setPlaying(true)}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The accent stroke, drawn by the scroll.
 *
 * The line was drawn with a mouse and captured verbatim: a long arc in from the
 * left, one closed loop, then a wave that flattens out to the right. `Vector
 * 6.svg` was the first attempt at this and a traced copy of it was the second;
 * both are gone. What replaced them was not a better trace — it was dropping
 * the tracing step, because every version of a line redrawn from a picture of a
 * line loses the thing that made it worth drawing.
 *
 * So the numbers here are ugly on purpose. They are pointer samples, smoothed
 * and thinned to 44 anchors and fitted with a curve that passes *through* each
 * one rather than near it, which is what keeps the cusp where the loop closes.
 * Rounding them to something a reader could scan would be re-drawing it again.
 *
 * The box is the drawing's own: `1117 x 378`, cropped to the stroke with half a
 * weight of air. It is flatter than what it replaced — near 3:1 rather than
 * 2:1 — which is why it reads as something the section is standing on rather
 * than something behind it.
 *
 * The colour is unchanged — `--color-cta-3`, the accent this palette owns.
 *
 * ## Why it is invisible when it is not drawn
 *
 * It was `-z-10` inside a `relative` section. A positioned element with
 * `z-index: auto` does not create a stacking context, so the negative index did
 * not put the stroke behind its own section — it put it behind `<main>`, whose
 * `bg-ground` painted straight over it. The animation had been running the
 * whole time, on an element nobody could see.
 *
 * The layers are explicit now: the stroke behind the media frame, the frame
 * behind the type. It passes behind the frame rather than over it, which is
 * what makes the frame read as an object standing in front of something rather
 * than a picture with a line scribbled across it.
 *
 * ## The draw is the scroll
 *
 * Not a transition that fires on arrival. `--draw` is written from the scroll
 * position every frame, and the dash offset is that fraction of the path's own
 * length, so the line is exactly as far along as the reader is. Scrolling back
 * un-draws it at the same rate, because it was never an event — it is a
 * readout.
 *
 * ## Its own proportions, not the section's
 *
 * It was stretched to the section box with `preserveAspectRatio="none"`, which
 * is the right call for a single sweeping curve and the wrong one for this: the
 * section is most of a tall screen, and forcing a wide drawing into it pulled
 * every loop into an ellipse. The shape stopped being the shape. The ratio is
 * kept and the element is sized instead.
 *
 * **The viewBox is the sheet the line was drawn on, not the line's own bounds.**
 * 960 by 480 is the canvas; the drawing runs past its right edge and stops
 * short of the left, and both of those are the composition. Cropping the box to
 * the ink — which is what the capture tool offers, and what was here before —
 * re-centres the drawing inside its own extents and throws away the fact that
 * it was leaving the frame.
 *
 * So the sheet is the page: the element is `w-full` with no inset and no cap,
 * the sheet's width maps to the section's, and the tail that left the canvas on
 * the right leaves the screen on the right. Everything the artist saw at the
 * moment of drawing holds at every viewport width, because only the scale
 * changed.
 *
 * ## The weight scales with it now
 *
 * `vector-effect="non-scaling-stroke"` is gone, and losing it is a gain rather
 * than a compromise. 45 is the weight the line was drawn at on a 960-wide
 * sheet, so in user units it stays 45/960ths of the page however wide the page
 * is — which is the same relationship the artist was looking at. Pinned to 45
 * screen pixels it was a fixed weight over a curve that scales, so the line got
 * proportionally thinner the wider the monitor, and matched the drawing at
 * exactly one width. The old argument for pinning it was that the weight would
 * otherwise run away; it cannot run anywhere the drawing does not.
 *
 * It also has to go for the dash to work at all — see `Ornament` itself.
 */
function Ornament({ pathRef }: { pathRef: RefObject<SVGPathElement | null> }) {

  /* The dash pattern has to be the path's own length, measured.
   *
   * It used to be `pathLength="1"` with a dash array of `1`, which is the tidy
   * way to write this and was wrong here: the path also carried
   * `vector-effect="non-scaling-stroke"`, and a non-scaling stroke has its dash
   * pattern resolved against the *rendered* line while `pathLength` normalises
   * against the *user-unit* one. The two disagree by whatever the viewBox is
   * being scaled by, so the pattern stopped being exactly one path long and the
   * line came in as dashes instead of arriving from one end.
   *
   * Both are gone. The length is read off the element, in the same user units
   * the dash array is written in, so the pattern is one path long by
   * construction — and it does not need re-reading on resize, because
   * `getTotalLength` measures the geometry rather than the box it is drawn in.
   */
  useEffect(() => {
    const node = pathRef.current;
    if (node) node.style.setProperty('--len', String(node.getTotalLength()));
  }, [pathRef]);

  return (
    <svg
      viewBox="0 0 960 480"
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-10 h-auto w-full"
    >
      <path
        ref={pathRef}
        d="M1.3 120.6C11.9 118.1 43.4 109.7 64.6 105.5C85.7 101.3 109.1 97.8 128 95.5C146.9 93.1 163.8 91.8 178 91.3C192.3 90.9 201.3 91.3 213.6 92.7C225.8 94.1 238.4 96 251.4 99.6C264.4 103.3 279.1 108.8 291.4 114.7C303.7 120.6 315.9 128 325.3 134.8C334.8 141.7 340.6 146.1 348 156C355.5 165.8 364.5 179.4 370.1 194C375.7 208.5 379.3 225.8 381.7 243.5C384 261.1 385.3 282.9 384.1 299.8C382.8 316.7 378.6 333.1 374 345C369.5 357 365.2 363 356.6 371.5C348.1 380 335.5 389.4 322.8 396.1C310.1 402.8 293.6 409 280.6 411.8C267.5 414.5 254.6 413.8 244.5 412.5C234.3 411.2 226.7 407.8 219.4 404.1C212.2 400.5 205.9 395.5 201 390.6C196.1 385.8 193.2 381.6 190.2 375.1C187.2 368.7 184.1 359.5 182.9 351.9C181.7 344.2 181.7 337.4 182.8 329.1C184 320.9 186.6 311.2 189.7 302.5C192.8 293.9 197.1 285.1 201.7 277.3C206.3 269.5 210 263.4 217.3 255.7C224.6 248 233 238.5 245.4 231.2C257.8 223.9 276.9 216.4 291.6 211.8C306.4 207.1 309.1 206.5 333.8 203.3C358.5 200.2 414.5 194.1 439.9 192.8C465.3 191.5 470.2 191.7 486 195.4C501.9 199.1 520 205.4 535.1 214.9C550.2 224.4 557 231.6 576.6 252.5C596.1 273.4 636.6 323 652.6 340.1C668.7 357.2 666.2 351.1 672.8 354.9C679.5 358.7 685.2 361.1 692.3 362.7C699.5 364.3 708 365.2 715.8 364.5C723.6 363.7 722.4 367.6 739.3 358.2C756.1 348.8 797.7 318.4 816.8 308C835.8 297.7 840.5 297.5 853.7 296.2C866.9 295 876.9 294.7 896.1 300.5C915.2 306.3 950 324.5 968.6 331.1C987.2 337.7 998.7 338.4 1007.6 340.1C1016.6 341.8 1013.3 342.3 1022.3 341.4C1031.3 340.6 1055.2 335.9 1061.8 334.8"
        fill="none"
        stroke="var(--color-cta-3)"
        strokeWidth="45"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-stroke"
      />
    </svg>
  );
}

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
  playing,
  landed,
  onPlay,
}: {
  src?: string;
  playing: boolean;
  landed: boolean;
  onPlay: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-[#0b0d10]">
      {src && (
        <video
          ref={video}
          src={src}
          playsInline
          controls={playing}
          className="h-full w-full object-cover"
        />
      )}

      {/* Nothing over the video once it is running. */}
      {!playing &&
        (src ? (
          /* `disabled` rather than only `pointer-events-none` on the shell: a
             pointer can be told to pass through an element, a keyboard cannot,
             and a control the page has not offered yet should not be reachable
             by tab either. */
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
        ) : (
          /* No video, so no invitation to play one. The reveal is the same
             clock and the same position; only the sentence changes, because a
             `PLAY` control over a card with nothing behind it is a button that
             lies. */
          <p className="reel-in absolute inset-0 flex items-center justify-center font-mono text-fine tracking-[0.12em] text-faint uppercase">
            The recorded run lands here
          </p>
        ))}
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
