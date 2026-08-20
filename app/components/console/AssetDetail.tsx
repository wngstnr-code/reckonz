import type { Board, BoardAsset } from '@/src/board';
import { AssetMark } from './AssetMark';
import { DepthCurve } from './DepthCurve';
import { TONE, freshness, pct, usd, verdictOf } from './board-format';

/**
 * Everything the board knows about one asset, in the order a reader needs it.
 *
 * **The page opens on the curve and the four readings, side by side.** They
 * were stacked — figures across the top, curve buried a screen down inside the
 * ladder — which put the only picture below the fold and left the numbers with
 * nothing to be read against. Each answers the other now.
 *
 * **The ladder is still the centrepiece, as a table.** A curve says "it gets
 * worse"; the table says at which dollar it stops being allowed and by how many
 * basis points it missed, which is the only form of that fact anyone can act
 * on. So the shape opens the page and the rows carry it.
 *
 * **Capacity is shown at all four limits, not just the mandate's.** How much
 * this market can take is not one number, it is a function of how much slippage
 * you will tolerate, and showing only the 50bp answer hides that tripling your
 * tolerance here roughly doubles what you can move.
 *
 * **Gap risk is broken into the four things it is made of.** A single score is
 * a verdict you have to trust. Staleness, displacement, uncertainty and basis
 * are four claims you can check, and three of them being zero is usually the
 * most informative thing on the page.
 */
export function AssetDetail({
  asset,
  board,
  explorer,
  renderedAt,
}: {
  asset: BoardAsset;
  board: Board;
  explorer: string | null;
  renderedAt: number;
}) {
  const age = freshness(board.measuredAt, renderedAt);
  const limit = board.mandate.maxImpactBps;

  // The largest quoted size this market still accepts, and whether the ladder
  // actually found the boundary or merely ran out of rungs. Those are different
  // facts and only one of them is a limit: if the last rung is allowed, all we
  // know is that the limit is somewhere above it.
  const lastAllowed = [...asset.ladder].reverse().find((r) => r.decision.ok);
  const finalRung = asset.ladder[asset.ladder.length - 1];
  const foundTheEdge = Boolean(lastAllowed && finalRung && lastAllowed !== finalRung);
  const measuredCapacity = asset.capacityUsdg[limit];

  /* The curve takes its colour from the verdict on the smallest size quoted:
     if this market refuses even that, the shape should say so before anybody
     reads a row. Guarded because the ladder can be empty, and it now sits above
     the section that used to prove it was not. */
  const firstRung = asset.ladder[0];
  const curveTone = firstRung ? TONE[verdictOf(asset, firstRung.sizeUsdg).kind].curve : '';

  return (
    <article className="mt-6">
      <header className="flex flex-wrap items-center gap-4">
        <AssetMark symbol={asset.symbol} size={52} />
        <div className="min-w-0">
          <h1 className="font-mono text-title font-semibold text-ink">{asset.symbol}</h1>
          <p className="text-body text-dim">{asset.name ?? 'no on-chain name'}</p>
        </div>

        <div className="ml-auto text-right">
          <div className="font-mono text-micro text-faint uppercase">Token</div>
          {explorer ? (
            <a
              href={`${explorer}/address/${asset.address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-meta text-dim underline underline-offset-3 transition-colors duration-200 hover:text-ink"
            >
              {asset.address.slice(0, 10)}…{asset.address.slice(-8)}
            </a>
          ) : (
            <span className="font-mono text-meta text-faint">{asset.address}</span>
          )}
        </div>
      </header>

      {/* ------------------------------------------------- depth, and price */}

      {/* Two panels on one row: the shape on the left, the readings on the right.
       *
       * The four used to run across the top as a rule of figures, with the
       * curve buried a screen further down inside the ladder. That put the
       * page's only picture below the fold and left the numbers with nothing to
       * be read against. Side by side each one answers the other — the curve is
       * what those readings look like as a size grows, and the readings are the
       * scale the curve has no room to print.
       *
       * The prose that explains the ladder stays underneath both, because it is
       * about the table rather than about either of these.
       *
       * A grid rather than flex: the left column has to be able to shrink
       * without the right one giving up its two columns, and `minmax(0,…)` is
       * what stops a wide curve from refusing to.
       */}
      <section className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-line bg-panel p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="font-mono text-micro text-faint uppercase">Price impact against size</h2>
            <span className="font-mono text-micro text-faint">limit {limit}bp</span>
          </div>

          {/* Tall enough to be looked at rather than glanced past. It was 96px,
              which is a sparkline's height — right in a table row and wrong for
              the one drawing on the page. `DepthCurve` handles a ladder too
              short to draw, so nothing here has to. */}
          <DepthCurve
            asset={asset}
            limitBps={limit}
            interactive
            className={`mt-6 h-[clamp(10rem,24vw,16rem)] w-full ${curveTone}`}
          />
        </div>

        {/* Two by two, and `content-start` so the pairs sit against the top of
            the panel rather than spreading to match the curve beside them. Four
            figures stretched down a tall box read as a list with gaps in it. */}
        <div className="grid grid-cols-2 content-start gap-x-8 gap-y-7 rounded-2xl border border-line bg-panel p-6">
          {asset.publishable && asset.fairValue !== null ? (
            <Figure label="Fair value" value={`${asset.fairValue.toFixed(2)}`}>
              from {asset.reference ?? 'the issuer'}, ±{pct(asset.confidenceBps)}
            </Figure>
          ) : (
            <Figure label="Fair value" value="withheld" tone="text-caution">
              no number we can defend
            </Figure>
          )}

          <Figure
            label="On chain"
            value={asset.onchainPrice === null ? 'not read' : `${asset.onchainPrice.toFixed(2)}`}
          >
            {asset.basisBps === null
              ? 'nothing to compare'
              : `${pct(asset.basisBps)} from fair value`}
          </Figure>

          <Figure label="Gap risk" value={String(asset.gapRisk)} tone={gapTone(asset.gapRisk)}>
            out of 100, while the market is shut
          </Figure>

          <Figure label="Session" value={asset.state}>
            {asset.sharesPerToken === 1
              ? 'one share per token'
              : `${asset.sharesPerToken} shares per token`}
          </Figure>
        </div>
      </section>

      {/* --------------------------------------------------------- ladder */}

      <section className="mt-11">
        <h2 className="text-title font-semibold tracking-tight">What happens as the size grows</h2>
        <p className="mt-2 max-w-[74ch] text-data leading-relaxed text-dim">
          Each row is a real quote walked through this market&rsquo;s liquidity, not an estimate
          from its size. The verdict is the same check the contract runs, against a{' '}
          {limit}bp impact limit.
        </p>

        {asset.ladder.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-panel px-4 py-5 text-data text-dim">
            Nothing was quoted here. {depthSentence(asset)}
          </p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line font-mono text-micro text-faint uppercase">
                    <th className="pb-2 pr-4 font-normal">Size</th>
                    <th className="pb-2 pr-4 text-right font-normal">Impact</th>
                    <th className="pb-2 pr-4 text-right font-normal">You would pay</th>
                    <th className="pb-2 font-normal">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.ladder.map((rung) => {
                    const v = verdictOf(asset, rung.sizeUsdg);
                    return (
                      <tr key={rung.sizeUsdg} className="border-b border-line/60 last:border-b-0">
                        <td className="py-2.5 pr-4 font-mono text-data text-ink">
                          {usd(rung.sizeUsdg)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-data text-dim">
                          {pct(rung.impactBps)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-data text-dim">
                          {rung.effectivePrice === null
                            ? 'n/a'
                            : `$${rung.effectivePrice.toFixed(2)}`}
                        </td>
                        <td className={`py-2.5 text-data ${TONE[v.kind].text}`}>
                          {v.ok ? 'allowed' : v.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-4 max-w-[74ch] text-data leading-relaxed text-dim">
              {lastAllowed && foundTheEdge ? (
                <>
                  The largest size on this ladder that still passes is{' '}
                  <b className="font-semibold text-ink">{usd(lastAllowed.sizeUsdg)}</b>. Above it
                  the trade moves the price against you by more than the mandate allows, and the
                  guard reverts rather than filling it.
                </>
              ) : lastAllowed ? (
                <>
                  Every size quoted here passes, up to{' '}
                  <b className="font-semibold text-ink">{usd(lastAllowed.sizeUsdg)}</b>, which is
                  the largest we quote. The ladder ran out before this market did, so the limit is
                  somewhere above it
                  {measuredCapacity === null || measuredCapacity === undefined ? (
                    '.'
                  ) : (
                    <>
                      {' '}
                      , measured separately at{' '}
                      <b className="font-semibold text-ink">{usd(measuredCapacity)}</b>.
                    </>
                  )}
                </>
              ) : (
                <>
                  Nothing on this ladder is allowed right now, including the smallest size quoted.{' '}
                  {depthSentence(asset)}
                </>
              )}
            </p>
          </>
        )}
      </section>

      {/* ------------------------------------------------------- capacity */}

      <section className="mt-11">
        <h2 className="text-title font-semibold tracking-tight">
          How much it takes, by what you will tolerate
        </h2>
        <p className="mt-2 max-w-[74ch] text-data leading-relaxed text-dim">
          Capacity is not one number. It depends on how far you will let the price move, so here it
          is at four limits. The mandate uses {limit}bp.
        </p>

        <div className="mt-5 flex flex-wrap gap-x-12 gap-y-5">
          {board.capacityLimitsBps.map((bps) => {
            const value = asset.capacityUsdg[bps];
            return (
              <div key={bps}>
                <div
                  className={`font-mono text-micro uppercase ${bps === limit ? 'text-signal' : 'text-faint'}`}
                >
                  {(bps / 100).toFixed(2)}%{bps === limit && ' · mandate'}
                </div>
                <div className="mt-1 font-mono text-lead font-semibold text-ink">
                  {value === null || value === undefined ? 'not read' : usd(value)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- gap risk */}

      <section className="mt-11">
        <h2 className="text-title font-semibold tracking-tight">What the gap score is made of</h2>
        <p className="mt-2 max-w-[74ch] text-data leading-relaxed text-dim">
          A stock keeps trading after this token stops. These four are what the oracle weighs to
          decide how far it could move before you can act, and a score you can take apart is worth
          more than one you have to trust.
        </p>

        <div className="mt-5 grid max-w-[46rem] gap-3">
          <Part
            label="Staleness"
            value={asset.gapRiskParts.staleness}
            explain="how long since we last saw a price"
          />
          <Part
            label="Displacement"
            value={asset.gapRiskParts.displacement}
            explain="how far the market has already moved from our mark"
          />
          <Part
            label="Uncertainty"
            value={asset.gapRiskParts.uncertainty}
            explain="how wide the issuer's own spread is right now"
          />
          <Part
            label="Basis"
            value={asset.gapRiskParts.basis}
            explain="how far this pool sits from fair value"
          />
        </div>
      </section>

      {/* ---------------------------------------------------- where it is */}

      <section className="mt-11 border-t border-line pt-7">
        <div className="flex flex-wrap gap-x-14 gap-y-6">
          <Figure label="Liquidity" value={depthLabel(asset)}>
            {asset.poolCount} {asset.poolCount === 1 ? 'pool' : 'pools'}, {asset.venueCount} with
            depth
          </Figure>

          {/* Null is not a missing field, it is the oracle saying it has
              nothing to price this against — which is the whole of why a value
              gets withheld. Rendering it as a blank would hide the reason. */}
          <Figure
            label="Reference"
            value={asset.reference ?? 'none'}
            tone={asset.reference ? 'text-ink' : 'text-caution'}
          >
            {asset.reference
              ? 'what the issuer prices it against'
              : 'nothing to check a price against'}
          </Figure>
        </div>

        {asset.notes.length > 0 && (
          <div className="mt-7">
            <h2 className="text-title font-semibold tracking-tight">
              What the oracle said about this
            </h2>
            <ul className="mt-2.5 max-w-[74ch] space-y-1.5">
              {asset.notes.map((note) => (
                <li key={note} className="text-data leading-relaxed text-dim">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-7 font-mono text-meta text-faint">
          measured {age.label} ·{' '}
          {new Date(board.measuredAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z
        </p>

        {age.warning && <p className="mt-2 text-data text-caution">{age.warning}</p>}
      </section>
    </article>
  );
}

/** Above 60 the mandate in `board.mandate.maxGapRisk` starts refusing outright. */
const gapTone = (score: number) =>
  score >= 60 ? 'text-refuse' : score >= 30 ? 'text-caution' : 'text-ink';

const depthLabel = (asset: BoardAsset) =>
  asset.depth === 'ok'
    ? 'tradable'
    : asset.depth === 'no-liquidity'
      ? 'empty'
      : asset.depth === 'no-pool'
        ? 'no pool'
        : 'unreadable';

/**
 * Why there is nothing to quote, in the words that distinguish the four cases.
 *
 * `unreadable` is deliberately not phrased as a fact about the market. It is a
 * fact about us, and rendering our failed read as an empty market is the exact
 * mistake `summarise` refuses to make in the totals.
 */
function depthSentence(asset: BoardAsset) {
  if (asset.depth === 'no-pool') return 'No pool has ever been created for this token on X Layer.';
  if (asset.depth === 'no-liquidity') {
    return 'A pool exists but holds nothing right now, so there is no price to trade against.';
  }
  if (asset.depth === 'unreadable') {
    return 'We could not read this market when the board was measured. That is our failure, not the market being empty.';
  }
  return 'The market has depth, so this is about the price rather than the liquidity.';
}

function Figure({
  label,
  value,
  tone = 'text-ink',
  children,
}: {
  label: string;
  value: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-micro text-faint uppercase">{label}</div>
      <div className={`mt-1 font-mono text-lead font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-data text-dim">{children}</div>
    </div>
  );
}

/**
 * One component of the gap score, as a bar you can compare against the others.
 *
 * The parts are fractions of one, so the bar is the value directly rather than
 * a normalised share. A component at zero draws nothing, which is the point:
 * three empty bars and one full one says where the risk actually comes from.
 */
function Part({ label, value, explain }: { label: string; value: number; explain: string }) {
  const width = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4">
      <div className="w-28 shrink-0 text-data font-semibold text-ink">{label}</div>
      <div className="h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-caution" style={{ width: `${width}%` }} />
      </div>
      <div className="w-14 shrink-0 text-right font-mono text-micro text-dim">
        {value === 0 ? 'none' : value.toFixed(2)}
      </div>
      <div className="text-data text-faint">{explain}</div>
    </div>
  );
}
