'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The open/closed state of a menu, and the two ways out of it.
 *
 * A native `<select>` was the right first answer: it keeps the keyboard, the
 * screen reader and the mobile picker that the platform already gets right, and
 * costs nothing. What it cannot do is look like anything. The reference's
 * dropdown opens into a white panel with the current choice held as a filled row
 * inside it, and the platform menu is a grey list drawn by the OS.
 *
 * So the styling is ours and the behaviour has to be rebuilt: outside click and
 * Escape both close, which is the pattern `Wallet.tsx` already uses in the
 * header. Kept as a hook rather than copied a third time.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, box };
}

export interface MenuOption {
  value: string;
  label: string;
  /** Sits before the label, the size the trigger uses. */
  icon?: ReactNode;
}

/**
 * The panel itself: raised out of the card, with the current choice filled in.
 *
 * The selected row is `inset` rather than a tick in the margin, which is what
 * the reference does and is the stronger signal at a glance. `bg-well` on the
 * panel keeps it the same surface as the swap box, so the two things that open
 * out of this card are the same material.
 *
 * The border is not in the reference, which sits on white and can carry a shadow
 * alone. On a dark ground a shadow is invisible, and a panel with no edge merges
 * into the card behind it.
 */
export function MenuList({
  options,
  value,
  onChange,
  onClose,
  align = 'stretch',
}: {
  options: MenuOption[];
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  /** `stretch` matches the trigger's width; `right` hangs a wider panel off it. */
  align?: 'stretch' | 'right';
}) {
  return (
    <div
      role="listbox"
      className={`absolute z-20 mt-1.5 rounded-xl border border-line bg-well p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.10)] ${
        align === 'right' ? 'right-0 w-60' : 'w-full'
      }`}
    >
      <div className="max-h-72 overflow-y-auto">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              role="option"
              aria-selected={selected}
              onClick={() => {
                onChange(option.value);
                onClose();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[15px] text-ink ${
                selected ? 'bg-inset' : 'hover:bg-inset/60'
              }`}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Points down when shut and up when open, as the reference's does. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 text-ink transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
