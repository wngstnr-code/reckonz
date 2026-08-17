'use client';

import { useEffect, useRef, useState } from 'react';
import type { HealthReport } from '@/src/health';
import { HealthBadge, healthLabel, healthSentence, type HealthTone } from './HealthBadge';

/**
 * The health badge, and the panel behind it.
 *
 * Opens on hover, which is what a pointer expects, and also on click and on
 * keyboard focus, which is what everything else needs. Hover alone would be a
 * desktop-only feature; click alone asks for a deliberate act to read one
 * sentence.
 *
 * Two details that are easy to get wrong and annoying to live with. The panel
 * is separated from the badge by padding rather than by an offset, so the gap
 * belongs to the hover region and moving the cursor down into the panel does
 * not close it. And leaving is delayed a moment, so a cursor that clips the
 * corner on its way somewhere else does not make the panel flicker.
 *
 * What it says is short on purpose. The `problems` array from `/api/health` is
 * written for whoever operates this thing, and a visitor needs one sentence and
 * one concrete number. Nothing is hidden: `raw` is the full report, one click
 * away, which is the difference between a summary and a half-truth.
 *
 * The route caches for thirty seconds and is rate limited, so one poll a minute
 * is both enough and polite. A request that never answers renders as its own
 * state rather than leaving a stale verdict on screen.
 */

/** `checkedAt` is unix seconds, per `classifyHealth`. */
function ago(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const LEAVE_DELAY_MS = 140;

export function HealthStatus() {
  const [tone, setTone] = useState<HealthTone>('loading');
  const [report, setReport] = useState<HealthReport | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        // A non-2xx is the *answer* here, not a failure: 503 is exactly how the
        // route says nothing can trade. So the body is read either way.
        const res = await fetch('/api/health', { cache: 'no-store' });
        const body = (await res.json()) as HealthReport;
        if (!alive) return;
        setTone(body.status);
        setReport(body);
      } catch {
        if (!alive) return;
        setTone('unknown');
        setReport(null);
      }
    };

    void check();
    const timer = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

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

  useEffect(() => () => clearTimeout(leaving.current ?? undefined), []);

  const show = () => {
    clearTimeout(leaving.current ?? undefined);
    setOpen(true);
  };

  const hide = () => {
    clearTimeout(leaving.current ?? undefined);
    leaving.current = setTimeout(() => setOpen(false), LEAVE_DELAY_MS);
  };

  const stale = report?.assets.filter((a) => a.stale).length ?? 0;
  const total = report?.assets.length ?? 0;

  return (
    <div
      className="relative"
      ref={box}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // The mark alone carries no name, so the button has to supply one.
        aria-label={`System status: ${healthLabel(tone)}`}
        // Square, and the same 38px height as the wallet button beside it, so
        // the two sit on one baseline. No frame: the mark is the signal, and a
        // box around it only competes with the wallet button for the eye.
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[14px] transition-colors duration-200 hover:bg-raised"
      >
        <HealthBadge tone={tone} className="h-[21px] w-[21px]" />
      </button>

      {open && (
        // `top-full pt-2` rather than `top-8`: the space between badge and
        // panel is padding inside the hover region, not a hole in it.
        <div className="absolute top-full right-0 z-40 w-64 pt-2">
          <div className="overlay rounded-xl p-3.5">
            {/* The word lives here now that the header carries only the mark.
                An icon can say *which* state at a glance; it cannot say what
                the state is called, and the two together is what makes the
                icon learnable rather than a symbol you re-decode each time. */}
            <p className="flex items-center gap-2 font-mono text-meta tracking-[0.06em] uppercase">
              <HealthBadge tone={tone} className="h-3.5 w-3.5" />
              {healthLabel(tone)}
            </p>
            <p className="mt-2 text-data leading-relaxed text-ink">{healthSentence(tone)}</p>

            {stale > 0 && (
              <p className="mt-2 font-mono text-meta text-caution">
                {stale} of {total} {total === 1 ? 'asset needs' : 'assets need'} a price refresh
              </p>
            )}

            {report && (
              <div className="mt-3 flex items-baseline gap-3 border-t border-line pt-2.5 font-mono text-meta text-faint">
                <span>checked {ago(report.checkedAt)}</span>
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto hover:text-ink"
                >
                  raw
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
