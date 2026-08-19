'use client';

import { useCallback, useEffect, useState } from 'react';
import { erc20Abi, formatUnits, getAddress, isAddress, parseUnits, type Address } from 'viem';
import { POLICY_GUARD_ABI, TRIGGER_METRICS, comparatorIndex, metricIndex,
  type TriggerComparator, type TriggerMetric } from '@/src/abi';
import { USDG } from '@/src/chain';
import type { UniverseEntry } from '@/src/pipeline';
import { describeOnchainTrigger, scaleThreshold, type OnchainTrigger } from '@/src/triggers';
import { awaitReceipt } from './awaitReceipt';
import { publishMandateCount } from './mandate-presence';
import {
  FILLED_EVENT,
  MANDATES_CHANGED_EVENT,
  PICK_ASSET_EVENT,
  type PickAssetDetail,
} from './follow';
import { Legend, Pill, tokenAmount } from './ui';
import { Fact, Facts, Section } from './console/trade/Section';
import { Field, FormCard, FormRow, Ghost, Primary, SelectField, Toggle } from './console/trade/Form';
import { AssetMark } from './console/AssetMark';
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
  allowed: { address: Address; units: bigint; decimals: number }[];
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
  /** Which mandate the left column describes. Null means "the newest". */
  const [showId, setShowId] = useState<bigint | null>(null);

  useEffect(() => {
    fetch('/api/universe')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setUniverse(d))
      .catch(() => {});
  }, []);

  const symbolOf = new Map(universe.map((u) => [u.address.toLowerCase(), u.symbol]));
  /** The ticker if the universe has arrived, a short address until it does. */
  const label = (asset: Address) =>
    symbolOf.get(asset.toLowerCase()) ?? `${asset.slice(0, 6)}…${asset.slice(-4)}`;

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
          // No symbol here on purpose. It is a label, not chain state, and
          // baking it in tied it to the moment the walk ran: `/api/universe`
          // usually answers *after* this serial walk starts, so every asset
          // rendered as a truncated address until a second full walk replaced
          // it, twenty seconds later, on an RPC that throttles. Resolved at
          // render instead, the labels correct themselves the moment the
          // universe lands and the second walk is not needed at all.
          allowed.push({
            address: asset,
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
      publishMandateCount(found.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMandates([]);
      // Not zero, and not "still loading" either. A throttled read is not an
      // empty account, and reporting it as one would move the create form under
      // a user who owns three mandates.
      publishMandateCount('unreadable');
    }
  }, [publicClient, option, address]);

  useEffect(() => {
    void load();
  }, [load]);

  // Disconnecting is not the same as owning nothing, and the layout that reads
  // this has to be told the difference the moment the wallet goes away.
  useEffect(() => {
    if (!address) publishMandateCount(null);
  }, [address]);

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

  // Not `null`. The left column is what a visitor reads before they connect
  // anything, and a section that simply vanishes leaves the page opening on a
  // capacity table with no account of what the rules on this page even are.
  if (!address) {
    return (
      <Section title="Mandate">
        <p className="max-w-[68ch] text-meta leading-relaxed text-dim">
          The rule set the chain enforces inside the trade itself: what it may spend, how far off
          fair value it may pay, which assets it may hold. Connect a wallet to read yours.
        </p>
      </Section>
    );
  }

  if (!option) {
    return (
      <Section title="Mandate">
        <p className="max-w-[68ch] text-meta leading-relaxed text-caution">
          This wallet is on a chain with no deployment. Switch to X&nbsp;Layer using the control in
          the header.
        </p>
      </Section>
    );
  }

  if (mandates === null) {
    return <p className="text-meta text-dim">Reading your mandates from the chain…</p>;
  }

  // Nothing, rather than an empty-state block: with no mandate the create form
  // has already taken this column's first position, and a panel saying "you have
  // none" directly under the form that makes one is the same sentence twice.
  if (mandates.length === 0) {
    return error ? <WriteError message={error} /> : null;
  }

  // The newest by default. A user with several is nearly always working on the
  // one they just made, and defaulting to the oldest would open the page on a
  // mandate they had finished with.
  const m = mandates.find((x) => x.id === showId) ?? mandates[mandates.length - 1]!;

  /**
   * The most this mandate can still spend before the epoch resets.
   *
   * Derived, not stored: the chain knows `maxNotionalPerTrade` and how many
   * fills this epoch has used, and the product of the two is what is left. It is
   * the honest headline for this page because it is the number that actually
   * binds — the cap per trade on its own says nothing about how many trades are
   * left, and the fill count on its own says nothing about how large they are.
   */
  const fillsLeft = Math.max(0, m.maxFillsPerEpoch - m.fillsThisEpoch);
  const spendable = m.maxNotionalPerTrade * BigInt(fillsLeft);
  const used = m.maxFillsPerEpoch > 0 ? m.fillsThisEpoch / m.maxFillsPerEpoch : 0;

  return (
    <>
      {error && <WriteError message={error} />}

      {mandates.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold tracking-[0.09em] text-faint uppercase">
            mandate
          </span>
          {mandates.map((one) => (
            <button
              key={one.id.toString()}
              onClick={() => setShowId(one.id)}
              className={`rounded-full border px-3 py-0.5 font-mono text-[12px] transition-colors ${
                one.id === m.id
                  ? 'border-signal-deep bg-signal/6 text-signal'
                  : 'border-line bg-raised text-faint hover:text-ink'
              }`}
            >
              #{one.id.toString()}
            </button>
          ))}
        </div>
      )}

      {/* Where the reference puts the price and its chart. The equivalent claim
          here is not a price — it is how much room the rules leave. */}
      <div className="rounded-2xl bg-card px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.09em] text-faint uppercase">
              Spendable this epoch · mandate #{m.id.toString()}
            </h2>
            <p className="mt-2 font-mono text-display tabular-nums text-ink">
              {formatUnits(spendable, USDG.decimals)}
              <span className="ml-2 text-title text-faint">USDG</span>
            </p>
            <p className="mt-1.5 text-meta text-dim">
              {fillsLeft} of {m.maxFillsPerEpoch} fills left, at{' '}
              <span className="font-mono text-ink">
                {formatUnits(m.maxNotionalPerTrade, USDG.decimals)}
              </span>{' '}
              USDG each. Resets every {Math.round(m.policy.epochDuration / 3600)}h.
            </p>
          </div>
          {m.breaker ? (
            <Pill tone="no">breaker tripped, exits included</Pill>
          ) : (
            <Pill tone="ok">live</Pill>
          )}
        </div>

        <span className="mt-5 block h-1.5 w-full overflow-hidden rounded-full bg-line">
          <span
            className={`block h-full ${used >= 1 ? 'bg-caution' : 'bg-signal'}`}
            style={{ width: `${Math.min(1, used) * 100}%` }}
          />
        </span>
      </div>

      <Section title="Mandate">
        <Facts>
          <Fact label="Max per trade" hint="USDG">
            {formatUnits(m.maxNotionalPerTrade, USDG.decimals)}
          </Fact>
          <Fact label="Agent">
            <span className="break-all">{m.agent}</span>
          </Fact>
          <Fact label="Fills per epoch">
            {m.fillsThisEpoch} / {m.maxFillsPerEpoch}
          </Fact>
          <Fact label="Executor">
            <span className="break-all">{m.executor}</span>
          </Fact>
          <Fact label="Max slippage" hint="of the size quoted">
            {m.maxSlippageBps} bp
          </Fact>
          <Fact label="Max off fair value" hint="or the guard reverts">
            {m.policy.maxDeviationBps} bp
          </Fact>
          <Fact label="Max gap risk" hint="0–100, overnight">
            {m.maxGapRisk}
          </Fact>
          <Fact label="Version">v{m.version}</Fact>
        </Facts>
      </Section>

      <Section
        title="Positions"
        aside={
          <span className="text-[12.5px] text-faint">recorded from settled fills</span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse">
            <thead>
              <tr className="border-b border-line text-[11px] tracking-[0.09em] text-faint uppercase">
                <th className="pb-2 pr-4 text-left font-semibold">Asset</th>
                <th className="pb-2 pr-4 text-right font-semibold">Units</th>
                <th className="pb-2 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {m.allowed.map((a) => (
                <tr key={a.address} className="border-b border-line/60 last:border-b-0">
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2.5">
                      <AssetMark symbol={label(a.address)} size={22} />
                      <span className="font-mono text-meta text-ink">{label(a.address)}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums text-dim">
                    {a.units === 0n ? (
                      <span className="text-faint">no recorded position</span>
                    ) : (
                      // The full value in the title, because it is the exact
                      // number of tokens and somebody may want to copy it.
                      <span title={formatUnits(a.units, a.decimals)}>
                        {tokenAmount(formatUnits(a.units, a.decimals))}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    {a.units > 0n && (
                      // The card that can sell is in the right rail, so the row
                      // names the asset and the rail switches to it.
                      <button
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent<PickAssetDetail>(PICK_ASSET_EVENT, {
                              detail: { asset: a.address, direction: 'sell' },
                            }),
                          )
                        }
                        className="rounded-full bg-inset px-3.5 py-1.5 text-[13px] text-ink hover:bg-line"
                      >
                        Sell
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[68ch] text-[12.5px] leading-relaxed text-faint">
          Can differ from your wallet balance when an asset was traded under a different mandate.
        </p>
      </Section>

      <Section
        title="Triggers"
        aside={
          <span className="text-[12.5px] text-faint">
            {m.triggers.length} installed
            {m.firing.length > 0 && (
              <span className="text-caution"> · {m.firing.length} firing</span>
            )}
          </span>
        }
      >
        {m.triggers.length === 0 ? (
          <p className="mb-4 max-w-[68ch] text-meta leading-relaxed text-caution">
            None. Nothing will tell this mandate to leave a position. It is bounded on size and
            price, and has no exit rule at all.
          </p>
        ) : (
          <ul className="mb-4 grid gap-1">
            {m.triggers.map((t, i) => (
              <li
                key={i}
                className={`border-b border-line/60 py-2 font-mono text-meta last:border-b-0 ${
                  m.firing.includes(i) ? 'text-caution' : 'text-dim'
                }`}
              >
                {m.firing.includes(i) ? '⚠ ' : ''}
                {describeOnchainTrigger(t, symbolOf)}
              </li>
            ))}
          </ul>
        )}

        <TriggerForm
          assets={m.allowed.map((a) => ({ address: a.address, symbol: label(a.address) }))}
          disabled={busy !== null}
          onAdd={(added) =>
            write(m.id, 'installing a trigger', (guard) =>
              walletClient!.writeContract({
                address: guard,
                abi: POLICY_GUARD_ABI,
                functionName: 'setTriggers',
                // Replaces wholesale on chain, so the existing set is rewritten
                // alongside the new one. Sending only the new one would silently
                // delete every rule already installed.
                args: [m.id, [...m.triggers, added]],
                chain: option.chain,
                account: address!,
              }),
            )
          }
        />
      </Section>

      <Section title="Allowlist">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {m.allowed.map((a) => (
            <span
              key={a.address}
              className="flex items-center gap-2 rounded-full bg-inset py-1 pr-2.5 pl-1.5 text-[13px] text-ink"
            >
              <AssetMark symbol={label(a.address)} size={20} />
              {label(a.address)}
              <button
                onClick={() =>
                  write(m.id, `disallowing ${label(a.address)}`, (guard) =>
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
                className="text-faint hover:text-refuse disabled:opacity-40"
                title={`disallow ${label(a.address)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <p className="mb-3 max-w-[68ch] text-[12.5px] leading-relaxed text-faint">
          Disallowing stops new fills. It does not sell what the mandate holds, and an exit is a
          fill the guard checks against this list. Exit first, then disallow.
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
      </Section>

      <Section title="Controls">
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
                // The whole struct, always — every field not touched in the form
                // is carried over from what was just read, because
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
        <p className="mb-2 max-w-[68ch] text-[12.5px] leading-relaxed text-faint">
          The agent proposes trades. It can never exceed the policy above, or move funds without a
          Permit2 signature the owner produces.
        </p>
        <AddressForm
          current={m.agent}
          disabled={busy !== null}
          submitLabel="Rotate agent"
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
        <p className="mb-2 max-w-[68ch] text-[12.5px] leading-relaxed text-faint">
          Where fills are pulled from with Permit2. A mandate pointing elsewhere can never be
          filled from this app.
        </p>
        <AddressForm
          current={m.executor}
          disabled={busy !== null}
          submitLabel="Point at executor"
          defaultAddress={option.deployment.contracts.Executor as Address | undefined}
          defaultLabel="Use this deployment's Executor"
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

        <div className="mt-6 flex flex-wrap items-center gap-2">
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
            className={`rounded-full px-3.5 py-1.5 text-[13px] disabled:opacity-40 ${
              m.breaker
                ? 'bg-signal/12 text-signal hover:bg-signal/20'
                : 'bg-caution/12 text-caution hover:bg-caution/20'
            }`}
          >
            {m.breaker ? 'Release breaker' : 'Trip breaker'}
          </button>

          <button
            onClick={() =>
              write(m.id, 'closing', (guard) =>
                walletClient!.writeContract({
                  address: guard,
                  abi: POLICY_GUARD_ABI,
                  functionName: 'closeMandate',
                  args: [m.id],
                  chain: option.chain,
                  account: address!,
                }),
              )
            }
            disabled={busy !== null}
            className="rounded-full bg-refuse/10 px-3.5 py-1.5 text-[13px] text-refuse hover:bg-refuse/16 disabled:opacity-40"
          >
            Close mandate
          </button>

          {busy?.id === m.id && (
            <span className="text-[13px] text-dim">{busy.what}…</span>
          )}
        </div>

        <p className="mt-3 max-w-[68ch] text-[12.5px] leading-relaxed text-faint">
          The breaker stops entries <em>and</em> exits through this system. Your assets stay in
          your wallet and remain sellable anywhere. Closing is permanent.
        </p>
      </Section>
    </>
  );
}

function WriteError({ message }: { message: string }) {
  return (
    <div className="mb-5 rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
      <p className="font-mono text-[12.5px] leading-relaxed break-words text-refuse">{message}</p>
    </div>
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
    <FormCard>
      <FormRow>
        <SelectField
          label="Metric"
          value={metric}
          onChange={(next) => setMetric(next as TriggerMetric)}
          options={TRIGGER_METRICS.map((m) => ({ value: m, label: m }))}
        />
        <SelectField
          label="Is"
          value={comparator}
          onChange={(next) => setComparator(next as TriggerComparator)}
          options={[
            { value: 'gt', label: 'above' },
            { value: 'lt', label: 'below' },
          ]}
        />
        <Field
          label="Threshold"
          suffix={metric === 'capacityUsdg' ? 'USDG' : undefined}
          value={threshold}
          onChange={setThreshold}
        />
      </FormRow>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-dim">Applies to</span>
        <Toggle on={scope.length === 0} onClick={() => setScope([])}>
          <span className="pl-1.5">Whole basket</span>
        </Toggle>
        {assets.map((a) => {
          const on = scope.includes(a.address);
          return (
            <Toggle
              key={a.address}
              on={on}
              onClick={() =>
                setScope((prev) =>
                  on ? prev.filter((x) => x !== a.address) : [...prev, a.address],
                )
              }
            >
              <AssetMark symbol={a.symbol} size={20} />
              {a.symbol}
            </Toggle>
          );
        })}
      </div>

      <div className="mt-4">
        <Primary
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
        >
          Add trigger
        </Primary>
      </div>
    </FormCard>
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
    <FormCard>
      <FormRow>
        <SelectField
          label="Asset"
          value={picked}
          placeholder="choose one"
          onChange={(next) => setPicked(next as Address)}
          options={options.map((u) => ({
            value: u.address,
            label: u.symbol,
            icon: <AssetMark symbol={u.symbol} size={22} />,
          }))}
        />
        <div className="flex items-end">
          <Primary onClick={() => picked && onAllow(picked)} disabled={disabled || !picked}>
            Allow
          </Primary>
        </div>
      </FormRow>
    </FormCard>
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
  if (raw.trim() === '') throw new Error(`${label} is empty, give it a number`);
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
      <Ghost onClick={() => setOpen(true)}>Edit policy</Ghost>
    );
  }

  return (
    <FormCard>
      <FormRow>
        <Field label="Max weight" suffix="bps" value={draft.maxWeightBps} onChange={set('maxWeightBps')} />
        <Field
          label="Min cash buffer"
          suffix="bps"
          value={draft.minCashBufferBps}
          onChange={set('minCashBufferBps')}
        />
        <Field
          label="Max slippage"
          suffix="bps"
          value={draft.maxSlippageBps}
          onChange={set('maxSlippageBps')}
        />
        <Field
          label="Max off fair value"
          suffix="bps"
          value={draft.maxDeviationBps}
          onChange={set('maxDeviationBps')}
        />
      </FormRow>

      <div className="mt-2.5">
        <FormRow>
          <Field label="Max gap risk" value={draft.maxGapRisk} onChange={set('maxGapRisk')} />
          <Field
            label="Max per trade"
            suffix="USDG"
            value={draft.maxNotionalUsdg}
            onChange={set('maxNotionalUsdg')}
          />
          <Field
            label="Max fills / epoch"
            value={draft.maxFillsPerEpoch}
            onChange={set('maxFillsPerEpoch')}
          />
          <Field
            label="Epoch duration"
            suffix="sec"
            value={draft.epochDuration}
            onChange={set('epochDuration')}
          />
        </FormRow>
      </div>

      <div className="mt-2.5">
        <FormRow>
          <Field
            label="Min rebalance interval"
            suffix="sec"
            value={draft.minRebalanceInterval}
            onChange={set('minRebalanceInterval')}
          />
          <label className="flex min-w-[8rem] flex-1 flex-col rounded-xl bg-well px-3.5 py-2.5">
            <span className="text-[12px] leading-tight text-dim">Enforce weights</span>
            <span className="mt-1.5 flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.enforceWeights}
                onChange={(e) => setDraft((d) => ({ ...d, enforceWeights: e.target.checked }))}
                className="h-4 w-4 accent-ink"
              />
              <span className="text-[15px] text-ink">{draft.enforceWeights ? 'on' : 'off'}</span>
            </span>
          </label>
        </FormRow>
      </div>

      {err && <p className="mt-3 text-[12.5px] leading-relaxed text-refuse">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Primary onClick={submit} disabled={disabled}>
          Update policy
        </Primary>
        <Ghost
          onClick={() => {
            setDraft(draftFromPolicy(policy));
            setErr(null);
            setOpen(false);
          }}
        >
          Cancel
        </Ghost>
        <span className="text-[12.5px] text-dim">
          Every field not changed above is sent back unchanged.
        </span>
      </div>
    </FormCard>
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
    <FormCard>
      <p className="mb-2.5 font-mono text-[12.5px] break-all text-dim">{current}</p>
      <FormRow>
        <Field
          label="New address"
          value={value}
          onChange={setValue}
          placeholder="0x…"
          width="flex-[3]"
        />
        <div className="flex items-end">
          <Primary onClick={submit} disabled={disabled || !isAddress(value)}>
            {submitLabel}
          </Primary>
        </div>
      </FormRow>
      {defaultAddress && (
        <div className="mt-2.5">
          <Ghost
            onClick={() => setValue(defaultAddress)}
            disabled={disabled || pointsAtDefault}
          >
            {pointsAtDefault ? 'Already here' : (defaultLabel ?? 'Use default')}
          </Ghost>
        </div>
      )}
    </FormCard>
  );
}
