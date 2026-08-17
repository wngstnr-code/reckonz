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
  /** `lg` is the same mark 20% up, for the footer, where it stands alone on a
   *  row of its own rather than sharing a bar with four links. */
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const lg = size === 'lg';
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
