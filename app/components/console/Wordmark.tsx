import Link from 'next/link';
import { Logo } from './Logo';

/**
 * The mark and the name, together, in one place.
 *
 * They were written out twice — once in the nav, once in the footer — and the
 * footer was still setting the name in the body face a change later. Two copies
 * of a logo is one copy that quietly stops being the logo.
 *
 * Uppercase at regular weight, which is a specific choice rather than a default:
 * capitals at 400 read as a mark, capitals at 700 read as shouting, and the
 * tally strokes beside it are already doing the work a heavy weight would.
 * Tracking opens up because uppercase letterforms need the air.
 */
export function Wordmark({
  className,
  /**
   * `lg` is the same mark 20% up, for the console footer, where it stands
   * alone on a row of its own rather than sharing a bar with four links.
   *
   * `display` is the landing footer's, and it is a different kind of size
   * rather than a bigger one: the mark stops being a label on a row and becomes
   * the thing the page ends on. Which is why it is the one size measured in
   * `em` — the tally strokes are given a height relative to the name beside
   * them, so the lockup holds together at any width instead of at the one
   * width somebody checked.
   */
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg' | 'display';
}) {
  const lg = size === 'lg';
  const display = size === 'display';

  if (display) {
    return (
      <Link
        href="/assets"
        className={`flex items-center gap-[0.1em] text-[clamp(3rem,12.5vw,12rem)] transition-opacity duration-200 hover:opacity-80 ${className ?? ''}`}
      >
        <Logo className="h-[0.92em] w-auto shrink-0 text-signal" />
        <span className="font-logo leading-none font-normal tracking-[0.02em] uppercase">
          Reckonz
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/assets"
      className={`flex shrink-0 items-center gap-3 transition-opacity duration-200 hover:opacity-80 ${className ?? ''}`}
    >
      <Logo className={`w-auto text-signal ${lg ? 'h-[29px]' : 'h-6'}`} />
      <span
        className={`font-logo leading-none font-normal tracking-[0.08em] uppercase ${
          lg ? 'text-[20px]' : 'text-[17px]'
        }`}
      >
        Reckonz
      </span>
    </Link>
  );
}
