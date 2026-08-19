import Link from 'next/link';
import { Logo } from '../console/Logo';
import { Menu } from './Menu';

/**
 * The name and the two actions, and nothing else.
 *
 * ## Why it is `fixed` rather than `sticky`
 *
 * A sticky element only sticks for as long as its parent is on screen, so a bar
 * that must survive the whole page has to be a direct child of something that
 * spans the whole page — and then it takes a row of that page's flow, which
 * pushes everything under it down. The claim would no longer be able to sit
 * level with the mark, which is the one thing the layout was drawn around.
 *
 * `fixed` takes no space at all. The bar sits over the page, the claim beside
 * it belongs to the page and scrolls away like the rest of it, and neither has
 * to know about the other.
 *
 * ## Why there is no background across it
 *
 * A full-width bar painted `ground` would be the thing the claim disappears
 * *behind* — and at rest it would be painted over the claim, because a fixed
 * element sits above everything under it. Both problems are the same problem:
 * the bar is not a strip, it is two objects at two edges with an empty middle,
 * and the claim scrolls up through that middle without ever meeting them.
 *
 * So each object carries its own surface instead. The pills already had one.
 * The mark gets one here — invisible on the white page, and the thing that
 * keeps it readable once the dark wall has scrolled up behind it.
 */
export function TopBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between gap-x-8 px-[max(2rem,5vw)] pt-10">
      <Link
        href="/"
        className="pointer-events-auto flex shrink-0 items-center gap-3 rounded-full bg-ground py-2 pr-5 pl-4"
      >
        {/* Mint, as everywhere else the mark appears. The wordmark beside it
            takes the page's ink, so the mark is the only coloured thing in the
            row and stays the thing the eye lands on first. */}
        <Logo className="h-9 w-auto text-signal" />
        <span className="font-logo text-[30px] leading-none font-semibold tracking-[0.02em] text-ink uppercase">
          Reckonz
        </span>
      </Link>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2.5">
        {/* The arrow arrives rather than sitting there.
         *
         * At rest the pill is a label; on approach it becomes a direction. An
         * arrow parked in the button all along says the same thing at every
         * moment and so stops saying anything, and it costs the width of a glyph
         * on the widest row of the page.
         *
         * `overflow-hidden` is what makes it a slide rather than a fade: the
         * arrow starts outside the pill's own edge and is clipped by it, so it
         * enters from off the control instead of materialising inside it.
         *
         * The fill goes to `frame` rather than to `signal`. That is the contrast
         * decision D101 keeps re-teaching: white on `signal` is about 3.4:1 and
         * this label is 13.5px, while `--color-frame` is the green this palette
         * derived specifically to carry white copy — 8.04:1, and the same hue. */}
        <Link
          href="/assets"
          className="group relative flex h-11 items-center overflow-hidden rounded-full bg-ink pr-7 pl-7 text-[13.5px] font-semibold tracking-[0.06em] text-ground uppercase transition-colors duration-300 hover:bg-frame"
        >
          <span
            aria-hidden
            className="absolute left-6 -translate-x-5 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path
                d="M2 8h11M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <span className="transition-transform duration-300 ease-out group-hover:translate-x-3.5">
            Launch app
          </span>
        </Link>

        <Menu />
      </div>
    </div>
  );
}
