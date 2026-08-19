'use client';

import { useEffect, useState } from 'react';

import { useInView } from './useInView';

/**
 * The third screen: the four surfaces the product is actually made of.
 *
 * The reference is a studio's work index — a display heading, a small block of
 * caption type held at the far right of the same line, and pieces of media two
 * to a row with their credits underneath. What is borrowed is the composition,
 * not the content: a work index lists clients, and this lists the four pages a
 * reader can go and check for themselves.
 *
 * The reference's credit row — `CONCEPT • WEB • DESIGN • …` — is gone. It is a
 * studio saying what it was hired to do, and there is no equivalent here that
 * would not be filler. What is left under each card is a name and one line
 * saying what that page is for.
 *
 * ## Why all four, and in this order
 *
 * A section called *how it works* that showed none of the app would be
 * describing a process rather than pointing at it. So it points at every page
 * there is.
 *
 * The first row is the pair that carries the claim on its own — `Assets` is
 * what the chain can take before the price moves, `Receipts` is what happened
 * when somebody took it — and a reader who stops after one row has still been
 * told the whole thing. The second row is the two surfaces that do the work
 * between those ends. It reads as evidence first and mechanism second, which is
 * the right way round for a page that is asking to be believed.
 *
 * ## The arrivals
 *
 * Five of them, and every one is an entrance only — nothing here reverses on
 * the way out, because the section is read once on the way past rather than
 * scrubbed. They replay whenever it is left and re-entered from either
 * direction, which is a property of `useInView` rather than of anything here:
 * the observer is never disconnected, so the class goes away when the section
 * does and a CSS animation restarts when its class comes back.
 *
 * **Three starts, one reset.** The heading and its caption start when the
 * section arrives; each row of cards starts when that row does, off its own
 * observer — the section is well over a screen tall, so one start would have
 * spent most of the entrances below the fold. All of them are armed again by
 * the same thing, the section leaving, because anything that reset on its own
 * way out took itself down while the heading was still on screen.
 *
 *  - the heading rises out of its mask a letter at a time,
 *  - the caption beside it drops into place from above,
 *  - both frames open from their own centres, at the same moment,
 *  - each name rolls past itself three times and stops,
 *  - each line under it slides in sideways.
 *
 * The frames open by clipping, not by scaling. The picture inside is at its
 * final size from the first frame and the frame uncovers it, so nothing in the
 * image is ever stretched or soft on the way in — which is the difference
 * between a frame that opens and a photograph that grows.
 */

const HEADING = 'How It Works';

/**
 * The four pages of the app, in the order a reader meets them here.
 *
 * One line each, and the smaller size is what makes them lines rather than
 * paragraphs. Every line is the page's own `description` cut to length — if one
 * of them stops being true, the page said so first.
 *
 * The rows are rows because they arrive separately, not because they mean
 * different things. Two by two is simply how many fit across.
 */
const ROWS = [
  [
    {
      title: 'Assets',
      line: 'Thirty tokenised stocks, each sized against the depth that has to absorb it.',
      src: undefined as string | undefined,
    },
    {
      title: 'Receipts',
      line: 'Every fill leaves evidence anyone can re-derive from the chain.',
      src: undefined as string | undefined,
    },
  ],
  [
    {
      title: 'Idea',
      line: 'Write it in plain words; the chain answers with what it will refuse.',
      src: undefined as string | undefined,
    },
    {
      title: 'Trade',
      line: 'You set the bounds, the chain enforces them, and no key of ours moves money.',
      src: undefined as string | undefined,
    },
  ],
];

export function HowItWorks() {
  const { ref, seen } = useInView<HTMLElement>('-18% 0px');

  return (
    <section
      ref={ref}
      id="how-it-works"
      className={`px-[max(2rem,5vw)] pt-[clamp(5rem,12vh,9rem)] pb-[clamp(5rem,12vh,9rem)] ${
        seen ? 'reveal-on' : ''
      }`}
    >
      {/* The heading and the caption share a line, at opposite ends of it. The
          caption is held to the top of that line rather than to the heading's
          baseline — the reference's own alignment, and the thing that keeps a
          15px block from looking like it is trying to be part of a 130px one. */}
      <div className="flex flex-col gap-[clamp(1.5rem,3vw,3rem)] lg:flex-row lg:items-start lg:justify-between">
        <h2
          aria-label={HEADING}
          className="text-[clamp(3rem,8.6vw,8.2rem)] leading-[1.02] font-medium tracking-[-0.03em] text-ink"
        >
          <Letters text={HEADING} />
        </h2>

        {/* Uppercase and small, so it reads as a note on the heading rather
            than as the first paragraph of the section. `lg:mt` pushes it clear
            of the cap line: level with the top of the type, not with the top of
            the box the type sits in. */}
        <p className="drop-mask max-w-[36ch] lg:mt-[clamp(0.75rem,1.6vw,1.75rem)] lg:text-right">
          <span className="block text-[clamp(0.8rem,0.95vw,0.95rem)] leading-[1.5] font-medium tracking-[0.04em] text-ink uppercase lg:text-left">
            A thesis is mapped onto what X Layer can actually absorb, sized against live pool depth,
            and bounded on chain before any of it is filled.
          </span>
        </p>
      </div>

      {ROWS.map((row, i) => (
        <CardRow key={i} cards={row} armed={seen} first={i === 0} />
      ))}
    </section>
  );
}

/**
 * A pair of cards, on its own clock.
 *
 * ## Why the row watches itself
 *
 * The section is taller than a screen, so a reader who has just met the heading
 * is still most of a screen above the first row and two above the second.
 * Running everything off the section's own observer meant the frames opened and
 * the names rolled while nobody was looking at them, and what arrived at the
 * fold was a finished picture. Each row watches itself instead.
 *
 * ## Why it is reset by something else
 *
 * Playing and re-arming are not the same question, and using one answer for
 * both was the defect: a row leaves the screen well before the section does, so
 * the frames snapped shut and the names rolled back while the heading was still
 * sitting there. What the reader saw was the cards being taken away rather than
 * the section being left.
 *
 * So the row decides when it plays and `armed` — the section's own visibility —
 * decides when it can play again. Everything in the section now resets at one
 * moment, which is the moment the section is no longer on screen.
 */
function CardRow({
  cards,
  armed,
  first,
}: {
  cards: { title: string; line: string; src?: string }[];
  armed: boolean;
  first: boolean;
}) {
  /* A positive margin, so the row starts before it arrives.
   *
   * `useInView` defaults to pulling the trigger line *up* from the bottom edge,
   * which is right for a block that should not begin its entrance on its first
   * pixel. It is wrong for this one: the frames start at 70% of themselves, so
   * that first pixel is already a card the reader can see, and a trigger a fifth
   * of a screen further in meant watching it sit there and then open.
   *
   * 12% pushes the line the other way, below the fold. By the time the top edge
   * of the row is on screen the animation is a hundred milliseconds in, which is
   * the difference between a card that arrives open and a card that opens once
   * you are looking at it. */
  const { ref, seen } = useInView<HTMLDivElement>('12% 0px');
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (seen) setOn(true);
    else if (!armed) setOn(false);
  }, [seen, armed]);

  return (
    <div
      ref={ref}
      /* The rows are further apart than the columns are, because a column gap
         separates two frames and a row gap separates a caption from the frame
         under it. Equal numbers would read as unequal space. */
      className={`grid gap-[clamp(1.5rem,2.6vw,2.75rem)] lg:grid-cols-2 ${
        first ? 'mt-[clamp(2.5rem,6vw,4.5rem)]' : 'mt-[clamp(2.5rem,4.5vw,4rem)]'
      } ${on ? 'cards-on' : ''}`}
    >
      {cards.map((card) => (
        <Card key={card.title} {...card} />
      ))}
    </div>
  );
}

/**
 * The heading, one letter at a time out of one mask each.
 *
 * Split by word first and by letter inside it, so a narrow screen still breaks
 * where a reader expects — a flat list of letters would wrap mid-word.
 *
 * **The letters are `aria-hidden` and the name is on the heading.** A screen
 * reader handed twelve one-character elements announces twelve characters.
 * `aria-label` on an `h2` is read instead of its contents, which is exactly the
 * trade here: the visible text is a composition, the accessible name is a
 * string.
 *
 * The masks clip at the line box, so a descender in a heading set this tight
 * would be cut. `How It Works` has none; a heading that does would need the
 * mask to be given the room instead.
 */
function Letters({ text }: { text: string }) {
  let index = 0;

  return (
    <span aria-hidden className="inline-flex flex-wrap">
      {text.split(' ').map((word, w, words) => (
        <span key={w} className="inline-flex whitespace-nowrap">
          {[...word].map((character, c) => {
            const delay = index++ * 38;
            return (
              <span
                key={c}
                className="letter-mask"
                style={{ ['--rise-delay' as string]: `${delay}ms` }}
              >
                <span>{character}</span>
              </span>
            );
          })}
          {w < words.length - 1 && <span className="inline-block w-[0.24em]" />}
        </span>
      ))}
    </span>
  );
}

/**
 * One surface: a frame that opens, a name that rolls, a line that slides in.
 *
 * The three overlap rather than queue: the name starts while the frame is
 * still opening and the line while the name is still rolling, so it reads as
 * one arrival with three parts rather than three things taking turns. Both
 * cards run the same numbers — the pair opens together, and nothing
 * distinguishes the left one from the right one in time.
 */
function Card({ title, line, src }: { title: string; line: string; src?: string }) {
  return (
    <figure>
      {/* Dark in both themes, and a literal rather than a token, for the reason
          the hero's wall is: this is a ground that pictures are lit against,
          and a ground that turns white in light mode takes the light with it. */}
      <div className="frame-open aspect-[16/10] w-full overflow-hidden rounded-[1.25rem] bg-[#0b0d10]">
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-end p-6">
            <span className="font-mono text-fine tracking-[0.12em] text-faint uppercase">
              {title} lands here
            </span>
          </div>
        )}
      </div>

      <figcaption className="mt-[clamp(1rem,1.6vw,1.5rem)]">
        {/* Four copies of one word in a one-line box. The track travels three
            of them, so the name goes past itself three times and stops on the
            fourth — which is the same word, so what the reader sees is a name
            arriving rather than a list of names being picked from. */}
        <span className="roll-mask text-[clamp(1.75rem,3vw,2.9rem)] leading-[1.15] font-medium tracking-[-0.02em] text-ink">
          <span className="roll-track">
            {[0, 1, 2, 3].map((copy) => (
              <span key={copy} aria-hidden={copy !== 3} className="block">
                {title}
              </span>
            ))}
          </span>
        </span>

        {/* The name's colour, not a quieter one. It is one line under a name,
            close enough to read as part of it — and a second tone at that
            distance would make it look like a caption that had drifted up
            rather than a line that belongs to the word above it.

            Shrunk to its own text rather than to the column, so a longer line
            runs on to the right instead of wrapping — and so the mask that
            hides it is the width of the words rather than the width of the
            card. */}
        <span className="side-mask mt-[clamp(0.5rem,0.8vw,0.85rem)] text-[clamp(0.9rem,1.05vw,1.05rem)] leading-[1.5] text-ink">
          <span>{line}</span>
        </span>
      </figcaption>
    </figure>
  );
}
