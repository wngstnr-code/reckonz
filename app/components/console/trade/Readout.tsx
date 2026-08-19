import type { ReactNode } from 'react';

/**
 * What the server answered, on the same surface as what you typed.
 *
 * The plan was a run of `Legend` headings over flat lists: a fixed-width label
 * column and a value that wrapped past it. That shape came from the old page,
 * where the panel was 900px wide and a label column had room to be a column. In
 * a 400px rail it is neither aligned nor readable, and it sits on the card's own
 * ground while every other group of facts on the page sits on something.
 *
 * So a plan reads as blocks, each one `well` like the swap box above it: the
 * user typed into a raised surface, and the answer comes back on the same one.
 */
export function Readout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2.5 rounded-xl bg-well px-3.5 py-3">
      <h3 className="text-micro text-faint uppercase">{title}</h3>
      <dl className="mt-2 grid gap-2">{children}</dl>
    </div>
  );
}

/**
 * One measurement: what it is on the left, what it came to on the right.
 *
 * Right-aligned and monospace, the same rule the board and the mandate facts
 * follow, so a number means the same kind of thing wherever it appears. The note
 * hangs under the value rather than trailing it, because at this width a value
 * and its caveat on one line wrap into each other and stop being two facts.
 *
 * `overflow-wrap: anywhere` rather than `break-words`, and the difference is not
 * academic here: an evidence hash and a pool address have no break opportunity
 * at all, and `break-word` leaves them to overflow the rail. Measured at 679px
 * of content in a 360px column before this was set.
 */
export function Line({
  label,
  children,
  note,
  tone,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
  /** `caution` for a number that is close to a limit, or past one. */
  tone?: 'caution' | 'refuse';
}) {
  const colour = tone === 'caution' ? 'text-caution' : tone === 'refuse' ? 'text-refuse' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-meta text-dim">{label}</dt>
      <dd className="min-w-0 text-right [overflow-wrap:anywhere]">
        <div className={`font-mono text-meta tabular-nums ${colour}`}>{children}</div>
        {note && <div className="mt-0.5 text-meta text-faint">{note}</div>}
      </dd>
    </div>
  );
}

/** A sentence inside a readout, where a row would be the wrong shape. */
export function Aside({ tone, children }: { tone?: 'caution'; children: ReactNode }) {
  return (
    <p
      className={`text-meta leading-relaxed [overflow-wrap:anywhere] ${
        tone === 'caution' ? 'text-caution' : 'text-dim'
      }`}
    >
      {children}
    </p>
  );
}
