/**
 * Whether a fill could succeed right now, as one mark in the corner.
 *
 * Deliberately *not* a client module. Everything here is static: a lookup table
 * and a span. Marking it `'use client'` would turn `HEALTH_TONES` and
 * `healthSentence` into client references, which a server component cannot read
 * — the preview page hit exactly that and rendered nothing at all. The polling
 * lives next door in `HealthStatus`, which is the only part that needs a
 * browser.
 *
 * The states come from `GET /api/health`, which answers *could a fill succeed*
 * rather than *did the server respond* (D81). The deployment once sat with a
 * two-day-stale oracle refusing every trade while answering every request in
 * milliseconds, so `down` here means nothing can trade.
 *
 * **Nothing here is red.** `down` used to be, and it made the loudest thing on
 * every page a condition no visitor caused and none of them can fix. In this
 * palette red means the system itself broke; an oracle nobody has republished
 * is a refusal working as designed, which is what `caution` is for. The two
 * warning states are told apart by weight rather than by hue, because a fourth
 * colour would mean one of the three we have had lost its meaning.
 *
 * The mark carries the state on its own and the word arrives on hover, so the
 * icons have to be distinguishable at a glance rather than merely decorative.
 * All five are the same circle with something different inside it: a family,
 * not five unrelated pictures. `down` is a clock because the condition really
 * is age — the prices are too old to trade against — and a clock says that
 * faster than any word we could fit in the header.
 *
 * **`down` has two readings, and only one of them is a problem** (D106). Our
 * xStocks are quoted 24/5, so from Friday evening to Sunday the issuer quotes
 * nothing, the oracle refuses to invent a price, and every observation ages out.
 * Nothing can trade, which is why the state is still `down` — and nothing is
 * broken either. A visitor who arrives on a Saturday to *"prices are too old to
 * trade against"* reads neglect, and it was the route saying that about a system
 * doing exactly the right thing.
 *
 * So the words take the `cause` the route already returns; the mark does not.
 * Splitting the copy fixes the misreading. Splitting the icon family would mean
 * a sixth picture for a state that is, visually, the same condition: a market
 * you cannot trade in right now.
 */

const ICON = {
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.4 12.2 2.5 2.5 4.7-5.2" />
    </>
  ),
  degraded: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.4v5.2" />
      <circle cx="12" cy="16.3" r="1.05" fill="currentColor" stroke="none" />
    </>
  ),
  down: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.9" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9.5a2.4 2.4 0 1 1 3.2 2.3c-.6.3-.9.8-.9 1.4v.4" />
      <circle cx="12" cy="16.4" r="1.05" fill="currentColor" stroke="none" />
    </>
  ),
  loading: <circle cx="12" cy="12" r="9" strokeDasharray="4 3.6" />,
} as const;

import type { HealthCause } from '@/src/health';

const TONES = {
  ok: {
    text: 'text-signal',
    border: 'border-signal',
    label: 'live',
    says: 'Everything works. You can trade right now.',
  },
  degraded: {
    text: 'text-caution',
    border: 'border-caution',
    label: 'degraded',
    says: 'Part of the market is fine. Some assets need a price refresh first.',
  },
  down: {
    text: 'text-caution',
    border: 'border-caution',
    label: 'stale',
    says: 'Prices are too old to trade against. You can still browse everything here.',
  },
  unknown: {
    text: 'text-faint',
    border: 'border-faint',
    label: 'unreachable',
    says: 'We could not reach our own status check.',
  },
  loading: {
    text: 'text-faint animate-breathe',
    border: 'border-faint',
    label: 'checking',
    says: 'Checking whether a trade could go through.',
  },
} as const;

/**
 * The one `down` that is a closed market rather than a fault.
 *
 * Only this cause gets its own words. The other four — `publisher-stopped`,
 * `publisher-failing`, `issuer-unreachable`, `unknown` — are all genuinely
 * "something here is not working", and a visitor needs one sentence rather than
 * our operational vocabulary: which of our processes broke is not their problem
 * to hold. `problems` in the raw report carries that, one click away.
 */
const CLOSED = {
  label: 'closed',
  says: 'The market is closed, so the issuer is publishing no prices. You can browse everything here, and trading resumes when it reopens.',
} as const;

const isClosed = (tone: HealthTone, cause?: HealthCause | null) =>
  tone === 'down' && cause === 'issuer-closed';

export type HealthTone = keyof typeof TONES;

/** In the order they degrade, which is the order worth reviewing them in. */
export const HEALTH_TONES = Object.keys(TONES) as HealthTone[];

/**
 * The one word for a state, for the panel that opens on hover.
 *
 * `cause` is optional so the gallery and the `aria-label` can ask without one,
 * and so this stays callable from anywhere holding only a tone.
 */
export function healthLabel(tone: HealthTone, cause?: HealthCause | null): string {
  return isClosed(tone, cause) ? CLOSED.label : TONES[tone].label;
}

/** The mark's colour as a border class. Nothing uses it today — the framed
 *  version was tried and dropped — but it is one line and the next thing that
 *  wants a tone-coloured edge should not have to re-derive the mapping. */
export function healthBorder(tone: HealthTone): string {
  return TONES[tone].border;
}

/** What the badge says once the panel is open. */
export function healthSentence(tone: HealthTone, cause?: HealthCause | null): string {
  return isClosed(tone, cause) ? CLOSED.says : TONES[tone].says;
}

export function HealthBadge({ tone, className }: { tone: HealthTone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${TONES[tone].text} ${className ?? 'h-[18px] w-[18px]'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICON[tone]}
    </svg>
  );
}
