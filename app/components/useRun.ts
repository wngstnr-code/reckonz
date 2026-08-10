'use client';

import { useCallback, useRef, useState } from 'react';
import type { Allocation, CompiledMandate, Thesis } from '@/src/thesis';
import type { AssetVerdict, RunEvent, Stage, UniverseEntry } from '@/src/pipeline';
import type { BasketPlan } from '@/src/planner';

export const STAGES: { id: Stage; title: string }[] = [
  { id: 'compile', title: 'compile' },
  { id: 'universe', title: 'universe' },
  { id: 'allocate', title: 'allocate' },
  { id: 'mandate', title: 'triggers' },
  { id: 'plan', title: 'capacity' },
  { id: 'oracle', title: 'guard' },
];

export type StageStatus = 'idle' | 'active' | 'done';

export interface RunState {
  running: boolean;
  error: string | null;
  status: Record<Stage, StageStatus>;
  label: Partial<Record<Stage, string>>;
  compile: { thesis: Thesis; provider: string; live: boolean } | null;
  universe: UniverseEntry[] | null;
  allocate: Allocation | null;
  mandate: (CompiledMandate & { described: { text: string; unresolved: string[] }[] }) | null;
  plan: (BasketPlan & { maxImpactBps: number }) | null;
  oracle: { verdicts: AssetVerdict[] } | null;
}

const idle = (): RunState => ({
  running: false,
  error: null,
  status: {
    compile: 'idle',
    universe: 'idle',
    allocate: 'idle',
    mandate: 'idle',
    plan: 'idle',
    oracle: 'idle',
  },
  label: {},
  compile: null,
  universe: null,
  allocate: null,
  mandate: null,
  plan: null,
  oracle: null,
});

/**
 * Consumes the run as it happens. A run takes tens of seconds because every
 * stage is doing real work — an LLM call, the throttled public RPC, a
 * reference market — so results land one at a time rather than all at the end.
 */
export function useRun() {
  const [state, setState] = useState<RunState>(idle);
  const source = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const start = useCallback(
    (thesis: string, notional: number, maxImpactBps: number) => {
      source.current?.close();
      setState({ ...idle(), running: true });

      const params = new URLSearchParams({
        thesis,
        notional: String(notional),
        maxImpactBps: String(maxImpactBps),
      });
      const es = new EventSource(`/api/run?${params}`);
      source.current = es;

      es.onmessage = (message) => {
        const event = JSON.parse(message.data) as RunEvent;

        if ('error' in event) {
          es.close();
          source.current = null;
          setState((s) => ({ ...s, running: false, error: event.error }));
          return;
        }
        if ('done' in event) {
          es.close();
          source.current = null;
          setState((s) => ({ ...s, running: false }));
          return;
        }

        setState((s) => {
          const next: RunState = {
            ...s,
            status: { ...s.status, [event.stage]: event.status === 'done' ? 'done' : 'active' },
            label: { ...s.label, [event.stage]: event.label },
          };
          if (event.status === 'done') {
            // The event union is discriminated on stage, so each payload lands
            // on its own field with its own type.
            switch (event.stage) {
              case 'compile':
                next.compile = event.data;
                break;
              case 'universe':
                next.universe = event.data;
                break;
              case 'allocate':
                next.allocate = event.data;
                break;
              case 'mandate':
                next.mandate = event.data;
                break;
              case 'plan':
                next.plan = event.data;
                break;
              case 'oracle':
                next.oracle = event.data;
                break;
            }
          }
          return next;
        });
      };

      // EventSource reconnects by default; a pipeline run is not replayable, so
      // a broken connection ends the run rather than silently starting another.
      es.onerror = () => {
        es.close();
        source.current = null;
        setState((s) =>
          s.oracle
            ? { ...s, running: false }
            : { ...s, running: false, error: s.error ?? 'connection to the pipeline was lost' },
        );
      };
    },
    [],
  );

  return { state, start, stop };
}
