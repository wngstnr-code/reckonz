'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * Two shots of one page, and a bar each.
 *
 * The frame used to hold a single picture, and a single picture of a page like
 * `Trade` has to choose between the mandate and the quote box. Two of them, one
 * after the other, is the smallest thing that shows a page has more than one
 * screen in it without asking the reader to click anything.
 *
 * ## The bars are the clock, not a decoration
 *
 * One per shot, under the frame: filled for the ones already seen, filling for
 * the one on screen, empty for the ones to come. A dot row would say which of
 * the two is showing and nothing else; a bar that fills says how long is left,
 * which is what a reader waiting for the second one needs.
 *
 * They are buttons as well. The progress bar of a thing that advances by itself
 * is the control people reach for, and a bar that looks like one and does
 * nothing is worse than a plain line. Clicking one jumps to that shot.
 *
 * ## Pointing at it stops it
 *
 * A reader who has put the pointer on a picture is reading that picture, and
 * taking it away mid-sentence is the carousel's oldest insult.
 *
 * **Both clocks stop, or neither is honest.** The bar is a CSS animation and
 * the advance is a `setTimeout`, and they are two clocks measuring one thing.
 * Pausing only the animation leaves a bar frozen while the picture changes
 * underneath it; pausing only the timer leaves a bar that fills and then waits.
 * So the pause banks what is left of the timer and the animation holds its
 * position, and the resume gives the timer exactly that remainder while the
 * animation carries on from where it stopped. That is the whole reason
 * `remaining` is a ref and not a piece of state.
 *
 * ## What it does not do
 *
 * **Nothing runs until the card has arrived.** `armed` comes from the row's own
 * `useInView`, so four cards do not sit below the fold cycling through eight
 * images at a reader who is still at the top of the page.
 *
 * **Nothing moves for a reader who asked for less motion.** `prefers-reduced-
 * motion` stops the advance and fills the current bar instantly rather than
 * animating: the bars still say which shot is up and the buttons still work, so
 * the second picture is reachable rather than merely absent. An auto-advancing
 * carousel is one of the few things that guideline names outright.
 */

/** Long enough to read a screenshot at this size, short enough that the second
 *  one arrives while the reader is still looking at the card. */
const HOLD_MS = 4200;

export interface Shot {
  src: string;
  alt: string;
}

export function Slides({ shots, armed }: { shots: Shot[]; armed: boolean }) {
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(false);
  const [held, setHeld] = useState(false);
  /** False until the first change. The opening shot arrives with the frame's
   *  own `frame-open`, and two clip animations on one box at the same moment
   *  read as a stutter rather than as an arrival. */
  const [moved, setMoved] = useState(false);

  /** What is left of this shot's hold. A ref rather than state: the pause reads
   *  and writes it inside an effect's cleanup, and a re-render there would
   *  restart the very timer being measured. */
  const remaining = useRef(HOLD_MS);
  const startedAt = useRef(0);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setStill(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  // A new shot gets a whole hold. Declared before the timer below so that on a
  // change of index it runs first and the timer is scheduled with the full
  // duration rather than with what was left of the last one.
  useEffect(() => {
    remaining.current = HOLD_MS;
  }, [index]);

  useEffect(() => {
    if (!armed || still || held || shots.length < 2) return;

    startedAt.current = Date.now();
    const timer = window.setTimeout(() => {
      setMoved(true);
      setIndex((i) => (i + 1) % shots.length);
    }, remaining.current);

    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [index, armed, still, held, shots.length]);

  return (
    // Pointer and keyboard both hold it. A reader tabbing along the bars is
    // choosing between them, which is the same act as reading the picture.
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      {/* Dark in both themes, and a literal rather than a token, for the reason
          the hero's wall is: this is a ground that pictures are lit against, and
          a ground that turns white in light mode takes the light with it.

          `relative` is what `Image fill` measures against. */}
      <div className="frame-open relative aspect-[16/10] w-full overflow-hidden rounded-[1.25rem] bg-[#0b0d10]">
        {/* ## Why this is a wipe and not a crossfade
         *
         * It was a crossfade first, and a crossfade of two pictures over a black
         * frame dips through a moment where both are half transparent and the
         * frame's own black shows through both. That dip is the flicker: the
         * shot does not change, it blinks.
         *
         * A wipe never lowers anything's opacity. Every shot stays fully opaque
         * for its whole life; the incoming one is simply uncovered on top of the
         * one already there, so there is no instant at which the reader is
         * looking at less than a complete picture.
         *
         * It is also the motion this page already speaks. The frame around it
         * opens by `clip-path` and the headings roll out of masks — a fade would
         * be the one thing here that dissolves rather than arrives, on the same
         * `cubic-bezier(0.16, 1, 0.3, 1)` everything else lands on.
         *
         * All of them stay mounted. Swapping one element's `src` would show the
         * frame's black for however long the next file takes to decode, which is
         * the flicker again by a different route.
         */}
        {shots.map((shot, i) => (
          <Image
            key={shot.src}
            src={shot.src}
            alt={shot.alt}
            fill
            sizes="(min-width: 1024px) 46vw, 92vw"
            /* The active shot sits above the last one rather than replacing it,
               so what it uncovers is a real picture and never the ground.

               `object-top` rather than centred: these are screenshots, and the
               head of a page is the half worth keeping when a 5:3 capture is
               cropped into a 16:10 frame. */
            className={`object-cover object-top ${i === index ? 'z-10' : 'z-0'} ${
              i === index && moved && !still ? 'shot-in' : ''
            }`}
            style={{ animationPlayState: held ? 'paused' : 'running' }}
          />
        ))}
      </div>

      {/* Under the frame rather than over it: these sit on the page's own
          ground, so they take page tokens and survive the theme swap. A bar laid
          over the picture would need a colour that works on every screenshot,
          which is a colour that works on none of them.

          `bg-ink`, not a literal black. The bar is the page's ink and the page
          has two themes: a hardcoded `#000` is a black line that disappears into
          a dark ground, which is the mistake D101 keeps re-teaching. On the
          light theme it is the near-black that was asked for. */}
      {shots.length > 1 && (
        <div className="mt-[clamp(0.75rem,1.1vw,1.1rem)] flex gap-2">
          {shots.map((shot, i) => (
            <button
              key={shot.src}
              type="button"
              onClick={() => {
                setMoved(true);
                setIndex(i);
              }}
              aria-label={shot.alt}
              aria-current={i === index}
              /* The bar is 2px; the target is not. `py-2` gives the pointer and
                 the finger something to hit while the line stays a line. */
              className="flex-1 cursor-pointer py-2"
            >
              <span className="block h-[2px] w-full overflow-hidden rounded-full bg-line">
                <span
                  /* Remounted whenever the shot changes, which is what restarts
                     the animation — a CSS animation does not replay because a
                     class came back. */
                  key={`${i}-${index}`}
                  className={`block h-full w-full origin-left rounded-full bg-ink ${
                    i === index && !still ? 'slide-fill' : ''
                  }`}
                  style={{
                    animationDuration: `${HOLD_MS}ms`,
                    animationPlayState: held ? 'paused' : 'running',
                    // The ones already seen stay full; the ones to come stay
                    // empty. The animation overrides this on the active one.
                    transform: i < index || (i === index && still) ? 'scaleX(1)' : 'scaleX(0)',
                  }}
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
