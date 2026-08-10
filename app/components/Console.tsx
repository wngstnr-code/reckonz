'use client';

import { useState } from 'react';
import { AllocationPanel, MandatePanel, OraclePanel, PlanPanel, ThesisPanel } from './panels';
import { Card } from './ui';
import { STAGES, useRun } from './useRun';

const EXAMPLES = [
  'I think HBM memory supply stays tight for two more quarters, and the beneficiaries are wider than NVIDIA alone.',
  'Stablecoin issuance keeps compounding and the fee take is underpriced, but the equity is a rate bet in disguise.',
  'US large-cap index exposure, held through the weekend, exited if the on-chain price stops tracking the reference.',
];

export function Console() {
  const [thesis, setThesis] = useState(EXAMPLES[0]!);
  const [notional, setNotional] = useState(250_000);
  const [maxImpact, setMaxImpact] = useState(50);
  const { state, start, stop } = useRun();

  return (
    <>
      <Card>
        <label htmlFor="thesis" className="mb-2 block text-[12px] text-dim">
          Your thesis, in your own words
        </label>
        <textarea
          id="thesis"
          rows={3}
          spellCheck={false}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          className="w-full resize-y rounded-lg border border-line px-3.5 py-2.5 text-[15px] outline-none focus:border-signal-deep"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setThesis(e)}
              className="rounded-full border border-line px-3 py-1 text-left font-mono text-[10.5px] text-faint hover:border-signal-deep hover:text-dim"
            >
              example {i + 1}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Field
            label="Notional"
            unit="USDG"
            value={notional}
            step={1000}
            onChange={setNotional}
          />
          <Field
            label="Impact limit"
            unit="bps / leg"
            value={maxImpact}
            step={5}
            onChange={setMaxImpact}
          />
          <button
            type="button"
            disabled={state.running || thesis.trim().length === 0}
            onClick={() => start(thesis.trim(), notional, maxImpact)}
            className="ml-auto rounded-lg bg-signal px-6 py-3 text-[14px] font-semibold text-ground disabled:bg-signal-deep disabled:text-ground/70"
          >
            {state.running ? 'Running…' : 'Compile & size'}
          </button>
          {state.running && (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-line px-4 py-3 text-[13px] text-dim hover:text-ink"
            >
              Stop
            </button>
          )}
        </div>
      </Card>

      <ol className="mb-4 flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const status = state.status[s.id];
          return (
            <li
              key={s.id}
              className={`flex items-center gap-2 rounded-lg border bg-panel px-3 py-1.5 font-mono text-[11px] ${
                status === 'active'
                  ? 'border-signal-deep text-ink'
                  : status === 'done'
                    ? 'border-line text-dim'
                    : 'border-line text-faint'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === 'active'
                    ? 'animate-breathe bg-caution'
                    : status === 'done'
                      ? 'bg-signal'
                      : 'bg-faint'
                }`}
              />
              {s.title}
              {state.label[s.id] && status === 'done' && (
                <span className="text-faint">· {state.label[s.id]}</span>
              )}
            </li>
          );
        })}
      </ol>

      {state.error && (
        <div className="mb-4 rounded-xl border border-refuse/40 bg-panel px-6 py-4 font-mono text-[13px] text-refuse">
          {state.error}
        </div>
      )}

      {state.compile && <ThesisPanel data={state.compile} />}
      {state.allocate && (
        <AllocationPanel allocation={state.allocate} universe={state.universe} />
      )}
      {state.mandate && <MandatePanel mandate={state.mandate} />}
      {state.plan && <PlanPanel plan={state.plan} />}
      {state.oracle && <OraclePanel oracle={state.oracle} />}
    </>
  );
}

function Field({
  label,
  unit,
  value,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block w-[170px] text-[12px] text-dim">
      {label}
      <span className="ml-1.5 font-mono text-[10.5px] text-faint">{unit}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full rounded-lg border border-line px-3 py-2.5 font-mono outline-none focus:border-signal-deep"
      />
    </label>
  );
}
