import Link from 'next/link';
import type { Route } from 'next';
import { shortfallMeasured } from '@/src/abi';
import type { EvidenceBundle, EvidenceCheck } from '@/src/evidence';
import type { ViewReceipt, WireThesis } from '@/src/receipts-view';
import { Bar } from '../../ui';
import { AssetMark } from '../AssetMark';
import { Fact, Facts, Section } from '../trade/Section';
import { FollowButton } from './FollowButton';
import { e8, direction, unitsBought, usdg, when } from './format';

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
  registry,
}: {
  receipt: ViewReceipt;
  thesis: WireThesis | null;
  evidence: EvidenceCheck;
  explorer: string | null;
  /** `ReceiptRegistry`, so a reader can re-read this receipt at the source. */
  registry: string | null;
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

        {/* Who stamped it, and where the canonical copy lives.
            
            There is no transaction hash to link: `ReceiptRegistry.Receipt`
            records a block number and nothing finer, and recovering the hash
            needs a log scan that `loadReceipts` deliberately avoids on this RPC.
            The registry read is the better link anyway -- `get(id)` returns this
            exact struct, so a reader checks the source rather than a
            transaction that merely contained it. */}
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-micro text-faint">
          <span className="[overflow-wrap:anywhere]">agent {receipt.agent}</span>
          {registry && explorer && (
            <a
              href={`${explorer}/address/${registry}`}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted hover:text-dim"
            >
              call get({receipt.id}) on the registry yourself
            </a>
          )}
        </p>
      </header>

      <Section title={receipt.fills.length === 1 ? 'The fill' : 'The fills'}>
        {/* Only where the reader would otherwise think something is missing: one
            asset here under a thesis that names several. The answer is
            structural rather than a limit of this page, so it is worth a line. */}
        {receipt.fills.length === 1 && (thesis?.basket.length ?? 0) > 1 && (
          <p className="mb-5 max-w-[62ch] text-meta leading-relaxed text-dim">
            One asset, though thesis #{thesis?.id} names {thesis?.basket.length}. A Permit2
            signature authorises one token, so a basket settles as one receipt per asset rather
            than one receipt holding all of them.
          </p>
        )}
        <ul className="grid gap-6">
          {receipt.fills.map((f, i) => {
            const measured = shortfallMeasured(f);
            return (
              <li key={i}>
                <div className="mb-3 flex items-center gap-3">
                  <AssetMark symbol={f.symbol} size={26} />
                  {/* The board already has a page for this asset, measured. */}
                  <Link
                    href={`/assets/${f.symbol}` as Route}
                    className="font-mono text-data font-semibold text-ink hover:text-signal"
                  >
                    {f.symbol}
                  </Link>
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
                  {f.isExit ? (
                    <Fact label="Received" hint="USDG, net of the execution fee">
                      {usdg(f.amountOut)}
                    </Fact>
                  ) : (
                    <Fact label="Bought" hint={f.symbol}>
                      {unitsBought(f.amountInUsdg, f.executionPriceE8) ?? '—'}
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

      {evidence.kind === 'verified' && (
        <Section title="The decision">
          <Decision bundle={evidence.bundle} receipt={receipt} />
        </Section>
      )}

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

/**
 * What was decided, before the chain answered.
 *
 * Every number here was already in hand: the page fetches this bundle to check
 * the hash and used to discard it, which made the surface that exists to show a
 * decision the one surface that did not. Nothing below costs an extra read.
 *
 * The guard's verdict leads, because being asked *before* gas is spent is the
 * claim the product makes and this is the recording of it.
 */
function Decision({ bundle, receipt }: { bundle: EvidenceBundle; receipt: ViewReceipt }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`text-data ${bundle.dryRun.ok ? 'text-signal' : 'text-refuse'}`}>
          {bundle.dryRun.ok ? 'The guard allowed it' : `The guard refused: ${bundle.dryRun.reason}`}
        </span>
        <span className="font-mono text-micro text-faint">
          asked at {when(bundle.decidedAt)}, before any gas was spent
        </span>
      </div>

      {/* Per leg, not `legs[0]`.
      
          Every receipt on this chain carries exactly one, because a Permit2
          signature names one token and a basket therefore settles as several
          receipts. But `ReceiptRegistry.Fill[]` and `Executor.execute(Leg[])`
          are both arrays, so a multi-leg receipt is reachable and the first
          version of this block would have rendered one leg and silently dropped
          the rest -- the failure mode this whole page was rebuilt to remove. */}
      {bundle.legs.map((leg, i) => {
        const observed = bundle.observations.find(
          (o) => o.asset.toLowerCase() === leg.asset.toLowerCase(),
        );
        const stale = observed !== undefined && observed.ageSeconds > 3600;

        return (
          <div key={leg.asset + i} className={i === 0 ? undefined : 'mt-6'}>
            {bundle.legs.length > 1 && (
              <h3 className="mb-2 font-mono text-data font-semibold text-ink">{leg.symbol}</h3>
            )}
            <Facts>
              {/* The fact that separates a measured zero from an unmeasured one,
                  and it was sitting in a file this page already opened. */}
              {observed && (
                <Fact
                  label="Oracle age at decision"
                  hint={stale ? 'stale, so no shortfall could be measured' : 'fresh'}
                >
                  <span className={stale ? 'text-caution' : undefined}>
                    {observed.ageSeconds}s
                  </span>
                </Fact>
              )}
              {observed && (
                <Fact label="Confidence" hint="the oracle's own uncertainty">
                  {(observed.confidenceBps / 100).toFixed(2)}%
                </Fact>
              )}
              {floorBps(bundle, receipt, i) !== null && (
                <Fact label="Floor carried" hint="under what it got, or it reverts">
                  {floorBps(bundle, receipt, i)} bps
                </Fact>
              )}
              {leg.impactBps !== null && (
                <Fact label="Impact planned" hint="what the planner measured against the pool">
                  {leg.impactBps} bps
                </Fact>
              )}
              <Fact label="Fee tier">{leg.feeTier}</Fact>
              {i === bundle.legs.length - 1 && (
                <Fact label="Executor" hint="the only contract the permit named">
                  <span className="[overflow-wrap:anywhere]">{bundle.executor}</span>
                </Fact>
              )}
            </Facts>
          </div>
        );
      })}

      {/* D77's whole point, and the card above can only say "unmeasured". This
          says whether the seller was told that and went ahead anyway, which is
          the difference between a gap in the record and a choice. */}
      {bundle.shortfall && (
        <p
          className={`mt-4 max-w-[62ch] text-data leading-relaxed ${
            bundle.shortfall.acknowledged ? 'text-caution' : 'text-refuse'
          }`}
        >
          {bundle.shortfall.acknowledged
            ? 'The shortfall could not be measured, the seller was told, and the sale went ahead without slippage protection.'
            : 'The shortfall could not be measured and no acknowledgement was recorded.'}
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
        {t.record.fillCount === 1 ? '' : 's'} · {t.record.weightedSlippageBps} bps weighted ·{' '}
        {/* The weighted figure alone flatters a thesis with one bad leg among
            several good ones, which is the shape most baskets have. */}
        {t.record.worstSlippageBps} bps worst
      </p>

      {t.record.firstFillAt !== null && t.record.lastFillAt !== null && (
        <p className="mt-1 font-mono text-meta tabular-nums text-faint">
          {when(t.record.firstFillAt)} → {when(t.record.lastFillAt)}
        </p>
      )}

      {/* The value stamped into every fill that claims this thesis. It is the
          artefact that binds the claim to the trade, and this page dropped it
          for a day. `cid` says out loud that there is nowhere to pin yet. */}
      <dl className="mt-4 grid gap-1 font-mono text-micro text-faint">
        <Detail label="author">{t.author}</Detail>
        <Detail label="hash">{t.contentHash}</Detail>
        <Detail label="cid">
          {t.cid || 'none, there is nowhere to pin yet and the hash is what binds'}
        </Detail>
      </dl>

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

/**
 * How much headroom the trade had before it would have reverted, in bps.
 *
 * The floor against **what the chain actually returned**, not against the
 * simulation. `simulatedOut` is a decimal string while `minAmountOut` is base
 * units, so dividing those two produces a large plausible number that means
 * nothing -- it did, and it put `637158241607252` on the page before that was
 * noticed. `amountOut` on the receipt is base units of the same token as
 * `minAmountOut` in both directions, so this division cancels the decimals
 * whatever they are and no guess about them is needed.
 */
function floorBps(bundle: EvidenceBundle, receipt: ViewReceipt, index = 0): number | null {
  const leg = bundle.legs[index];
  // Matched by asset rather than by position: the bundle's leg order is the
  // planner's and the receipt's fill order is the chain's, and nothing promises
  // they agree.
  const fill = leg
    ? receipt.fills.find((f) => f.asset.toLowerCase() === leg.asset.toLowerCase())
    : undefined;
  if (!leg || !fill) return null;

  const got = BigInt(fill.amountOut);
  if (got <= 0n) return null;

  const floor = BigInt(leg.minAmountOut);
  // A floor at or above what came back cannot be right: the swap would have
  // reverted. Say nothing rather than render a negative margin.
  if (floor >= got) return null;

  return Number(((got - floor) * 10_000n) / got);
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="w-14 shrink-0">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
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
