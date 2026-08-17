/**
 * The Reckonz mark: four tally strokes, the fourth handing off to a tick.
 * Reckoning, then the verdict.
 *
 * Inlined rather than loaded from `public/logo-reckonz.svg` for two reasons.
 * The file is drawn on a 1024 canvas with the mark sitting in the middle of it,
 * so as an `<img>` it arrives with a third of its box empty and refuses to sit
 * on a text baseline; the `viewBox` here is cropped to the measured bounds
 * instead. And `currentColor` only inherits when the SVG is part of the
 * document, which is what lets the header colour it with `text-signal` rather
 * than shipping a second file per colour.
 *
 * The paths are copied verbatim from that file and must stay that way — the
 * geometry there is traced from measured pixels, and its comment records that
 * the tick is a separate path on purpose. Never merge the two, never add
 * `stroke-linejoin`.
 *
 * Bounds, derived from those paths: bars span x 350 → 579 and y 254.5 → 761.5;
 * the tick's butt cap reaches x 737.8. Padded by 8 on each side.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="342 246 404 523"
      className={className}
      role="img"
      aria-label="Reckonz"
      fill="none"
      stroke="currentColor"
      strokeWidth={31}
      strokeLinecap="butt"
    >
      <path d="M365.5 254.5V761.5" />
      <path d="M431.5 254.5V761.5" />
      <path d="M497.5 254.5V761.5" />
      <path d="M563.5 254.5V761.5" />
      <path d="M563.5 752.5L725 515" />
    </svg>
  );
}
