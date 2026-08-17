'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatUnits } from 'viem';
import { shortfallMeasured } from '@/src/abi';
import { MAINNET } from '@/src/deployments';
import { Bar, Card, Legend, Note, Num, Pill } from './ui';
import { FILLED_EVENT, FOLLOW_EVENT, type FollowRequest } from './follow';
import { stashHandoff } from './handoff';

/**
 * Simple mode, read half: every published thesis and what it actually did.
 *
 * The claim this surface makes is narrow and checkable — the reasoning was
 * published *before* the outcome existed — so the two timestamps sit next to
 * each other rather than in a paragraph. `publishedBeforeExecution` comes from
 * the chain via `src/track-record.ts`; nothing here decides it (D28).
 *
 * The basket is derived from settled fills, not from the thesis text: every
 * thesis published so far carries an empty CID, and the fills are the half that
 * cannot be rewritten (D50). Weights cover entries only.
 *
 * `unattributed` and `orphanedHashes` are rendered, not dropped. Three of the
 * four mainnet receipts carry no thesis hash, and a page that showed only the
 * attributed ones would claim more discipline than the chain shows.
 */

/** `GET /api/theses` serialises BigInt as a decimal string — see the route. */
interface WireFill {
  asset: string;
  symbol: string;
  isExit: boolean;
  amountInUsdg: string;
  amountOut: string;
  executionPriceE8: string;
  slippageBps: number;
  fairValueE8: string;
  gapRisk: number;
}

interface WireReceipt {
  id: number;
  mandateId: string;
  policyVersion: number;
  agent: string;
  thesisHash: string;
  evidenceHash: string;
  timestamp: number;
  blockNumber: string;
  fills: WireFill[];
}

interface WireThesis {
  id: number;
  author: string;
  contentHash: string;
  publishedAt: number;
  blockNumber: string;
  cid: string;
  receipts: WireReceipt[];
  basket: { asset: string; symbol: string; notionalUsdg: string; weightBps: number }[];
  record: {
    fillCount: number;
    entryCount: number;
    exitCount: number;
    notionalUsdg: string;
    weightedSlippageBps: number;
    worstSlippageBps: number;
    firstFillAt: number | null;
    lastFillAt: number | null;
  };
  publishedBeforeExecution: boolean;
}

interface Snapshot {
  chainId: number;
  theses: WireThesis[];
  unattributed: WireReceipt[];
  orphanedHashes: string[];
}

/** UTC to the minute, formatted identically on the server and in the browser. */
const when = (unix: number) =>
  new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';

/** USDG at 6 decimals, from the decimal string the wire carries. */
const usdg = (raw: string) => formatUnits(BigInt(raw), 6);

/** A price the contract records at 8 decimals. */
const e8 = (raw: string) => (Number(BigInt(raw)) / 1e8).toFixed(4);

const short = (hex: string) => `${hex.slice(0, 10)}…${hex.slice(-6)}`;

export function Theses() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/theses');
      const body = await response.json();
      // A throttled RPC is not an empty registry, and the route says which it
      // was. Rendering "no theses yet" over a 502 would be a lie.
      if (!response.ok) setError(body?.error ?? `the registry read failed (${response.status})`);
      else {
        setSnapshot(body as Snapshot);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A fill placed below carries a thesis hash and lands in one of these track
  // records. Re-reading is the loop closing where the user can see it.
  useEffect(() => {
    const onFilled = () => void load();
    window.addEventListener(FILLED_EVENT, onFilled);
    return () => window.removeEventListener(FILLED_EVENT, onFilled);
  }, [load]);

  const explorer = MAINNET?.explorer;

  return (
    <Card title="Published theses">
      <Note>
        A thesis is published on chain before it is executed, and every fill carries its hash. What
        follows is the join: the claim, then what the chain recorded against it. The basket is
        derived from settled fills rather than from the thesis text — the text is a claim, the fills
        are the half that cannot be rewritten.
      </Note>

      {error ? (
        <div className="rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
          <p className="font-mono text-[12px] leading-relaxed break-words text-refuse">{error}</p>
          <p className="mt-1 text-[12px] text-faint">
            The registry could not be read. That is not the same as no theses — nothing is being
            shown because nothing is known.
          </p>
        </div>
      ) : snapshot === null ? (
        <p className="text-[13px] text-dim">Reading both registries from the chain…</p>
      ) : snapshot.theses.length === 0 ? (
        <p className="text-[13px] text-dim">No thesis has been published yet.</p>
      ) : (
        snapshot.theses.map((t) => (
          <Thesis key={t.id} thesis={t} explorer={explorer} />
        ))
      )}

      {snapshot && snapshot.unattributed.length > 0 && (
        <>
          <Legend>
            executed without a published thesis — {snapshot.unattributed.length} receipt
            {snapshot.unattributed.length === 1 ? '' : 's'}
          </Legend>
          <ul className="mb-1 grid gap-0.5">
            {snapshot.unattributed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-3 font-mono text-[12px]">
                <span className="w-24 whitespace-nowrap text-dim">receipt #{r.id}</span>
                <span className="text-faint">{when(r.timestamp)}</span>
                <span className="text-faint">
                  {r.fills.length} fill{r.fills.length === 1 ? '' : 's'} ·{' '}
                  {r.fills.map((f) => f.symbol).join(', ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] leading-relaxed text-faint">
            These are real fills with no thesis behind them. They are counted here rather than
            folded into a thesis they were never bound to.
          </p>
        </>
      )}

      {snapshot && snapshot.orphanedHashes.length > 0 && (
        <>
          <Legend>fills reference a hash that was never published</Legend>
          <ul className="grid gap-0.5">
            {snapshot.orphanedHashes.map((h) => (
              <li key={h} className="font-mono text-[12px] break-all text-refuse">
                {h}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] leading-relaxed text-faint">
            A hash was stamped into a fill without the thesis ever reaching ThesisRegistry. This
            list should be empty.
          </p>
        </>
      )}
    </Card>
  );
}

function Thesis({ thesis: t, explorer }: { thesis: WireThesis; explorer?: string }) {
  const router = useRouter();
  const follow: FollowRequest = {
    thesisId: t.id,
    contentHash: t.contentHash as `0x${string}`,
    assets: t.basket.map((b) => b.asset as `0x${string}`),
    symbols: t.basket.map((b) => b.symbol),
  };

  return (
    <div className="mb-5 rounded-lg border border-line px-4 py-3 last:mb-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] text-ink">thesis #{t.id}</span>
        <span className="font-mono text-[11px] text-faint">published {when(t.publishedAt)}</span>
        {t.record.fillCount === 0 ? (
          <Pill tone="warn">no execution carries this hash yet</Pill>
        ) : t.publishedBeforeExecution ? (
          <Pill tone="ok">published before every fill</Pill>
        ) : (
          <Pill tone="warn">a fill predates the thesis — the ordering claim does not hold</Pill>
        )}
      </div>

      <ul className="mb-1 grid gap-0.5 font-mono text-[11.5px]">
        <li className="flex flex-wrap items-baseline gap-3">
          <span className="w-16 text-faint">author</span>
          {explorer ? (
            <a
              href={`${explorer}/address/${t.author}`}
              target="_blank"
              rel="noreferrer"
              className="break-all text-dim hover:text-signal"
            >
              {t.author}
            </a>
          ) : (
            <span className="break-all text-dim">{t.author}</span>
          )}
        </li>
        <li className="flex flex-wrap items-baseline gap-3">
          <span className="w-16 text-faint">hash</span>
          <span className="break-all text-dim">{t.contentHash}</span>
        </li>
        <li className="flex flex-wrap items-baseline gap-3">
          <span className="w-16 text-faint">cid</span>
          <span className="break-all text-faint">
            {t.cid || 'none — there is nowhere to pin yet, and the hash is what binds'}
          </span>
        </li>
      </ul>

      {t.record.fillCount === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-dim">
          Published, and nothing has executed against it. There is no track record to show, and
          inventing one from the text is the thing this page refuses to do.
        </p>
      ) : (
        <>
          <Legend>
            basket — derived from {t.record.entryCount} settled entr
            {t.record.entryCount === 1 ? 'y' : 'ies'}, {usdg(t.record.notionalUsdg)} USDG
          </Legend>
          <ul className="grid gap-0.5">
            {t.basket.map((b) => (
              <li
                key={b.asset}
                className="flex flex-wrap items-baseline gap-3 font-mono text-[12px] tabular-nums"
              >
                <span className="w-20 text-dim">{b.symbol}</span>
                <span className="w-16 text-right">
                  <Num>{(b.weightBps / 100).toFixed(2)}%</Num>
                </span>
                <Bar value={b.weightBps / 10_000} />
                <span className="w-28 text-right text-faint">{usdg(b.notionalUsdg)} USDG</span>
              </li>
            ))}
          </ul>

          <Legend>record</Legend>
          <ul className="grid gap-0.5 font-mono text-[12px] tabular-nums">
            <Row label="deployed">{usdg(t.record.notionalUsdg)} USDG</Row>
            <Row label="fills">
              {t.record.entryCount} entr{t.record.entryCount === 1 ? 'y' : 'ies'} ·{' '}
              {t.record.exitCount} exit{t.record.exitCount === 1 ? '' : 's'}
            </Row>
            <Row label="slippage">
              <Num tone={t.record.weightedSlippageBps > 50 ? 'caution' : undefined}>
                {t.record.weightedSlippageBps} bps
              </Num>{' '}
              <span className="text-faint">
                weighted by notional · {t.record.worstSlippageBps} bps worst
              </span>
            </Row>
            {t.record.firstFillAt !== null && t.record.lastFillAt !== null && (
              <Row label="window">
                {when(t.record.firstFillAt)} → {when(t.record.lastFillAt)}
              </Row>
            )}
          </ul>

          <Legend>receipts</Legend>
          <ul className="grid gap-1.5">
            {t.receipts.map((r) => (
              <li key={r.id} className="font-mono text-[12px] tabular-nums">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="w-24 whitespace-nowrap text-dim">receipt #{r.id}</span>
                  <span className="text-faint">{when(r.timestamp)}</span>
                  <span className="text-faint">
                    mandate #{r.mandateId} · policy v{r.policyVersion}
                  </span>
                  {explorer && (
                    <a
                      href={`${explorer}/block/${r.blockNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-faint hover:text-signal"
                    >
                      block {r.blockNumber}
                    </a>
                  )}
                  <span className="text-faint" title={r.evidenceHash}>
                    evidence {short(r.evidenceHash)}
                  </span>
                </div>
                <ul className="mt-0.5 grid gap-0.5 pl-4">
                  {r.fills.map((f, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-3 text-[11.5px]">
                      <span className="w-16 text-dim">{f.symbol}</span>
                      <span className="w-12 text-faint">{f.isExit ? 'exit' : 'entry'}</span>
                      <span className="w-24 text-right">
                        <Num>{usdg(f.amountInUsdg)}</Num> <span className="text-faint">USDG</span>
                      </span>
                      <span className="text-faint">
                        at {e8(f.executionPriceE8)} ·{' '}
                        {shortfallMeasured(f)
                          ? `fair ${e8(f.fairValueE8)}`
                          : 'fair withheld'}
                      </span>
                      {/* A zero slippage on an exit the oracle could not price is
                          not a clean sale, it is an unmeasured one — and reading
                          as the best possible number is the worst possible way to
                          show it (D77). */}
                      <span className="text-faint">
                        {shortfallMeasured(f)
                          ? `${f.slippageBps} bps slip`
                          : 'slip unmeasured'}{' '}
                        · gap {f.gapRisk}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {t.basket.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              // Both: the event for when the mandate form shares this page,
              // the stash for when it does not. See `handoff.ts`.
              window.dispatchEvent(new CustomEvent(FOLLOW_EVENT, { detail: follow }));
              stashHandoff({ kind: 'follow', payload: follow });
              router.push('/trade');
            }}
            className="rounded-full border border-signal-deep bg-signal/6 px-3 py-0.5 font-mono text-[11px] text-signal hover:bg-signal/12"
          >
            follow — copy this basket into a mandate
          </button>
          <span className="text-[12px] leading-relaxed text-faint">
            Loads {t.basket.map((b) => b.symbol).join(', ')} into the mandate form above and arms
            the fill below with this thesis&apos;s hash. You size it yourself: this thesis executed
            at {usdg(t.record.notionalUsdg)} USDG, and the depth that absorbs that is not the depth
            that absorbs yours.
          </span>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-3">
      <span className="w-20 text-faint">{label}</span>
      <span className="text-dim">{children}</span>
    </li>
  );
}
