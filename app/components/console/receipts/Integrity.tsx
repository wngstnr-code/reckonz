import type { Summary, WireSnapshot } from '@/src/receipts-view';
import { MAINNET } from '@/src/deployments';

/**
 * The checks, including the ones that passed.
 *
 * Orphaned hashes were already computed and rendered only when the list was not
 * empty, so a reader never learned that zero was the result of looking. A zero
 * that is shown is a claim; a zero that is hidden is nothing at all, and this
 * is the page whose entire job is showing the checks.
 *
 * Every row here is either free or already in the snapshot. Nothing on this
 * page performs a chain read to decorate itself.
 */
export function Integrity({
  snapshot,
  summary,
}: {
  snapshot: WireSnapshot;
  summary: Summary;
}) {
  const orphans = snapshot.orphanedHashes.length;
  const unarchived = summary.receiptCount - summary.withEvidence;
  const oracle = MAINNET?.contracts.FairValueOracle;

  return (
    <dl className="grid gap-x-14 md:grid-cols-2">
      <Check
        label="Orphaned hashes"
        value={orphans === 0 ? 'none' : `${orphans}`}
        tone={orphans === 0 ? 'ok' : 'bad'}
      >
        A fill stamped a thesis hash that was never published. This should always be zero.
      </Check>

      <Check
        label="Receipts with no evidence"
        value={unarchived === 0 ? 'none' : `${unarchived} of ${summary.receiptCount}`}
        tone={unarchived === 0 ? 'ok' : 'warn'}
      >
        Nothing about these can be checked by anyone, now or later.
      </Check>

      <Check
        label="Unmeasured fills"
        value={summary.unmeasuredFills === 0 ? 'none' : `${summary.unmeasuredFills}`}
        tone={summary.unmeasuredFills === 0 ? 'ok' : 'warn'}
      >
        Sold with a stale oracle, so no shortfall was measured. Their zero is not a good price.
      </Check>

      <Check label="Oracle admin" value="a 2-of-3 Safe" tone="ok">
        {oracle ? (
          <>
            Read{' '}
            <a
              href={`https://sourcify.dev/#/lookup/${oracle}`}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted hover:text-ink"
            >
              the verified source
            </a>{' '}
            and call <code>admin()</code> yourself. Who administers the oracle is provenance.
          </>
        ) : (
          'No mainnet deployment is configured here.'
        )}
      </Check>
    </dl>
  );
}

function Check({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'bad';
  children: React.ReactNode;
}) {
  const colour =
    tone === 'ok' ? 'text-signal' : tone === 'warn' ? 'text-caution' : 'text-refuse';
  return (
    <div className="border-b border-line/60 py-4">
      <div className="flex items-baseline justify-between gap-6">
        <dt className="text-meta text-dim">{label}</dt>
        <dd className={`font-mono text-meta tabular-nums ${colour}`}>{value}</dd>
      </div>
      <p className="mt-1 max-w-[52ch] text-meta text-faint">{children}</p>
    </div>
  );
}
