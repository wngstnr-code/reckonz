import type { ReactNode } from 'react';

/**
 * A left-column section: a plain heading, a hairline, and whatever it holds.
 *
 * The reference lays its detail page out as a run of these: About, Statistics,
 * Session Limits, with no card, no border and no tint around any of them.
 *
 * The separation is done by space alone. There was a rule under each heading and
 * it is gone, because with one under every heading on the page they stop reading
 * as separators and start reading as a texture, and a page of ruled bands is the
 * table-heavy look this layout exists to get away from. `Card` in `ui.tsx` is the
 * other shape and still right where a panel really is a panel; this is the shape
 * for a page that is mostly reading.
 */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  /** Sits opposite the heading, on the same baseline. Counts, states, controls. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-11 first:mt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-title font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Two columns of label-and-value rows.
 *
 * Filled column by column on a wide screen and top to bottom on a narrow one,
 * which is what `md:grid-cols-2` gives once the children are in reading order.
 */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-14 md:grid-cols-2">{children}</dl>;
}

/**
 * One row of a `Facts` grid: name on the left, measurement on the right.
 *
 * The value is monospace and right-aligned because these are numbers read down
 * a column, and the label is not because it is prose. Same rule as the board.
 */
export function Fact({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  /** A second line under the value, for the unit or the caveat it carries. */
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line/60 py-2.5">
      <dt className="text-meta text-dim">{label}</dt>
      <dd className="text-right">
        <div className="font-mono text-meta tabular-nums text-ink">{children}</div>
        {hint && <div className="mt-0.5 text-[12px] text-faint">{hint}</div>}
      </dd>
    </div>
  );
}
