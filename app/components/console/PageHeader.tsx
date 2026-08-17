import type { ReactNode } from 'react';

/**
 * The one-word title and the sentence under it, on every console page.
 *
 * Each page opens by saying what it is for, because a visitor can land on any
 * of the four directly and the navigation only tells them where they are, not
 * what it does. One component so the four cannot drift into four different
 * shapes of heading.
 */
export function PageHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="mb-9">
      <h1 className="text-title font-semibold">{title}</h1>
      <p className="mt-2.5 max-w-[68ch] text-body text-dim">{children}</p>
    </header>
  );
}
