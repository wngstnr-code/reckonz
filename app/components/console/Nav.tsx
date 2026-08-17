'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet } from '../Wallet';
import { HealthStatus } from './HealthStatus';
import { Wordmark } from './Wordmark';

/**
 * The console's one piece of persistent chrome.
 *
 * Built to the proportions of Ondo's, which is the reference the design owner
 * picked: a tall bar, the mark alone on the left with a wide gap before the
 * links, sentence-case sans links at reading size rather than mono capitals,
 * and utilities pushed to the right edge.
 *
 * Sans here does not contradict the mono-first rule. Mono is for anything
 * measured, because a number that does not line up in a column is a number
 * nobody can compare. A navigation label is prose, and setting prose in
 * monospaced capitals at 11px is how a tool ends up unreadable at the exact
 * moment it should be welcoming.
 *
 * Three things in the reference were deliberately not copied, each because it
 * would cost something the product cannot spare:
 *
 *  - **The search and globe buttons.** We have neither search nor a second
 *    language. A control that does nothing is the one kind of dishonesty this
 *    console has a rule against.
 *  - **The solid primary button.** Ondo's is Sign Up, and there is nothing to
 *    sign up for here: no accounts, no custody. Making Connect Wallet the solid
 *    one would put the loudest control on the page in front of the visitor
 *    least likely to want it, which is what we removed a day ago.
 *  - **The mark without the wordmark.** Ondo can drop its name because people
 *    know the logo. Nobody knows ours yet.
 *
 * Four destinations, in the order the product is meant to be understood: what
 * the guard says right now, write your own idea, what actually happened on
 * chain, and only then the surface that spends money.
 */

/**
 * One word each, and everyday words where there is one.
 *
 * `Receipts` rather than `Theses` or `Proof`: everybody already knows what a
 * receipt is, the page is literally a list of them, and the honesty lands on
 * its own instead of being asserted. `Verdict` keeps its home as a column
 * heading on the assets table, which is where it is doing real work.
 *
 * The paths match the labels, which is not tidiness for its own sake: a single
 * asset opens at `/assets/wNVDAx`, so the board is its parent rather than a
 * second address for the same subject.
 */
const LINKS = [
  { href: '/assets', label: 'Assets' },
  { href: '/idea', label: 'Idea' },
  { href: '/receipts', label: 'Receipts' },
  { href: '/trade', label: 'Trade' },
] as const;

export function Nav() {
  // Not sticky: the bar sits at the top of the document and scrolls away with
  // it. Nothing ever passes underneath, so there is no translucency and no
  // blur to pay for either.
  //
  // No bottom rule, and now nothing is holding one up — the separation is the
  // whitespace under the bar rather than a line, which is one less thing
  // cutting the page into strips.
  return (
    <header className="bg-ground">
      <div className="mx-auto flex h-[72px] w-full max-w-[1920px] items-center px-6 md:px-[78px]">
        <Wordmark className="mr-20" />

        <nav className="hidden items-center gap-14 md:flex">
          <NavLinks />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-5">
          <HealthStatus />
          <Wallet />
        </div>
      </div>

      {/* Below `md` the links take a row of their own and scroll sideways if
          they must. No hamburger: it hides four short words that fit, and
          charges a tap for something that never needed hiding. */}
      <nav className="mx-auto flex w-full max-w-[1920px] items-center gap-11 overflow-x-auto px-6 pb-3 md:hidden">
        <NavLinks />
      </nav>
    </header>
  );
}

function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => {
        // `startsWith` so `/assets/wNVDAx` keeps Assets lit.
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 text-[15px] font-semibold transition-colors duration-200 ${
              active ? 'text-ink' : 'text-dim hover:text-ink'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
