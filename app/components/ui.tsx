import type { Ref, ReactNode } from 'react';

export const usd = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export const pct = (bps: number | null | undefined) =>
  bps == null || !Number.isFinite(bps) ? '—' : `${(bps / 100).toFixed(2)}%`;

export function Card({
  step,
  title,
  children,
  /** For scrolling a card into view. A plain prop — React 19 needs no forwardRef. */
  ref,
}: {
  step?: number;
  title?: string;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <section ref={ref} className="mb-4 rounded-xl border border-line bg-panel px-6 py-5">
      {title && (
        <h2 className="mb-4 text-[15px] font-semibold tracking-tight">
          {step != null && <span className="text-faint">{step} · </span>}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-5 mb-2 text-[10.5px] font-semibold tracking-[0.09em] text-faint uppercase">
      {children}
    </h3>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-[13px] leading-relaxed text-dim">{children}</p>;
}

export function Pill({ tone, children }: { tone: 'ok' | 'no' | 'warn'; children: ReactNode }) {
  const tones = {
    ok: 'text-signal border-signal-deep bg-signal/6',
    no: 'text-refuse border-refuse/40 bg-refuse/6',
    warn: 'text-caution border-caution/40 bg-caution/6',
  } as const;
  return (
    <span
      className={`rounded-full border px-3 py-0.5 font-mono text-[11px] whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Bar({ value, tone = 'signal' }: { value: number; tone?: 'signal' | 'caution' }) {
  return (
    <span className="inline-block h-1 w-16 overflow-hidden rounded-full bg-line align-middle">
      <span
        className={`block h-full ${tone === 'signal' ? 'bg-signal' : 'bg-caution'}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </span>
  );
}

/** A number that should read as measured, not typeset. */
export function Num({ children, tone }: { children: ReactNode; tone?: 'caution' | 'refuse' }) {
  const color = tone === 'caution' ? 'text-caution' : tone === 'refuse' ? 'text-refuse' : 'text-ink';
  return <span className={`font-mono ${color}`}>{children}</span>;
}
