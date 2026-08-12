'use client';

import { useCallback, useEffect, useState } from 'react';
import { erc20Abi, formatUnits, type Address } from 'viem';
import { POLICY_GUARD_ABI, TRIGGER_METRICS, comparatorIndex, metricIndex,
  type TriggerComparator, type TriggerMetric } from '@/src/abi';
import { USDG } from '@/src/chain';
import type { UniverseEntry } from '@/src/pipeline';
import { describeOnchainTrigger, scaleThreshold, type OnchainTrigger } from '@/src/triggers';
import { Card, Legend, Note, Num, Pill } from './ui';
import { useWallet } from './useWallet';

/**
 * A mandate after it exists: what it holds, what rules bound it, and the
 * controls to change them.
 *
 * `getPosition`, `getTriggers`, `setTriggers`, `closeMandate` and
 * `setCircuitBreaker` were all implemented and all unreachable from the browser
 * (D52) — a mandate created here could never be seen again, and the exit
 * triggers that make it risk tooling could only be installed from a terminal.
 *
 * Everything shown is read from the chain through the user's own wallet
 * provider. Nothing is computed here (D28); `describeOnchainTrigger` is the same
 * function the CLI prints with, so a rule cannot read one way in the terminal
 * and another on the page.
 */

interface Loaded {
  id: bigint;
  agent: Address;
  active: boolean;
  breaker: boolean;
  version: number;
  maxNotionalPerTrade: bigint;
  maxSlippageBps: number;
  maxGapRisk: number;
  fillsThisEpoch: number;
  maxFillsPerEpoch: number;
  allowed: { address: Address; symbol: string; units: bigint; decimals: number }[];
  triggers: OnchainTrigger[];
  firing: number[];
}

type Busy = null | { id: bigint; what: string };

export function MandateManage() {
  const { address, option, walletClient, publicClient } = useWallet();

  const [mandates, setMandates] = useState<Loaded[] | null>(null);
  const [universe, setUniverse] = useState<UniverseEntry[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/universe')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setUniverse(d))
      .catch(() => {});
  }, []);

  const symbolOf = new Map(universe.map((u) => [u.address.toLowerCase(), u.symbol]));

  const load = useCallback(async () => {
    if (!publicClient || !option || !address) return;
    const guard = option.deployment.contracts.PolicyGuard as Address | undefined;
    if (!guard) return;

    setError(null);
    try {
      const next = await publicClient.readContract({
        address: guard,
        abi: POLICY_GUARD_ABI,
        functionName: 'nextMandateId',
      });

      const found: Loaded[] = [];
      // Serial, not Promise.all: the public RPC throttles and this is the same
      // discipline `serial()` enforces on the server side.
      for (let id = 1n; id < next; id++) {
        const m = await publicClient.readContract({
          address: guard,
          abi: POLICY_GUARD_ABI,
          functionName: 'getMandate',
          args: [id],
        });
        if (m.owner.toLowerCase() !== address.toLowerCase() || !m.active) continue;

        const list = await publicClient.readContract({
          address: guard,
          abi: POLICY_GUARD_ABI,
          functionName: 'allowedAssets',
          args: [id],
        });

        const allowed: Loaded['allowed'] = [];
        for (const asset of list) {
          const [position, decimals] = await Promise.all([
            publicClient.readContract({
              address: guard,
              abi: POLICY_GUARD_ABI,
              functionName: 'getPosition',
              args: [id, asset],
            }),
            publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }),
          ]);
          allowed.push({
            address: asset,
            symbol: symbolOf.get(asset.toLowerCase()) ?? asset.slice(0, 8),
            units: position.units,
            decimals: Number(decimals),
          });
        }

        const raw = await publicClient.readContract({
          address: guard,
          abi: POLICY_GUARD_ABI,
          functionName: 'getTriggers',
          args: [id],
        });
        const [firedIdx] = await publicClient.readContract({
          address: guard,
          abi: POLICY_GUARD_ABI,
          functionName: 'firedTriggers',
          args: [id],
        });

        found.push({
          id,
          agent: m.agent,
          active: m.active,
          breaker: m.circuitBreaker,
          version: Number(m.version),
          maxNotionalPerTrade: m.policy.maxNotionalPerTrade,
          maxSlippageBps: Number(m.policy.maxSlippageBps),
          maxGapRisk: Number(m.policy.maxGapRisk),
          fillsThisEpoch: Number(m.fillsThisEpoch),
          maxFillsPerEpoch: Number(m.policy.maxFillsPerEpoch),
          allowed,
          triggers: raw.map((x) => ({
            metric: Number(x.metric),
            comparator: Number(x.comparator),
            threshold: x.threshold,
            assets: [...x.assets],
          })),
          firing: firedIdx.map(Number),
        });
      }
      setMandates(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMandates([]);
    }
  }, [publicClient, option, address, universe.length]);

  useEffect(() => {
    void load();
  }, [load]);

  async function write(id: bigint, what: string, send: (guard: Address) => Promise<`0x${string}`>) {
    if (!walletClient || !publicClient || !option) return;
    const guard = option.deployment.contracts.PolicyGuard as Address;
    setBusy({ id, what });
    setError(null);
    try {
      const hash = await send(guard);
      await publicClient.waitForTransactionReceipt({ hash });
      // A confirmed write is not immediately readable on this chain (D18), so
      // the reload below can still show the old value — it is polled by being
      // re-run rather than trusted once.
      await new Promise((r) => setTimeout(r, 1200));
      await load();
    } catch (e) {
      const code = (e as { code?: number })?.code;
      if (code !== 4001) {
        setError((e as { shortMessage?: string }).shortMessage ?? (e as Error).message);
      }
    } finally {
      setBusy(null);
    }
  }

  if (!address || !option) return null;

  return (
    <Card step={8} title="Your mandates">
      <Note>
        What each mandate holds, what rules bound it, and the controls to change them. The position
        is what the guard recorded from settled fills — it can differ from your wallet balance when
        an asset was traded under a different mandate.
      </Note>

      {mandates === null ? (
        <p className="text-[13px] text-dim">Reading your mandates from the chain…</p>
      ) : mandates.length === 0 ? (
        <p className="text-[13px] text-dim">
          No active mandate owned by this address. Create one above.
        </p>
      ) : (
        mandates.map((m) => (
          <div key={m.id.toString()} className="mb-5 rounded-lg border border-line px-4 py-3 last:mb-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] text-ink">mandate #{m.id.toString()}</span>
              <span className="font-mono text-[11px] text-faint">v{m.version}</span>
              {m.breaker ? (
                <Pill tone="no">breaker tripped — nothing executes, exits included</Pill>
              ) : (
                <Pill tone="ok">live</Pill>
              )}
              <span className="font-mono text-[11px] text-faint">
                {formatUnits(m.maxNotionalPerTrade, USDG.decimals)} USDG/trade · ≤{m.maxSlippageBps}bp
                slip · gap ≤{m.maxGapRisk} · {m.fillsThisEpoch}/{m.maxFillsPerEpoch} fills
              </span>
            </div>

            <Legend>positions</Legend>
            <ul className="mb-1 grid gap-0.5">
              {m.allowed.map((a) => (
                <li key={a.address} className="flex items-baseline gap-3 font-mono text-[12px]">
                  <span className="w-16 text-dim">{a.symbol}</span>
                  <Num>{formatUnits(a.units, a.decimals)}</Num>
                  {a.units === 0n && <span className="text-faint">— no recorded position</span>}
                </li>
              ))}
            </ul>

            <Legend>
              exit triggers ({m.triggers.length})
              {m.firing.length > 0 && (
                <span className="text-caution"> · {m.firing.length} firing</span>
              )}
            </Legend>
            {m.triggers.length === 0 ? (
              <p className="mb-2 text-[12.5px] leading-relaxed text-caution">
                None. Nothing will ever tell this mandate to leave a position — it is bounded on
                size and price, but it has no exit rule at all.
              </p>
            ) : (
              <ul className="mb-2 grid gap-0.5">
                {m.triggers.map((t, i) => (
                  <li key={i} className="font-mono text-[12px]">
                    <span className={m.firing.includes(i) ? 'text-caution' : 'text-dim'}>
                      {m.firing.includes(i) ? '⚠ ' : '  '}
                      {describeOnchainTrigger(t, symbolOf)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <TriggerForm
              assets={m.allowed}
              disabled={busy !== null}
              onAdd={(added) =>
                write(m.id, 'installing a trigger', (guard) =>
                  walletClient!.writeContract({
                    address: guard,
                    abi: POLICY_GUARD_ABI,
                    functionName: 'setTriggers',
                    // Replaces wholesale on chain, so the existing set is
                    // rewritten alongside the new one. Sending only the new one
                    // would silently delete every rule already installed.
                    args: [m.id, [...m.triggers, added]],
                    chain: option.chain,
                    account: address!,
                  }),
                )
              }
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  write(m.id, 'breaker', (guard) =>
                    walletClient!.writeContract({
                      address: guard,
                      abi: POLICY_GUARD_ABI,
                      functionName: 'setCircuitBreaker',
                      args: [m.id, !m.breaker],
                      chain: option.chain,
                      account: address!,
                    }),
                  )
                }
                disabled={busy !== null}
                className={`rounded-full border px-3 py-0.5 font-mono text-[11px] disabled:opacity-40 ${
                  m.breaker
                    ? 'border-signal-deep bg-signal/6 text-signal hover:bg-signal/12'
                    : 'border-caution/40 bg-caution/6 text-caution hover:bg-caution/12'
                }`}
              >
                {m.breaker ? 'release breaker' : 'trip breaker'}
              </button>

              <button
                onClick={() => {
                  write(m.id, 'closing', (guard) =>
                    walletClient!.writeContract({
                      address: guard,
                      abi: POLICY_GUARD_ABI,
                      functionName: 'closeMandate',
                      args: [m.id],
                      chain: option.chain,
                      account: address!,
                    }),
                  );
                }}
                disabled={busy !== null}
                className="rounded-full border border-refuse/40 bg-refuse/6 px-3 py-0.5 font-mono text-[11px] text-refuse hover:bg-refuse/12 disabled:opacity-40"
              >
                close mandate
              </button>

              {busy?.id === m.id && (
                <span className="font-mono text-[11px] text-faint">{busy.what}…</span>
              )}
            </div>

            <p className="mt-2 text-[12px] leading-relaxed text-faint">
              Tripping the breaker stops entries <em>and</em> exits through this system. Your assets
              stay in your wallet and remain sellable anywhere — it stops Reckonz acting, not you.
              Closing is permanent.
            </p>
          </div>
        ))
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
          <p className="font-mono text-[12px] leading-relaxed break-words text-refuse">{error}</p>
        </div>
      )}
    </Card>
  );
}

function TriggerForm({
  assets,
  disabled,
  onAdd,
}: {
  assets: { address: Address; symbol: string }[];
  disabled: boolean;
  onAdd: (t: OnchainTrigger) => void;
}) {
  const [metric, setMetric] = useState<TriggerMetric>('gapRisk');
  const [comparator, setComparator] = useState<TriggerComparator>('gt');
  const [threshold, setThreshold] = useState('50');
  const [scope, setScope] = useState<Address[]>([]);

  const valid = Number.isFinite(Number(threshold)) && threshold.trim() !== '';

  return (
    <div className="mt-3 rounded-lg border border-line bg-raised/40 px-3 py-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.09em] text-faint uppercase">metric</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as TriggerMetric)}
            className="rounded-md border border-line bg-raised px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-signal-deep"
          >
            {TRIGGER_METRICS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.09em] text-faint uppercase">is</span>
          <select
            value={comparator}
            onChange={(e) => setComparator(e.target.value as TriggerComparator)}
            className="rounded-md border border-line bg-raised px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-signal-deep"
          >
            <option value="gt">above</option>
            <option value="lt">below</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.09em] text-faint uppercase">
            threshold{metric === 'capacityUsdg' ? ' (USDG)' : ''}
          </span>
          <input
            value={threshold}
            inputMode="decimal"
            onChange={(e) => setThreshold(e.target.value)}
            className="w-24 rounded-md border border-line bg-raised px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-signal-deep"
          />
        </label>

        <button
          onClick={() =>
            onAdd({
              metric: metricIndex(metric),
              comparator: comparatorIndex(comparator),
              // The same scaling the CLI uses, from the same function — only
              // capacityUsdg is denominated in cash, and getting that wrong
              // installs a rule off by a million that never fires.
              threshold: scaleThreshold(metric, Number(threshold)),
              assets: scope,
            })
          }
          disabled={disabled || !valid}
          className="rounded-full border border-signal-deep bg-signal/6 px-3 py-1 font-mono text-[11px] text-signal hover:bg-signal/12 disabled:opacity-40"
        >
          add trigger
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10.5px] text-faint">applies to</span>
        <button
          onClick={() => setScope([])}
          className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] ${
            scope.length === 0
              ? 'border-signal-deep bg-signal/6 text-signal'
              : 'border-line bg-raised text-faint hover:text-ink'
          }`}
        >
          whole basket
        </button>
        {assets.map((a) => {
          const on = scope.includes(a.address);
          return (
            <button
              key={a.address}
              onClick={() =>
                setScope((prev) =>
                  on ? prev.filter((x) => x !== a.address) : [...prev, a.address],
                )
              }
              className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] ${
                on
                  ? 'border-signal-deep bg-signal/6 text-signal'
                  : 'border-line bg-raised text-faint hover:text-ink'
              }`}
            >
              {a.symbol}
            </button>
          );
        })}
      </div>
    </div>
  );
}
