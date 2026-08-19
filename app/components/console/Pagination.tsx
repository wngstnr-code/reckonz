'use client';

import { ChevronMark } from './marks';

/**
 * A page bar: what is on screen out of how many, and where else to go.
 *
 * Twenty receipts fit on one screen and four hundred do not, and the version of
 * this page that scrolls forever is only pleasant while the number is small.
 * The count is the part that has to keep working, so the bar is built for the
 * size the list is heading towards rather than the size it is.
 *
 * The left half is the honest half. "1-16 of 20" says both what is shown and
 * what exists, which is the pair a reader needs before deciding whether the
 * thing they are looking for is missing or merely on page two.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  noun = 'items',
}: {
  /** One-based, because it is rendered. */
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
  /** What is being counted, for the screen reader and the empty case. */
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
      aria-label={`${noun} pages`}
    >
      <p className="font-mono text-meta tabular-nums text-dim">
        {from}-{to} of {total}
      </p>

      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Step
            label="Previous page"
            disabled={page === 1}
            onClick={() => onPage(page - 1)}
            back
          />

          {sequence(page, pages).map((entry, i) =>
            entry === null ? (
              // A gap, not a button. Rendering it as one invites a click that
              // cannot resolve to a page.
              <span key={`gap-${i}`} className="px-2 text-meta text-faint" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPage(entry)}
                aria-current={entry === page ? 'page' : undefined}
                className={`min-w-9 rounded-lg px-2.5 py-1.5 font-mono text-meta tabular-nums transition-colors duration-200 ${
                  entry === page ? 'bg-raised font-semibold text-ink' : 'text-dim hover:text-ink'
                }`}
              >
                {entry}
              </button>
            ),
          )}

          <Step label="Next page" disabled={page === pages} onClick={() => onPage(page + 1)} />
        </div>
      )}
    </nav>
  );
}

function Step({
  label,
  disabled,
  onClick,
  back,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  back?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-lg p-1.5 text-dim transition-colors duration-200 hover:text-ink disabled:text-faint disabled:opacity-40"
    >
      <ChevronMark className={`h-3.5 w-3.5 ${back ? 'rotate-90' : '-rotate-90'}`} />
    </button>
  );
}

/**
 * Which page numbers to draw, with `null` for a gap.
 *
 * Always the first and the last, plus a run of five around the current one,
 * pushed inward so the bar keeps a steady width instead of collapsing to three
 * numbers at either end. An ellipsis appears only where it actually hides
 * something: with six pages and the run covering 1 to 5, there is nothing
 * between 5 and 6 to elide.
 */
export function sequence(page: number, pages: number): (number | null)[] {
  const SPAN = 5;
  if (pages <= SPAN + 2) return Array.from({ length: pages }, (_, i) => i + 1);

  const start = Math.max(1, Math.min(page - 2, pages - SPAN + 1));
  const end = Math.min(pages, start + SPAN - 1);

  const out: (number | null)[] = [];

  // An ellipsis standing in for a single page is worse than the page: it hides
  // one number behind a mark nobody can click. So a gap of exactly one is drawn
  // as that number instead, and the mark appears only where it earns its place.
  if (start > 1) {
    out.push(1);
    if (start === 3) out.push(2);
    else if (start > 3) out.push(null);
  }

  for (let i = start; i <= end; i += 1) out.push(i);

  if (end < pages) {
    if (end === pages - 2) out.push(pages - 1);
    else if (end < pages - 2) out.push(null);
    out.push(pages);
  }

  return out;
}
