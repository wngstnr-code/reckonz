'use client';

import type { ReactNode } from 'react';
import { Chevron, MenuList, useMenu, type MenuOption } from './Menu';

/**
 * Anything the user fills in, on the surface that says so.
 *
 * The page is mostly reading: sections of measurements on the page's own ground,
 * separated by space. A form is the exception, and it has to look like one
 * before it is read, or the reader meets a row of inputs with no warning that
 * this part of the page writes to the chain. So it takes the trade card's
 * surface: `card` for the field, `well` for each control raised out of it, which
 * is the one figure-and-field pair this design has.
 *
 * That makes "grey block" mean *you can act here* everywhere on the page, which
 * is worth more than any label.
 */
export function FormCard({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-card p-4">{children}</div>;
}

/** A row of controls inside a `FormCard`, wrapping on narrow screens. */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-stretch gap-2.5">{children}</div>;
}

/**
 * One control, in a box of its own.
 *
 * The label sits quiet above and the value is the largest thing in the box,
 * which is the swap box's proportion. A hint is pinned to the bottom so a row of
 * these lines its numbers and its hints up even when the labels wrap to
 * different heights.
 */
export function Field({
  label,
  value,
  onChange,
  suffix,
  hint,
  placeholder,
  width = 'flex-1',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  suffix?: string;
  hint?: string;
  placeholder?: string;
  /** A Tailwind width class. Addresses want more room than a basis-point cap. */
  width?: string;
}) {
  return (
    <label
      className={`flex min-w-[8rem] flex-col rounded-xl bg-well px-3.5 py-2.5 focus-within:ring-1 focus-within:ring-ink/25 ${width}`}
    >
      <span className="text-meta leading-tight text-dim">{label}</span>
      <span className="mt-1.5 flex items-baseline gap-1.5">
        <input
          value={value}
          inputMode={placeholder?.startsWith('0x') ? 'text' : 'decimal'}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent font-mono text-lead tabular-nums text-ink outline-none placeholder:text-faint"
        />
        {suffix && (
          <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 font-mono text-meta text-dim">
            {suffix}
          </span>
        )}
      </span>
      {hint && <span className="mt-auto pt-2 text-meta leading-snug text-dim">{hint}</span>}
    </label>
  );
}

/** The same box, opening the drawn menu rather than taking typed input. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  width = 'flex-1',
}: {
  label: string;
  value: string;
  options: MenuOption[];
  onChange: (next: string) => void;
  /** Shown when nothing is chosen yet. */
  placeholder?: string;
  width?: string;
}) {
  const menu = useMenu();
  const chosen = options.find((o) => o.value === value);

  return (
    <div ref={menu.box} className={`relative min-w-[8rem] ${width}`}>
      <button
        onClick={() => menu.setOpen(!menu.open)}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        className="flex h-full w-full flex-col rounded-xl bg-well px-3.5 py-2.5 text-left"
      >
        <span className="text-meta leading-tight text-dim">{label}</span>
        <span className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className={`truncate font-mono text-lead ${chosen ? 'text-ink' : 'text-faint'}`}
          >
            {chosen?.label ?? placeholder ?? '—'}
          </span>
          <Chevron open={menu.open} />
        </span>
      </button>
      {menu.open && (
        <MenuList
          options={options}
          value={value}
          onChange={onChange}
          onClose={() => menu.setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The row a form ends on.
 *
 * Actions get their own row rather than sharing one with the last field. A
 * button beside an input is a button that has to guess the input's height, and
 * every form here had guessed differently: one sat on the field's baseline, one
 * on its bottom edge, and the two on the policy form were different sizes from
 * each other. Below, at the form's full width, there is nothing to match.
 */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex items-stretch gap-2.5">{children}</div>;
}

/**
 * The one primary shape on the page: solid ink.
 *
 * Deliberately not `signal`. A green button beside a green `ALLOW` pill spends
 * the same colour on "press this" and on "the guard permits this", and the
 * verdict is the one place that colour means something.
 */
export function Primary({
  onClick,
  disabled,
  full,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  /** Fills the width. The card's commit buttons do; a form's submit need not. */
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl bg-ink px-5 py-3 text-data font-semibold whitespace-nowrap text-ground hover:opacity-90 disabled:opacity-30 ${
        full ? 'w-full' : ''
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Beside a `Primary`, and the same shape as it.
 *
 * Same radius, same padding, same type size, so a pair of actions reads as a
 * pair. Only the surface differs, which is the only difference that should show.
 *
 * `whitespace-nowrap` because that promise breaks the moment a label wraps: two
 * lines of type inside the same padding is a taller button, and the pair stops
 * being a pair. Keep the labels to a word or two and this never comes up.
 *
 * A floor on the width for the same reason one step out: two secondaries in
 * different forms, sized only by their labels, come out visibly different
 * widths, and `Cancel` next to `Already here` read as two kinds of control
 * rather than one. The floor is the longer of them, so nothing is stretched.
 */
export function Secondary({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="min-w-[9.5rem] rounded-xl bg-inset px-5 py-3 text-data font-semibold whitespace-nowrap text-ink hover:bg-line disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** A small secondary action inline in prose or a table row. */
export function Ghost({
  onClick,
  disabled,
  tone = 'neutral',
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  /** `danger` for the two that take something away. Never for a refusal. */
  tone?: 'neutral' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-full px-3.5 py-1.5 text-meta whitespace-nowrap disabled:opacity-40 ${
        tone === 'danger'
          ? 'bg-refuse/10 text-refuse hover:bg-refuse/16'
          : 'bg-inset text-ink hover:bg-line'
      }`}
    >
      {children}
    </button>
  );
}

/** An on/off pill: the asset scopes, the allowlist chips. */
export function Toggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5 text-meta transition-colors ${
        on ? 'bg-ink text-ground' : 'bg-inset text-dim hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
