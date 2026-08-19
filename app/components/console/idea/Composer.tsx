'use client';

import { Field } from '../trade/Form';

/**
 * Where the thesis is written, and the only control that starts anything.
 *
 * Three examples, named rather than numbered. "example 1" tells a reader
 * nothing about whether it is worth pressing; the shape of the idea does, and
 * choosing between three ideas is the point of offering three.
 *
 * The button is `bg-ink` like every other primary in the console. It was
 * `bg-signal`, which is the colour this product uses for a guard verdict --
 * spending it on "press this" as well, on the page whose entire output is a
 * verdict, made one green mean two things.
 */

export const EXAMPLES: { name: string; text: string }[] = [
  {
    name: 'Supply chain',
    text: 'I think HBM memory supply stays tight for two more quarters, and the beneficiaries are wider than NVIDIA alone.',
  },
  {
    name: 'Stablecoins',
    text: 'Stablecoin issuance keeps compounding and the fee take is underpriced, but the equity is a rate bet in disguise.',
  },
  {
    name: 'Index, hedged',
    text: 'US large-cap index exposure, held through the weekend, exited if the on-chain price stops tracking the reference.',
  },
];

export function Composer({
  thesis,
  onThesis,
  notional,
  onNotional,
  maxImpact,
  onMaxImpact,
  running,
  onStart,
  onStop,
}: {
  thesis: string;
  onThesis: (next: string) => void;
  notional: number;
  onNotional: (next: number) => void;
  maxImpact: number;
  onMaxImpact: (next: number) => void;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <>
      <label htmlFor="thesis" className="mb-2 block text-meta text-dim">
        In your own words. Name a view, not a ticker.
      </label>
      <textarea
        id="thesis"
        rows={3}
        spellCheck={false}
        value={thesis}
        onChange={(e) => onThesis(e.target.value)}
        className="w-full resize-y rounded-xl border border-line bg-ground px-4 py-3 text-data outline-none focus:border-signal-deep"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e.name}
            type="button"
            onClick={() => onThesis(e.text)}
            aria-pressed={thesis === e.text}
            className={`rounded-lg px-3 py-2 text-data transition-colors duration-200 ${
              thesis === e.text ? 'bg-raised font-semibold text-ink' : 'text-dim hover:text-ink'
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <Field
          label="Notional"
          suffix="USDG"
          value={String(notional)}
          onChange={(v) => onNotional(Number(v))}
          width="w-[11rem]"
          onGround
        />
        <Field
          label="Impact limit"
          suffix="bps per leg"
          value={String(maxImpact)}
          onChange={(v) => onMaxImpact(Number(v))}
          width="w-[11rem]"
          onGround
        />

        <div className="ml-auto flex items-center gap-3">
          {running && (
            <button
              type="button"
              onClick={onStop}
              className="rounded-xl bg-inset px-5 py-3 text-data font-semibold whitespace-nowrap text-ink"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            disabled={running || thesis.trim().length === 0}
            onClick={onStart}
            className="rounded-xl bg-ink px-5 py-3 text-data font-semibold whitespace-nowrap text-ground transition-opacity duration-200 hover:opacity-90 disabled:opacity-30"
          >
            {running ? 'Running…' : 'Compile & size'}
          </button>
        </div>
      </div>

      <p className="mt-4 max-w-[68ch] text-meta leading-relaxed text-dim">
        The first step calls a live model, so it takes about two minutes. Nothing is signed here and
        no wallet is needed until you act on the result.
      </p>
    </>
  );
}
