'use client';

import { useCallback, useEffect, useState } from 'react';
import { erc20Abi, formatUnits, getAddress, isAddress, parseUnits, type Address } from 'viem';
import { POLICY_GUARD_ABI, TRIGGER_METRICS, comparatorIndex, metricIndex,
  type TriggerComparator, type TriggerMetric } from '@/src/abi';
import { USDG } from '@/src/chain';
import type { UniverseEntry } from '@/src/pipeline';
import { describeOnchainTrigger, scaleThreshold, type OnchainTrigger } from '@/src/triggers';
import { awaitReceipt } from './awaitReceipt';
import { FILLED_EVENT, MANDATES_CHANGED_EVENT } from './follow';
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

/** Mirrors the `Policy` struct in `POLICY_GUARD_ABI`, field for field. */
interface Policy {
  maxWeightBps: number;
  minCashBufferBps: number;
  maxSlippageBps: number;
  maxDeviationBps: number;
  maxGapRisk: number;
  maxNotionalPerTrade: bigint;
  maxFillsPerEpoch: number;
  epochDuration: number;
  minRebalanceInterval: number;
  enforceWeights: boolean;
}

interface Loaded {
  id: bigint;
  agent: Address;
  executor: Address;
  active: boolean;
  breaker: boolean;
  version: number;
  maxNotionalPerTrade: bigint;
  maxSlippageBps: number;
  maxGapRisk: number;
  fillsThisEpoch: number;
  maxFillsPerEpoch: number;
  policy: Policy;
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
          executor: m.executor,
          active: m.active,
          breaker: m.circuitBreaker,
          version: Number(m.version),
          maxNotionalPerTrade: m.policy.maxNotionalPerTrade,
          maxSlippageBps: Number(m.policy.maxSlippageBps),
          maxGapRisk: Number(m.policy.maxGapRisk),
          fillsThisEpoch: Number(m.fillsThisEpoch),
          maxFillsPerEpoch: Number(m.policy.maxFillsPerEpoch),
          policy: {
            maxWeightBps: Number(m.policy.maxWeightBps),
            minCashBufferBps: Number(m.policy.minCashBufferBps),
            maxSlippageBps: Number(m.policy.maxSlippageBps),
            maxDeviationBps: Number(m.policy.maxDeviationBps),
            maxGapRisk: Number(m.policy.maxGapRisk),
            maxNotionalPerTrade: m.policy.maxNotionalPerTrade,
            maxFillsPerEpoch: Number(m.policy.maxFillsPerEpoch),
            epochDuration: Number(m.policy.epochDuration),
            minRebalanceInterval: Number(m.policy.minRebalanceInterval),
            enforceWeights: m.policy.enforceWeights,
          },
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

  // A mandate created above, or a fill placed below, changes what this panel is
  // describing — a new mandate, or a position that just moved. Re-read rather
  // than show a number the chain has already left behind.
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener(MANDATES_CHANGED_EVENT, reload);
    window.addEventListener(FILLED_EVENT, reload);
    return () => {
      window.removeEventListener(MANDATES_CHANGED_EVENT, reload);
      window.removeEventListener(FILLED_EVENT, reload);
    };
  }, [load]);

  async function write(id: bigint, what: string, send: (guard: Address) => Promise<`0x${string}`>) {
    if (!walletClient || !publicClient || !option) return;
    const guard = option.deployment.contracts.PolicyGuard as Address;
    setBusy({ id, what });
    setError(null);
    try {
      const hash = await send(guard);
      await awaitReceipt(publicClient, hash);
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

            <Legend>asset allowlist</Legend>
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {m.allowed.map((a) => (
                <span
                  key={a.address}
                  className="flex items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-dim"
                >
                  {a.symbol}
                  <button
                    onClick={() =>
                      write(m.id, `disallowing ${a.symbol}`, (guard) =>
                        walletClient!.writeContract({
                          address: guard,
                          abi: POLICY_GUARD_ABI,
                          functionName: 'setAssetAllowed',
                          args: [m.id, a.address, false],
                          chain: option.chain,
                          account: address!,
                        }),
                      )
                    }
                    disabled={busy !== null}
                    className="text-refuse hover:text-refuse disabled:opacity-40"
                    title={`disallow ${a.symbol}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <p className="mb-1 text-[12px] leading-relaxed text-faint">
              Disallowing stops new fills into an asset — it does not sell what this mandate already
              holds, and an exit is itself a fill the guard checks against this list. Exit first,
              then disallow.
            </p>
            <AssetAllowlistForm
              allowed={m.allowed}
              universe={universe}
              disabled={busy !== null}
              onAllow={(asset) =>
                write(m.id, 'allowing an asset', (guard) =>
                  walletClient!.writeContract({
                    address: guard,
                    abi: POLICY_GUARD_ABI,
                    functionName: 'setAssetAllowed',
                    args: [m.id, asset, true],
                    chain: option.chain,
                    account: address!,
                  }),
                )
              }
            />

            <Legend>policy</Legend>
            <PolicyForm
              key={`${m.id}-${m.version}`}
              policy={m.policy}
              disabled={busy !== null}
              onSubmit={(next) =>
                write(m.id, 'updating the policy', (guard) =>
                  walletClient!.writeContract({
                    address: guard,
                    abi: POLICY_GUARD_ABI,
                    functionName: 'updatePolicy',
                    // The whole struct, always — every field not touched in the
                    // form is carried over from what was just read, because
                    // `updatePolicy` replaces wholesale and rebuilding it from
                    // defaults would silently reset them.
                    args: [m.id, next],
                    chain: option.chain,
                    account: address!,
                  }),
                )
              }
            />

            <Legend>agent</Legend>
            <p className="mb-1 text-[12px] leading-relaxed text-faint">
              The agent proposes trades. It can never exceed the policy above, and it can never move
              funds without a Permit2 signature the owner produces per execution.
            </p>
            <AddressForm
              current={m.agent}
              disabled={busy !== null}
              submitLabel="rotate agent"
              onSubmit={(next) =>
                write(m.id, 'rotating the agent', (guard) =>
                  walletClient!.writeContract({
                    address: guard,
                    abi: POLICY_GUARD_ABI,
                    functionName: 'setAgent',
                    args: [m.id, next],
                    chain: option.chain,
                    account: address!,
                  }),
                )
              }
            />

            <Legend>executor</Legend>
            <p className="mb-1 text-[12px] leading-relaxed text-faint">
              Where fills are pulled from with Permit2. A mandate pointing at an executor not
              deployed here can never be filled from this app.
            </p>
            <AddressForm
              current={m.executor}
              disabled={busy !== null}
              submitLabel="point at executor"
              defaultAddress={option.deployment.contracts.Executor as Address | undefined}
              defaultLabel="use this deployment's Executor"
              onSubmit={(next) =>
                write(m.id, 'pointing at a new executor', (guard) =>
                  walletClient!.writeContract({
                    address: guard,
                    abi: POLICY_GUARD_ABI,
                    functionName: 'setExecutor',
                    args: [m.id, next],
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

/** Picks an asset from `/api/universe` that is not already on the mandate, and allows it. */
function AssetAllowlistForm({
  allowed,
  universe,
  disabled,
  onAllow,
}: {
  allowed: { address: Address }[];
  universe: UniverseEntry[];
  disabled: boolean;
  onAllow: (asset: Address) => void;
}) {
  const [picked, setPicked] = useState<Address | ''>('');
  const options = universe.filter(
    (u) => !allowed.some((a) => a.address.toLowerCase() === u.address.toLowerCase()),
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <select
        value={picked}
        onChange={(e) => setPicked(e.target.value as Address | '')}
        className="rounded-md border border-line bg-raised px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-signal-deep"
      >
        <option value="">allow an asset…</option>
        {options.map((u) => (
          <option key={u.address} value={u.address}>
            {u.symbol}
          </option>
        ))}
      </select>
      <button
        onClick={() => picked && onAllow(picked)}
        disabled={disabled || !picked}
        className="rounded-full border border-signal-deep bg-signal/6 px-3 py-0.5 font-mono text-[11px] text-signal hover:bg-signal/12 disabled:opacity-40"
      >
        allow
      </button>
    </div>
  );
}

/** `draft` mirrors `Policy` as strings, so every field round-trips through an
 * `<input>` without losing the bigint precision `maxNotionalPerTrade` needs. */
function draftFromPolicy(p: Policy) {
  return {
    maxWeightBps: String(p.maxWeightBps),
    minCashBufferBps: String(p.minCashBufferBps),
    maxSlippageBps: String(p.maxSlippageBps),
    maxDeviationBps: String(p.maxDeviationBps),
    maxGapRisk: String(p.maxGapRisk),
    maxNotionalUsdg: formatUnits(p.maxNotionalPerTrade, USDG.decimals),
    maxFillsPerEpoch: String(p.maxFillsPerEpoch),
    epochDuration: String(p.epochDuration),
    minRebalanceInterval: String(p.minRebalanceInterval),
    enforceWeights: p.enforceWeights,
  };
}

/** Integer in `[0, max]`, `max` being the field's on-chain width — checked here
 * so an out-of-range value fails with a sentence instead of reverting on chain. */
function boundedInt(raw: string, max: number, label: string): number {
  // `Number('')` is 0 and `Number.isInteger(0)` is true, so a field the user
  // cleared would otherwise submit as zero — and zero is not a harmless default
  // here: `maxFillsPerEpoch: 0` refuses every fill the mandate will ever be
  // asked to make, entries and exits alike. An empty field is a mistake, not an
  // instruction.
  if (raw.trim() === '') throw new Error(`${label} is empty — give it a number`);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new Error(`${label} must be a whole number between 0 and ${max}`);
  }
  return n;
}

/**
 * The full `Policy` struct, pre-filled and submitted whole.
 *
 * `updatePolicy` takes every field, not a diff — the same hazard `mandate-edit.ts`
 * calls out. So this form always sends back everything in `policy`, with only the
 * touched fields changed, rather than building a fresh object from what is on
 * screen (which would reset anything the user did not open the form to see).
 */
function PolicyForm({
  policy,
  disabled,
  onSubmit,
}: {
  policy: Policy;
  disabled: boolean;
  onSubmit: (next: Policy) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFromPolicy(policy));
  const [err, setErr] = useState<string | null>(null);

  const set = (key: keyof ReturnType<typeof draftFromPolicy>) => (v: string) =>
    setDraft((d) => ({ ...d, [key]: v }));

  function submit() {
    setErr(null);
    try {
      // Same trap as `boundedInt`: an empty box is not a request for zero, and
      // `maxNotionalPerTrade: 0` rejects every trade with NOTIONAL.
      const usdg = Number(draft.maxNotionalUsdg);
      if (draft.maxNotionalUsdg.trim() === '' || !Number.isFinite(usdg) || usdg <= 0) {
        throw new Error('max per trade must be a positive number of USDG');
      }
      const next: Policy = {
        maxWeightBps: boundedInt(draft.maxWeightBps, 65_535, 'max weight bps'),
        minCashBufferBps: boundedInt(draft.minCashBufferBps, 65_535, 'min cash buffer bps'),
        maxSlippageBps: boundedInt(draft.maxSlippageBps, 65_535, 'max slippage bps'),
        maxDeviationBps: boundedInt(draft.maxDeviationBps, 65_535, 'max deviation bps'),
        maxGapRisk: boundedInt(draft.maxGapRisk, 255, 'max gap risk'),
        maxNotionalPerTrade: parseUnits(draft.maxNotionalUsdg, USDG.decimals),
        maxFillsPerEpoch: boundedInt(draft.maxFillsPerEpoch, 65_535, 'max fills per epoch'),
        epochDuration: boundedInt(draft.epochDuration, 4_294_967_295, 'epoch duration'),
        minRebalanceInterval: boundedInt(
          draft.minRebalanceInterval,
          4_294_967_295,
          'min rebalance interval',
        ),
        enforceWeights: draft.enforceWeights,
      };
      onSubmit(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="mb-3 rounded-full border border-line bg-raised px-3 py-0.5 font-mono text-[11px] text-faint hover:text-ink disabled:opacity-40"
      >
        edit policy
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-line bg-raised/40 px-3 py-2.5">
      <div className="flex flex-wrap gap-3">
        <PField label="max weight" suffix="bps" value={draft.maxWeightBps} onChange={set('maxWeightBps')} />
        <PField
          label="min cash buffer"
          suffix="bps"
          value={draft.minCashBufferBps}
          onChange={set('minCashBufferBps')}
        />
        <PField
          label="max slippage"
          suffix="bps"
          value={draft.maxSlippageBps}
          onChange={set('maxSlippageBps')}
        />
        <PField
          label="max off fair value"
          suffix="bps"
          value={draft.maxDeviationBps}
          onChange={set('maxDeviationBps')}
        />
        <PField label="max gap risk" value={draft.maxGapRisk} onChange={set('maxGapRisk')} />
        <PField
          label="max per trade"
          suffix="USDG"
          value={draft.maxNotionalUsdg}
          onChange={set('maxNotionalUsdg')}
        />
        <PField
          label="max fills / epoch"
          value={draft.maxFillsPerEpoch}
          onChange={set('maxFillsPerEpoch')}
        />
        <PField
          label="epoch duration"
          suffix="sec"
          value={draft.epochDuration}
          onChange={set('epochDuration')}
        />
        <PField
          label="min rebalance interval"
          suffix="sec"
          value={draft.minRebalanceInterval}
          onChange={set('minRebalanceInterval')}
        />
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.09em] text-faint uppercase">enforce weights</span>
          <input
            type="checkbox"
            checked={draft.enforceWeights}
            onChange={(e) => setDraft((d) => ({ ...d, enforceWeights: e.target.checked }))}
            className="mt-1 h-4 w-4 accent-signal-deep"
          />
        </label>
      </div>

      {err && <p className="mt-2 text-[12px] leading-relaxed text-refuse">{err}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={disabled}
          className="rounded-full border border-signal-deep bg-signal/6 px-3 py-1 font-mono text-[11px] text-signal hover:bg-signal/12 disabled:opacity-40"
        >
          update policy
        </button>
        <button
          onClick={() => {
            setDraft(draftFromPolicy(policy));
            setErr(null);
            setOpen(false);
          }}
          className="rounded-full border border-line bg-raised px-3 py-1 font-mono text-[11px] text-faint hover:text-ink"
        >
          cancel
        </button>
        <span className="font-mono text-[10.5px] text-faint">
          every field not changed above is sent back unchanged
        </span>
      </div>
    </div>
  );
}

function PField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  suffix?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.09em] text-faint uppercase">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-md border border-line bg-raised px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-signal-deep"
        />
        {suffix && <span className="font-mono text-[10.5px] text-faint">{suffix}</span>}
      </span>
    </label>
  );
}

/**
 * A single address field with validation, used for both `setAgent` and
 * `setExecutor` — same shape, different meaning, different warning text
 * supplied by the caller above the form.
 */
function AddressForm({
  current,
  disabled,
  submitLabel,
  defaultAddress,
  defaultLabel,
  onSubmit,
}: {
  current: Address;
  disabled: boolean;
  submitLabel: string;
  defaultAddress?: Address;
  defaultLabel?: string;
  onSubmit: (next: Address) => void;
}) {
  const [value, setValue] = useState('');
  const pointsAtDefault =
    defaultAddress && current.toLowerCase() === defaultAddress.toLowerCase();

  const submit = () => {
    if (!isAddress(value)) return;
    onSubmit(getAddress(value));
    setValue('');
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] text-faint">{current}</span>
      {defaultAddress && (
        <button
          onClick={() => setValue(defaultAddress)}
          disabled={disabled || pointsAtDefault}
          className="rounded-full border border-line bg-raised px-2 py-0.5 font-mono text-[10.5px] text-faint hover:text-ink disabled:opacity-40"
        >
          {pointsAtDefault ? 'already here' : (defaultLabel ?? 'use default')}
        </button>
      )}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0x…"
        className="w-[22ch] rounded-md border border-line bg-raised px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-signal-deep"
      />
      <button
        onClick={submit}
        disabled={disabled || !isAddress(value)}
        className="rounded-full border border-signal-deep bg-signal/6 px-3 py-0.5 font-mono text-[11px] text-signal hover:bg-signal/12 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  );
}
