import Link from 'next/link';
import type { Route } from 'next';
import { shortfallMeasured } from '@/src/abi';
import type { EvidenceCheck } from '@/src/evidence';
import type { ViewReceipt, WireThesis } from '@/src/receipts-view';
import { Bar } from '../../ui';
import { AssetMark } from '../AssetMark';
import { Fact, Facts, Section } from '../trade/Section';
import { FollowButton } from './FollowButton';
import { e8, direction, usdg, when } from './format';

/**
 * One receipt, with the three things it can prove.
 *
 * What settled, whether the record of the decision still checks out, and
 * whether a claim was published before any of it happened. In that order,
 * because each one is only interesting if the one before it is true.
 *
 * The evidence check is real here and only here. Re-deriving a hash costs a
 * fetch, and the grid renders twenty cards; a page about one receipt can afford
 * exactly one.
 */
export function ReceiptDetail({
  receipt,
  thesis,
  evidence,
  explorer,
}: {
  receipt: ViewReceipt;
  thesis: WireThesis | null;
  evidence: EvidenceCheck;
  explorer: string | null;
}) {
  return (
    <>
      <header className="mb-9">
        <h1 className="text-title font-semibold tracking-tight">Receipt #{receipt.id}</h1>
        <p className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-meta text-dim">
          <span>{when(receipt.timestamp)}</span>
          {explorer ? (
            <a
              href={`${explorer}/block/${receipt.blockNumber}`}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted hover:text-ink"
            >
              block {receipt.blockNumber}
            </a>
          ) : (
            <span>block {receipt.blockNumber}</span>
          )}
          <span>
            mandate #{receipt.mandateId} · policy v{receipt.policyVersion}
          </span>
        </p>
      </header>

      <Section title={receipt.fills.length === 1 ? 'The fill' : 'The fills'}>
        <ul className="grid gap-6">
          {receipt.fills.map((f, i) => {
            const measured = shortfallMeasured(f);
            return (
              <li key={i}>
                <div className="mb-3 flex items-center gap-3">
                  <AssetMark symbol={f.symbol} size={26} />
                  <span className="font-mono text-data font-semibold text-ink">{f.symbol}</span>
                  <span className="text-meta text-dim">{f.isExit ? 'exit' : 'entry'}</span>
                </div>
                <Facts>
                  <Fact label="Notional" hint="USDG">
                    {usdg(f.amountInUsdg)}
                  </Fact>
                  <Fact label="Executed at">{e8(f.executionPriceE8)}</Fact>
                  <Fact
                    label="Fair value"
                    hint={measured ? 'what the oracle would defend' : undefined}
                  >
                    {measured ? e8(f.fairValueE8) : 'withheld'}
                  </Fact>
                  {/* The number the whole system exists to record, and the one
                      place a zero has two meanings. Rendering an unmeasured
                      sale as `0 bps` shows the best possible number for the
                      worst possible reason (D77). */}
                  <Fact
                    label="Shortfall"
                    hint={
                      measured
                        ? 'below fair value, one-sided'
                        : 'the oracle had gone stale, so nothing measured it'
                    }
                  >
                    {measured ? (
                      <span className={f.slippageBps > 50 ? 'text-caution' : undefined}>
                        {f.slippageBps} bps
                      </span>
                    ) : (
                      <span className="text-caution">unmeasured</span>
                    )}
                  </Fact>
                  <Fact label="Gap risk" hint="0 to 100, overnight">
                    {f.gapRisk}
                  </Fact>
                  {/* Only on an exit. `amountOut` is USDG at six decimals when
                      selling and the asset at its own decimals when buying, and
                      nothing on the wire carries those decimals -- formatting an
                      entry here rendered one as 642,628,309 of something. The
                      notional and the price already say what was bought. */}
                  {f.isExit && (
                    <Fact label="Received" hint="USDG, net of the execution fee">
                      {usdg(f.amountOut)}
                    </Fact>
                  )}
                </Facts>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Evidence">
        <Evidence hash={receipt.evidenceHash} check={evidence} />
      </Section>

      <Section title="Thesis">
        {thesis ? (
          <Thesis thesis={thesis} receipt={receipt} />
        ) : (
          <p className="max-w-[62ch] text-data leading-relaxed text-dim">
            No thesis carries this fill. It is counted here rather than folded into one it was
            never bound to.
          </p>
        )}
      </Section>
    </>
  );
}

/**
 * The hash, and whether the bundle behind it still produces it.
 *
 * Four outcomes, and they are not interchangeable. `unreachable` means nobody
 * archived it, which was never auditable; `mismatch` means a bundle exists and
 * has been edited, which is the one this page was built to be able to say.
 */
function Evidence({ hash, check }: { hash: string; check: EvidenceCheck }) {
  if (check.kind === 'none') {
    return (
      <p className="max-w-[62ch] text-data leading-relaxed text-refuse">
        No evidence hash was stamped into this receipt. Nothing about the decision behind it can be
        checked by anyone, now or later.
      </p>
    );
  }

  return (
    <>
      <p className="font-mono text-meta break-all text-dim [overflow-wrap:anywhere]">{hash}</p>

      {check.kind === 'verified' ? (
        <p className="mt-3 max-w-[62ch] text-data leading-relaxed text-signal">
          Verified. The stored bundle re-derives exactly this hash, and the hash went on chain
          before the trade.
        </p>
      ) : check.kind === 'mismatch' ? (
        <p className="mt-3 max-w-[62ch] text-data leading-relaxed text-refuse">
          A bundle exists and does not re-derive this hash. It has been changed since the receipt
          was written. This is the failure the hash exists to catch.
        </p>
      ) : (
        <p className="mt-3 max-w-[62ch] text-data leading-relaxed text-caution">
          The hash is on chain and the bundle is not reachable from here. Nobody can audit this one
          unless a copy turns up.
        </p>
      )}

      {check.kind === 'verified' && check.url && (
        <a
          href={check.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-meta text-dim underline decoration-dotted hover:text-ink"
        >
          Fetch the bundle and check it yourself
        </a>
      )}

      {check.kind === 'verified' && check.source === 'file' && (
        <p className="mt-3 max-w-[62ch] text-meta leading-relaxed text-faint">
          Read from this deployment&apos;s own copy, not from the public archive. It verifies, and a
          stranger cannot reach it.
        </p>
      )}
    </>
  );
}

/** The claim, its ordering against this fill, and the one action it carries. */
function Thesis({ thesis: t, receipt }: { thesis: WireThesis; receipt: ViewReceipt }) {
  const seconds = receipt.timestamp - t.publishedAt;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-data font-semibold text-ink">thesis #{t.id}</span>
        <span className="font-mono text-micro text-faint">published {when(t.publishedAt)}</span>
      </div>

      {/* The whole claim of this page, as an interval rather than a paragraph.
          Reasoning-predates-outcome is proved more cheaply by two timestamps
          than by any amount of prose about discipline. */}
      <p className={`mt-2 text-data ${seconds > 0 ? 'text-signal' : 'text-refuse'}`}>
        {seconds > 0
          ? `Published ${formatGap(seconds)} before this fill settled.`
          : 'This fill settled before the thesis was published, so the ordering claim does not hold.'}
      </p>

      {t.basket.length > 0 && (
        <ul className="mt-4 grid gap-1">
          {t.basket.map((b) => (
            <li
              key={b.asset}
              className="flex flex-wrap items-baseline gap-3 font-mono text-meta tabular-nums"
            >
              <span className="w-20 text-dim">{b.symbol}</span>
              <span className="w-16 text-right text-ink">{(b.weightBps / 100).toFixed(2)}%</span>
              <Bar value={b.weightBps / 10_000} />
              <span className="w-28 text-right text-faint">{usdg(b.notionalUsdg)} USDG</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 font-mono text-meta tabular-nums text-dim">
        {usdg(t.record.notionalUsdg)} USDG over {t.record.fillCount} fill
        {t.record.fillCount === 1 ? '' : 's'} · {t.record.weightedSlippageBps} bps weighted
      </p>

      {t.receipts.length > 1 && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-meta text-dim">
          <span className="text-faint">also</span>
          {t.receipts
            .filter((r) => r.id !== receipt.id)
            .map((r) => (
              <Link
                key={r.id}
                href={`/receipts/${r.id}` as Route}
                className="font-mono underline decoration-dotted hover:text-ink"
              >
                receipt #{r.id}
              </Link>
            ))}
        </p>
      )}

      {t.basket.length > 0 && (
        <div className="mt-6">
          <FollowButton thesisId={t.id} contentHash={t.contentHash} basket={t.basket} />
          <p className="mt-3 max-w-[62ch] text-meta leading-relaxed text-dim">
            Loads {t.basket.map((b) => b.symbol).join(', ')} into the mandate form on /trade and
            arms the fill with this hash. You size it yourself: this executed at{' '}
            {usdg(t.record.notionalUsdg)} USDG, and the depth that absorbed that is not the depth
            that absorbs yours.
          </p>
        </div>
      )}
    </>
  );
}

/** Seconds into the largest unit that still reads as a number, not a duration. */
function formatGap(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}
