'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { RollingLabel } from './RollingLabel';

/**
 * The one navigation control on the landing page.
 *
 * ## The list is what exists, not what is planned
 *
 * A menu is a set of promises, and an entry pointing at a section nobody has
 * built yet is the exact thing `Nav.tsx` has a rule against: a control that
 * does nothing. So `SECTIONS` holds what a visitor can actually reach today,
 * and the entries below it are written out, commented, in the order they are
 * meant to arrive. Building a section is then one line here rather than a
 * search for wherever the menu lives.
 *
 * ## And it holds only what the bar does not
 *
 * `Launch app` was in here as well as in the pill beside this button, which is
 * a page offering the same door twice within an inch of itself. The bar's is
 * the one that stays: it is visible without being opened, and it is the only
 * entry on the landing page that leaves the landing page. What is left in here
 * is the page's own sections — which is what a reader opens a menu for.
 *
 * ## The dots
 *
 * They turn a quarter on hover. The reference's do the same, and it is a better
 * hover than a colour change for the same reason a caret rotating is better
 * than a caret changing colour: it says *this opens* rather than *this is under
 * the cursor*.
 *
 * ## What an entry does when it is approached
 *
 * The words roll over, and a pale green field grows in behind them. Neither
 * touches the type's colour, deliberately: the ink is already the darkest thing
 * on a white panel, so any change to it is a change downward in contrast, and a
 * highlight that makes its own label harder to read is not a highlight.
 *
 * The field fades **and** scales. Opacity alone appears without arriving, which
 * on a shape this large reads as a flash; growing the last few percent as it
 * comes in gives it a direction and settles it under the word.
 *
 * ## Opening and closing are two animations, not one played backwards
 *
 * In: up from below, blurred, leaning 30 degrees about Z — in the plane of the
 * screen — and settling upright. Out: back down, blurred again, to the same 30
 * degrees it came from. A pendulum swinging up to square and falling back,
 * rather than a card that spins past level on the way out.
 *
 * That is also why the panel stays mounted for a moment after the state says
 * closed. React would otherwise remove the node on the same tick and there
 * would be nothing left on screen to animate out.
 */

interface Section {
  href: Route;
  label: string;
}

const SECTIONS: Section[] = [
  { href: '/landing' as Route, label: 'Home' },
  { href: '#what-it-does' as Route, label: 'What it does' },
  { href: '#how-it-works' as Route, label: 'How it works' },

  /* Waiting on its section, and it becomes one line above the moment the
     anchor it names exists on the page:

       { href: '#the-record' as Route, label: 'The record' },
  */
];

/** Long enough for `menu-out` to finish. Kept next to the class it mirrors. */
const CLOSE_MS = 260;

export function Menu() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setClosing(true);
    setOpen(false);
    window.setTimeout(() => setClosing(false), CLOSE_MS);
  };

  /* A menu that only closes by its own button is a menu people leave open.
     Pointer down rather than click, so it closes on the press that starts an
     interaction elsewhere rather than after it completes. */
  useEffect(() => {
    if (!open) return;

    const onAway = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', onAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="group flex h-11 items-center gap-2.5 rounded-full bg-panel px-6 text-[13.5px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors duration-200 hover:bg-ink hover:text-ground"
      >
        Menu
        {/* Two dots on one axis, turned a quarter by the hover. Rotating the
            pair rather than moving each one keeps them a single object. */}
        <span
          className={`flex items-center gap-1 transition-transform duration-300 ease-out group-hover:rotate-90 ${
            open ? 'rotate-90' : ''
          }`}
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-current" />
          <span className="block h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      </button>

      {(open || closing) && (
        <nav
          className={`menu-panel absolute right-0 z-40 mt-3 w-[clamp(18rem,26vw,24rem)] rounded-[1.5rem] bg-well p-3.5 shadow-[0_28px_60px_rgb(0_0_0/0.22)] ${
            open ? 'menu-opening' : 'menu-closing'
          }`}
        >
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              onClick={close}
              className="group relative block rounded-2xl px-4 py-3.5 text-[clamp(1.35rem,2vw,1.75rem)] leading-none font-medium tracking-[-0.01em] text-ink uppercase"
            >
              {/* Behind the words, and no larger than they need. `signal-deep`
                  is the palette's pale mint — the one green light enough to sit
                  under black type without touching its contrast. */}
              <span
                aria-hidden
                className="absolute inset-0 scale-95 rounded-2xl bg-signal-deep opacity-0 transition-all duration-[420ms] ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:scale-100 group-hover:opacity-100"
              />
              <span className="relative block">
                <RollingLabel>{section.label}</RollingLabel>
              </span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
