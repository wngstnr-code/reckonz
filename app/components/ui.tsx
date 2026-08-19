import type { Ref, ReactNode } from 'react';

export const usd = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export const pct = (bps: number | null | undefined) =>
  bps == null || !Number.isFinite(bps) ? '—' : `${(bps / 100).toFixed(2)}%`;

/**
 * A token amount, at a length a column can be read down.
 *
 * `formatUnits` returns every decimal the token has, and an 18-decimal balance
 * printed whole is twenty digits nobody compares to the one below it. Eight is
 * past the point any position here is meaningful and still shows a dust holding
 * as something rather than rounding it to zero, which is the one direction this
 * must not fail in: a balance the wallet holds must never render as none.
 *
 * Takes the formatted string rather than the bigint, so the caller keeps the
 * exact value to put in a `title`.
 */
export const tokenAmount = (exact: string): string => {
  const [whole, fraction = ''] = exact.split('.');
  if (fraction.length <= 8) return exact;

  const cut = `${whole}.${fraction.slice(0, 8)}`.replace(/0+$/, '').replace(/\.$/, '');
  return cut === whole && Number(whole) === 0 ? '<0.00000001' : cut;
};

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
    <h3 className="mt-5 mb-2 text-micro font-semibold text-faint uppercase">
      {children}
    </h3>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mb-4 max-w-[68ch] text-meta leading-relaxed text-dim">{children}</p>;
}

/**
 * A verdict, and only a refusal wears a box.
 *
 * `ok` is the ordinary answer and the one most rows carry, so a tinted pill on
 * every one of them becomes a texture rather than a mark. Bare green text says
 * the same thing and lets the exceptions be the things that stand out, which is
 * what `docs/09-design.md` asks of this palette. The same call was made on the
 * trade card's ALLOW before this was shared.
 */
export function Pill({ tone, children }: { tone: 'ok' | 'no' | 'warn'; children: ReactNode }) {
  if (tone === 'ok') {
    return (
      <span className="font-mono text-micro tracking-normal whitespace-nowrap normal-case text-signal">
        {children}
      </span>
    );
  }

  const tones = {
    no: 'text-refuse border-refuse/40 bg-refuse/6',
    warn: 'text-caution border-caution/40 bg-caution/6',
  } as const;
  return (
    <span
      className={`rounded-full border px-3 py-0.5 font-mono text-micro tracking-normal whitespace-nowrap normal-case ${tones[tone]}`}
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

/**
 * A number that should read as measured, not typeset.
 *
 * **It inherits its colour.** It used to force `text-ink`, which is the page's
 * near-black, and that is only a foreground on a light surface: on the green
 * panels -- a settled fill, a created mandate, a followed thesis -- every number
 * it wrapped went nearly invisible against the field it sat on. The panel that
 * announced "Mandate #2 created, allowing 3 assets" rendered both figures as
 * dark shapes on dark green.
 *
 * A component that hardcodes a foreground cannot be placed on an arbitrary
 * surface, and this one is placed everywhere. So the surface decides the colour
 * and the weight carries the emphasis that `text-ink` used to. `tone` stays for
 * the two cases where the colour *is* the message.
 */
export function Num({ children, tone }: { children: ReactNode; tone?: 'caution' | 'refuse' }) {
  const color = tone === 'caution' ? 'text-caution' : tone === 'refuse' ? 'text-refuse' : '';
  return <span className={`font-mono font-semibold ${color}`}>{children}</span>;
}
