'use client';

import type { ReactNode } from 'react';
import { AssetMark } from '../AssetMark';

/**
 * The two halves of a trade, in one box, with the direction drawn between them.
 *
 * Copied in shape from the reference's asset page, and it fits for a reason
 * beyond looking like it: what this box describes really is one token in and one
 * token out. A Permit2 signature names one token, one amount, one spender and
 * one twenty-minute window, so a fill is never a basket however much the thesis
 * above it was. The old layout — three inline fields on a row — let the eye read
 * a fill as a form; this one reads as a swap, which is what settles.
 *
 * `Fill` and `Exit` both render it. They differ only in which half the user
 * types into, so neither owns it.
 */
export function SwapBox({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-line bg-raised">
      <div className="px-4 pt-3.5 pb-5">{top}</div>
      <div className="border-t border-line px-4 pt-5 pb-3.5">{bottom}</div>

      {/* Centred on the seam rather than sitting under it. `bg-panel` matches
          the card behind, so the arrow punches a hole in the rule instead of
          floating over it. */}
      <span
        className="pointer-events-none absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-dim"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}

/**
 * One half: what it is called, how much, and of what.
 *
 * The amount is the largest type on the page for a reason — it is the only
 * number the user is choosing, and everything below it is a consequence of this
 * one. `tabular-nums` because it changes as they type and the field must not
 * shimmer.
 */
export function SwapLeg({
  label,
  amount,
  onAmountChange,
  token,
  hint,
  right,
}: {
  label: string;
  amount: string;
  /** Omitted where the amount is derived rather than chosen — the receive side. */
  onAmountChange?: (next: string) => void;
  token: ReactNode;
  /** Under the amount: the balance, the cap, the reason this is greyed. */
  hint?: ReactNode;
  /** Under the token: a max button, a fiat estimate. */
  right?: ReactNode;
}) {
  const editable = onAmountChange !== undefined;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold tracking-[0.09em] text-faint uppercase">
        {label}
      </div>
      <div className="flex items-center justify-between gap-3">
        {editable ? (
          <input
            value={amount}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => onAmountChange(e.target.value)}
            className="w-full min-w-0 bg-transparent font-mono text-[28px] tabular-nums text-ink outline-none placeholder:text-faint"
          />
        ) : (
          // Not a disabled input. A field the user cannot type into still reads
          // as one they should try to, and the greyed-out version of that is a
          // control that looks broken rather than derived.
          <output className="w-full min-w-0 truncate font-mono text-[28px] tabular-nums text-dim">
            {amount || '0'}
          </output>
        )}
        <div className="shrink-0">{token}</div>
      </div>
      {(hint || right) && (
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[12px] text-faint">
          <span className="min-w-0 truncate">{hint}</span>
          <span className="shrink-0">{right}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The token on one side of the swap, as a chip.
 *
 * A real `<select>` laid transparently over the chip rather than a custom
 * listbox: it keeps the keyboard, the screen reader and the mobile picker that
 * the platform already gets right, and the chip is only paint. Where there is
 * nothing to choose between, the chevron is dropped and no select is rendered —
 * an affordance for a menu with one item is a small lie.
 */
/**
 * The settlement currency is not one of the thirty, and must not wear their mark.
 *
 * `AssetMark` draws every symbol inside the xStock notch and falls back to two
 * letters in it when there is no artwork — which rendered USDG as a tokenised
 * stock nobody had drawn a logo for. It is a stablecoin, and the notch is a
 * claim about what a token *is*. So anything outside the `w…x` naming gets a
 * plain disc instead.
 */
function TokenMark({ symbol }: { symbol: string }) {
  if (/^w[A-Z]/.test(symbol)) return <AssetMark symbol={symbol} size={22} />;
  return (
    <span
      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-line font-mono text-[10px] text-dim"
      aria-hidden
    >
      {symbol === '—' ? '?' : '$'}
    </span>
  );
}

export function TokenChip({
  symbol,
  options,
  value,
  onChange,
}: {
  symbol: string;
  /** Omit for a fixed side, like the USDG a fill always spends. */
  options?: { value: string; label: string }[];
  value?: string;
  onChange?: (next: string) => void;
}) {
  const choosable = options !== undefined && options.length > 1 && onChange !== undefined;

  return (
    <span className="relative flex items-center gap-2 rounded-full border border-line bg-panel py-1 pr-3 pl-1">
      <TokenMark symbol={symbol} />
      <span className="font-mono text-[13px] whitespace-nowrap text-ink">{symbol}</span>
      {choosable && (
        <>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="asset"
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      )}
    </span>
  );
}
