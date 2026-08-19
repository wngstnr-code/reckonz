'use client';

import { useInView } from './useInView';

/**
 * The last screen: one sentence, and an invitation inside it.
 *
 * Three lines at display size, hard against the left margin, and nothing else
 * on the screen. Every section before this one is making an argument; this one
 * stops arguing. A closing statement that also carried a diagram, a stat or a
 * second column would be the page admitting it had not finished making its
 * case.
 *
 * **Broken by hand, and the breaks are the sentence.** `Start with a sentence`
 * is the whole invitation; the two lines under it are what the reader gets back
 * for taking it. A wrapper deciding where to break would land those somewhere
 * else and the three lines would stop being three statements.
 *
 * ## The move, in two parts
 *
 * The words rise out of their masks one at a time, left to right and top to
 * bottom, which is reading order — so the line assembles at roughly the speed
 * it is being read.
 *
 * Then each line, once its own words have landed, shifts a little to the right.
 * That second move is the point of the whole thing. It is small, it is late,
 * and it is per line, so what the reader sees is type that has arrived and then
 * settled rather than type that stopped dead on its mark. A page whose last
 * gesture is a hard stop reads as having run out; one that gives a little at
 * the end reads as having been placed.
 *
 * Both parts replay whenever the section is left and re-entered, from either
 * direction, for the reason every other entrance on this page does: `useInView`
 * never disconnects its observer, so the class goes away with the section and
 * a CSS animation restarts when its class comes back.
 */

/** Three lines, and no more than three: this is a closing, not a paragraph. */
const LINES = ['Start with a sentence.', 'End with a receipt', 'anyone can check.'];

/** One word every 70ms. Slower than the per-letter heading, because a word is
 *  a thing to read and a letter is only a thing to see. */
const PER_WORD = 70;

export function Closing() {
  const { ref, seen } = useInView<HTMLElement>('-15% 0px');

  let word = 0;

  return (
    <section
      ref={ref}
      id="start"
      className={`flex min-h-screen items-center px-[max(2rem,5vw)] py-[clamp(5rem,14vh,10rem)] ${
        seen ? 'reveal-on' : ''
      }`}
    >
      <h2
        aria-label={LINES.join(' ')}
        className="text-[clamp(3rem,8.6vw,8.2rem)] leading-[1.02] font-medium tracking-[-0.03em] text-ink"
      >
        {LINES.map((text, line) => {
          const words = text.split(' ');
          /* The line waits for its own last word rather than for the whole
             block, so the shift cascades down the lines by itself instead of
             being staggered by a second number that would have to be kept in
             step with this one. */
          const settle = (word + words.length - 1) * PER_WORD + 620;

          return (
            <span
              key={line}
              aria-hidden
              className="line-settle block"
              style={{ ['--settle-delay' as string]: `${settle}ms` }}
            >
              {words.map((w) => {
                const delay = word++ * PER_WORD;
                return (
                  <span
                    key={w + delay}
                    className="inline-mask"
                    style={{ ['--rise-delay' as string]: `${delay}ms` }}
                  >
                    <span>{w}</span>
                    {/* Inside the mask, so it travels with the word it follows.
                        Outside it, the gaps would be the only part of the line
                        already in place while the words were still arriving. */}
                    <span className="inline-block w-[0.26em]" />
                  </span>
                );
              })}
            </span>
          );
        })}
      </h2>
    </section>
  );
}
