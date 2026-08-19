'use client';

import { useRouter } from 'next/navigation';
import { INSTALL_TRIGGERS_EVENT, type TriggerInstallRequest } from './follow';
import { stashHandoff } from './handoff';
import type { RunState } from './useRun';
import { Bar, Legend, Note, Num, Pill, pct, usd } from './ui';
import { Section } from './console/trade/Section';

/* ------------------------------------------------- 1 · the compiled thesis */

export function ThesisPanel({ data }: { data: NonNullable<RunState['compile']> }) {
  const { thesis } = data;
  return (
    <Section title="The claim, made falsifiable">
      <blockquote className="rounded-lg bg-raised px-5 py-3.5 text-data">
        {thesis.claim}
      </blockquote>
      <p className="mt-2 font-mono text-meta text-faint">
        horizon {thesis.horizonDays} days · compiled by {data.provider}
        {!data.live && ' · recorded fixture, input text ignored'}
      </p>

      <div className="grid gap-7 md:grid-cols-[1.1fr_1fr]">
        <div>
          <Legend>Causal chain</Legend>
          <ol className="list-decimal space-y-1.5 pl-5 text-meta text-dim">
            {thesis.causalChain.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <Legend>Unstated assumptions</Legend>
          <ul className="list-disc space-y-1.5 pl-5 text-meta text-dim">
            {thesis.unstatedAssumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      </div>

      <Legend>Beneficiaries</Legend>
      <div className="grid gap-2.5">
        {thesis.beneficiaries.map((b) => (
          <div key={b.entity} className="rounded-lg border border-line bg-raised px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <b className="text-data">{b.entity}</b>
              <span className="rounded border border-line px-1.5 py-px font-mono text-micro tracking-wider text-faint uppercase">
                {b.order}
              </span>
              <span className="ml-auto flex items-center gap-2 font-mono text-meta text-dim">
                <Bar value={b.confidence} />
                {b.confidence.toFixed(2)}
              </span>
            </div>
            <p className="mt-1.5 text-meta text-dim">{b.rationale}</p>
            <p className="mt-1 text-meta text-faint italic">evidence: {b.evidence}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------- 2 · the allocation */

export function AllocationPanel({
  allocation,
  universe,
}: {
  allocation: NonNullable<RunState['allocate']>;
  universe: RunState['universe'];
}) {
  return (
    <Section title="Mapped onto what actually trades on X Layer">
      {universe && (
        <Note>
          The investable universe was read from the chain, not assumed:{' '}
          <span className="font-mono text-ink">
            {universe.map((u) => u.symbol).join(', ')}
          </span>
          .
        </Note>
      )}
      <table className="w-full border-collapse text-meta">
        <thead>
          <tr className="border-b border-line text-micro text-faint uppercase">
            <th className="px-2.5 pb-2 text-left font-semibold">Asset</th>
            <th className="px-2.5 pb-2 text-right font-semibold">Weight</th>
            <th className="px-2.5 pb-2 text-left font-semibold">Expresses</th>
            <th className="px-2.5 pb-2 text-left font-semibold">Rationale</th>
          </tr>
        </thead>
        <tbody>
          {allocation.legs.map((leg) => (
            <tr key={leg.symbol} className="border-b border-line last:border-0">
              <td className="px-2.5 py-2.5 font-mono whitespace-nowrap text-ink">{leg.symbol}</td>
              <td className="px-2.5 py-2.5 text-right font-mono text-ink">
                {(leg.weightBps / 100).toFixed(0)}%
              </td>
              <td className="px-2.5 py-2.5 text-dim">{leg.expresses}</td>
              <td className="px-2.5 py-2.5 text-dim">{leg.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {allocation.invented.length > 0 && (
        <div className="mt-5 border-l-2 border-refuse pl-4">
          <h3 className="mb-1.5 text-micro font-semibold tracking-[0.09em] text-refuse uppercase">
            Named an asset that does not exist
          </h3>
          {/* Distinct from "refused to substitute" below, and the distinction is
              the point: that one is the model being honest about an entity with
              no tradable asset, this one is the model inventing a token. Before
              D75 these legs were filtered out silently and their share of the
              notional reappeared as capacity the market refused: a
              hallucination reported as a fact about liquidity. */}
          <ul className="list-disc space-y-1 pl-5 text-meta text-dim">
            {allocation.invented.map((l) => (
              <li key={l.symbol}>
                <span className="font-mono text-ink">{l.symbol}</span>, not in the universe read
                from the chain. Its {(l.weightBps / 100).toFixed(0)}% was not planned, and is not
                counted as capacity the market refused.
              </li>
            ))}
          </ul>
          <p className="mt-1.5 font-mono text-meta text-faint">
            {(allocation.weightBpsTotal / 100).toFixed(0)}% of the basket survived validation
          </p>
        </div>
      )}

      {allocation.unmapped.length > 0 && (
        <div className="mt-5 border-l-2 border-caution pl-4">
          <h3 className="mb-1.5 text-micro font-semibold tracking-[0.09em] text-caution uppercase">
            Refused to substitute
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-meta text-dim">
            {allocation.unmapped.map((u) => (
              <li key={u.entity}>
                <span className="text-ink">{u.entity}</span>: {u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/* -------------------------------------------------- 3 · the exit triggers */

export function MandatePanel({ mandate }: { mandate: NonNullable<RunState['mandate']> }) {
  const router = useRouter();
  return (
    <Section title="Exit triggers, from the same compilation">
      <Note>
        Each disconfirming condition is mapped to a quantity this system can measure at execution
        time and <strong className="text-ink">PolicyGuard enforces on chain</strong>. Conditions no
        metric captures are surfaced, never proxied.
      </Note>

      <ul className="grid gap-2">
        {mandate.described.map((t, i) => (
          <li
            key={i}
            // A green edge on every trigger that resolved is decoration: it
            // marks the ordinary case, which is most of them, so the colour
            // carries no information and the row reads as generated. The
            // caution edge stays, because that one marks the exception.
            className={`rounded-lg border border-line bg-raised px-4 py-3 ${
              t.unresolved.length ? 'border-l-2 border-l-caution' : ''
            }`}
          >
            <code className="font-mono text-meta text-ink">{t.text}</code>
            <p className="mt-1.5 text-meta text-dim">
              {mandate.exitTriggers[i]?.trigger.appliesTo.length
                ? `named: ${mandate.exitTriggers[i]!.trigger.appliesTo.join(', ')}`
                : 'applies to the whole basket'}
            </p>
            {t.unresolved.length > 0 && (
              <p className="mt-1 text-meta text-caution">
                does not cover: no leg expresses {t.unresolved.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>

      {mandate.manualWatch.length > 0 && (
        <>
          <Legend>Not measurable by this system</Legend>
          <ul className="list-disc space-y-1 pl-5 text-meta text-dim">
            {mandate.manualWatch.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </>
      )}

      {mandate.maxGapRisk !== undefined && (
        <p className="mt-4 font-mono text-meta text-faint">
          implied mandate ceiling: maxGapRisk {mandate.maxGapRisk}
        </p>
      )}

      {mandate.exitTriggers.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            onClick={() => {
              const detail: TriggerInstallRequest = {
                exitTriggers: mandate.exitTriggers,
                manualWatch: mandate.manualWatch,
              };
              // Both: the event for when the mandate form shares this page,
              // the stash for when it does not. See `handoff.ts`.
              window.dispatchEvent(
                new CustomEvent<TriggerInstallRequest>(INSTALL_TRIGGERS_EVENT, { detail }),
              );
              stashHandoff({ kind: 'triggers', payload: detail });
              router.push('/trade');
            }}
            className="rounded-xl bg-ink px-5 py-3 text-data font-semibold whitespace-nowrap text-ground transition-opacity duration-200 hover:opacity-90"
          >
            install these as a mandate&apos;s exit rules
          </button>
          <span className="text-meta text-faint">
            Takes you to the mandate form with these filled in. Nothing is signed until you create
            the mandate.
          </span>
        </div>
      )}
    </Section>
  );
}

/* -------------------------------------------------------- 4 · the capacity */

export function PlanPanel({ plan }: { plan: NonNullable<RunState['plan']> }) {
  const executable = plan.totalUsdg - plan.unallocated;
  const saved = plan.naiveCost - plan.plannedCost;

  return (
    <Section title="What the chain can actually absorb">
      <Note>
        Sized against live Uniswap V3 depth on X Layer, capped at {pct(plan.maxImpactBps)} price
        impact per leg. Capital the market cannot take is reported back, not forced into it.
      </Note>

      <table className="w-full border-collapse text-meta">
        <thead>
          <tr className="border-b border-line text-micro text-faint uppercase">
            <th className="px-2.5 pb-2 text-left font-semibold">Asset</th>
            <th className="px-2.5 pb-2 text-right font-semibold">Thesis size</th>
            <th className="px-2.5 pb-2 text-right font-semibold">Naive impact</th>
            <th className="px-2.5 pb-2 text-right font-semibold">Capacity</th>
            <th className="px-2.5 pb-2 text-right font-semibold">Executable</th>
            <th className="px-2.5 pb-2 text-right font-semibold">Slices</th>
          </tr>
        </thead>
        <tbody>
          {plan.lines.map((l) => {
            const target = (plan.totalUsdg * l.targetBps) / 10_000;
            const cut = l.notional < target * 0.999;
            return (
              <tr key={l.symbol} className="border-b border-line last:border-0">
                <td className="px-2.5 py-2.5 font-mono whitespace-nowrap text-ink">{l.symbol}</td>
                <td className="px-2.5 py-2.5 text-right font-mono text-dim">{usd(target)}</td>
                <td className="px-2.5 py-2.5 text-right font-mono">
                  <Num tone={l.naiveImpactBps > plan.maxImpactBps ? 'refuse' : undefined}>
                    {pct(l.naiveImpactBps)}
                  </Num>
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-dim">
                  {usd(l.capacityUsdg)}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono">
                  <Num tone={cut ? 'caution' : undefined}>{usd(l.notional)}</Num>
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-dim">{l.slices}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 rounded-lg border border-line bg-raised px-4 py-3.5 text-meta text-dim">
        The thesis is coherent at <Num>{usd(plan.totalUsdg)}</Num> USDG. X Layer can express{' '}
        <Num>{usd(executable)}</Num> of it
        {plan.unallocated > 0 && (
          <>
            {' '}
            . <Num tone="caution">{usd(plan.unallocated)}</Num> is refused rather than forced into a
            market that cannot take it
          </>
        )}
        .
        {saved > 1 && (
          <>
            {' '}
            Executing naively would pay <Num tone="refuse">{usd(plan.naiveCost)}</Num> in slippage;
            sized to capacity it pays <span className="font-mono text-signal">{usd(plan.plannedCost)}</span>.
          </>
        )}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------- 5 · the guard verdict */

export function OraclePanel({ oracle }: { oracle: NonNullable<RunState['oracle']> }) {
  return (
    <Section title="Fair value, gap risk, and the guard's verdict">
      <Note>
        Each leg is priced at the single fill the planner actually proposed for it. This is the
        same decision the on-chain <strong className="text-ink">PolicyGuard</strong> makes: a
        rejection here is a reverted transaction there, in the trade&apos;s own transaction.
      </Note>

      <div className="grid gap-2.5">
        {oracle.verdicts.map((v) => {
          const r = v.report;
          const parts = r.gapRiskParts;
          return (
            <div key={v.symbol} className="rounded-lg border border-line bg-raised px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-data text-ink">{v.symbol}</span>
                {/* `text-micro` carries uppercase tracking and this is a
                    sentence, so it takes the sentence size. */}
                <span className="font-mono text-meta text-faint">
                  {r.reference ?? 'no reference market'} · {r.state} · fill {usd(v.fillSizeUsdg)}{' '}
                  USDG
                </span>
                <Pill tone={v.decision.ok ? 'ok' : 'no'}>
                  {v.decision.ok ? 'ALLOW' : `REJECT ${v.decision.reason}`}
                </Pill>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Metric label="fair value">
                  {/* An unpublishable value is withheld, not displayed. Showing
                      the number the oracle refuses to publish would undo the
                      refusal — the page must be as honest as the contract. */}
                  {r.fairValue == null || !r.publishable ? (
                    <span className="text-caution">withheld</span>
                  ) : (
                    r.fairValue.toFixed(2)
                  )}
                </Metric>
                <Metric label="± band">{pct(r.confidenceBps)}</Metric>
                <Metric label="on chain">
                  {v.onchainPrice == null ? '—' : v.onchainPrice.toFixed(2)}
                </Metric>
                <Metric label="basis">{pct(r.basisBps)}</Metric>
                <Metric label="gap risk">
                  <span className={r.gapRisk > 60 ? 'text-refuse' : ''}>{r.gapRisk}</span>{' '}
                  <Bar value={r.gapRisk / 100} tone={r.gapRisk > 60 ? 'caution' : 'signal'} />
                </Metric>
              </div>

              {/*
                The four components kept their field names when D62 rewrote the
                engine, because renaming them would have broken this seam for no
                gain — but two of them changed meaning, so the labels moved:

                  parts.staleness    → "not quoting": binary now. The mark is
                                       live, so hours-since-print stopped being
                                       the question; whether anyone is making a
                                       market in the token is.
                  parts.displacement → "open gap": nothing is carried forward
                                       any more. This is what the position is
                                       exposed to when the market reopens, and
                                       it stays in the score even when the price
                                       is perfect.
              */}
              <p className="mt-2.5 font-mono text-meta text-faint">
                gap risk = not quoting {parts.staleness.toFixed(2)} / open gap{' '}
                {parts.displacement.toFixed(2)} / band {parts.uncertainty.toFixed(2)} / basis{' '}
                {parts.basis.toFixed(2)}
              </p>

              {v.decision.detail && (
                <p
                  className={`mt-2 font-mono text-meta ${v.decision.ok ? 'text-dim' : 'text-refuse'}`}
                >
                  {v.decision.detail}
                </p>
              )}
              {v.decision.ok && v.impactBps != null && (
                <p className="mt-2 font-mono text-meta text-dim">
                  fill {v.effectivePrice?.toFixed(2)} at {pct(v.impactBps)} impact
                </p>
              )}
              {/* The rejection detail is usually lifted from the notes; showing
                  both prints the same sentence twice. */}
              {(() => {
                const rest = r.notes.filter((n) => n !== v.decision.detail);
                return rest.length > 0 ? (
                  <p className="mt-1 text-meta text-faint italic">{rest.join(' · ')}</p>
                ) : null;
              })()}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-1.5">
      <span className="block text-micro text-faint uppercase">{label}</span>
      <b className="font-mono text-data font-medium">{children}</b>
    </div>
  );
}
