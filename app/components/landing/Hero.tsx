import { AssetWall } from './AssetWall';

/**
 * The claim, and the wall that has to back it up.
 *
 * **The claim belongs to the page, not to the bar.** It sits level with the
 * mark and set in from it — the reference's position exactly — but it is not
 * inside `TopBar` and does not stay when the page moves. A bar is chrome and
 * chrome persists; a claim is content and content scrolls. They only look like
 * one row because they start on the same line.
 *
 * That is also why nothing here reserves space for the bar. `TopBar` is fixed,
 * so it takes none, and the claim can begin at the same distance from the top
 * that the mark does rather than under it.
 *
 * The insets are what keep the two apart without either measuring the other:
 * the left one clears the mark, the right one stops short of the pills. They
 * are generous on purpose — a claim that has to be re-tuned every time a button
 * gets a longer label is a layout waiting to break.
 *
 * **The wall takes whatever is left.** One viewport, laid out as a column: the
 * claim takes what the type needs and the frame absorbs the remainder, so the
 * copy can grow without anybody re-deriving a canvas height and
 * `Scroll to explore` still lands on the fold.
 */
export function Hero({ symbols }: { symbols: string[] }) {
  return (
    <section className="flex min-h-screen flex-col px-[max(2rem,5vw)] pt-10 pb-5">
      {/* `28ch` rather than a guess. The measure is set from what the last one
          actually produced: at `34ch` this face fitted about 48 characters to a
          line, so `ch` here buys roughly 1.4 characters — and three lines of a
          110-character sentence needs 37 of them, which lands at 28. */}
      {/* `data-hero-claim` is what `TopBar` watches. The bar takes a background
          only once this sentence has left the window, so the mark is the one
          finding the element rather than either component knowing the other's
          layout. */}
      <p
        data-hero-claim
        className="ml-[calc(16rem+4vw)] max-w-[28ch] text-[clamp(1.6rem,2.5vw,2.6rem)] leading-[1.18] font-medium tracking-[-0.015em] text-ink"
      >
        Thirty stocks are tokenised on X Layer. We measure what each market can
        take at your size, and refuse the rest.
      </p>

      {/* Dark in both themes, and painted with a literal rather than a token:
          this surface is not part of the light/dark ladder. It is the ground the
          tiles are lit against, and a ground that turns white in light mode
          takes the light with it. */}
      {/* `flex` is load-bearing. This box takes its height from `flex-1`, and a
          block box computed that way does not give a percentage-height child
          anything to resolve against: `AssetWall`'s `h-full` fell back to auto
          and the wall sat at its content height, leaving 141px of dead ground
          under the last row at 1710x957. As a flex container it stretches the
          wall to the full card instead, and the wall divides that height
          between its rows. */}
      <div className="mt-[clamp(2rem,5vh,3.5rem)] flex min-h-[22rem] flex-1 overflow-hidden rounded-[2rem] bg-[#0b0d10]">
        <AssetWall symbols={symbols} />
      </div>

      <p className="mt-4 text-center font-mono text-fine tracking-[0.12em] text-faint uppercase">
        Scroll to explore
      </p>
    </section>
  );
}
