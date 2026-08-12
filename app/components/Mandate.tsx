'use client';

import { useEffect, useState } from 'react';
import { parseUnits, type Address } from 'viem';
import { POLICY_GUARD_ABI } from '@/src/abi';
import { USDG } from '@/src/chain';
import type { UniverseEntry } from '@/src/pipeline';
import { Card, Legend, Note, Num } from './ui';
import { useWallet } from './useWallet';

/**
 * Create a mandate from the browser — the step that turns this page from
 * something that computes into something that executes.
 *
 * The user is `owner` because they are `msg.sender`; nothing here can be done
 * on their behalf. `PolicyGuard` then bounds every future fill against the
 * policy written below, and reverts in the trade's own transaction if one
 * breaches it. That is the whole non-custodial claim, and it is enforced by the
 * contract rather than by this form.
 */

/** Mirrors `PolicyGuard.MAX_ASSETS`. Read back from the chain before the write. */
const MAX_ASSETS_FALLBACK = 24;

interface Draft {
  maxNotionalUsdg: string;
  maxFillsPerEpoch: string;
  maxSlippageBps: string;
  maxDeviationBps: string;
  maxGapRisk: string;
}

/**
 * Defaults lifted from `src/mandate-demo.ts` so the UI and the CLI create the
 * same shape of mandate.
 *
 * `maxNotionalPerTrade` defaults to **1 USDG on mainnet** on purpose: it is the
 * blast radius if a key leaks or our own sizing is wrong, and against a wallet
 * holding a few dollars that is a loss nobody minds. It should be raised
 * deliberately, never by default.
 */
const draftFor = (chainId: number): Draft => ({
  maxNotionalUsdg: chainId === 196 ? '1' : '5000',
  maxFillsPerEpoch: chainId === 196 ? '3' : '8',
  maxSlippageBps: '50',
  maxDeviationBps: '100',
  maxGapRisk: '60',
});

type Phase =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'mining'; hash: `0x${string}` }
  | { kind: 'confirming'; hash: `0x${string}` }
  | { kind: 'done'; hash: `0x${string}`; mandateId: bigint; allowed: readonly Address[] }
  | { kind: 'failed'; message: string };

export function Mandate() {
  const { address, option, walletClient, publicClient } = useWallet();

  const [universe, setUniverse] = useState<UniverseEntry[] | null>(null);
  const [picked, setPicked] = useState<Address[]>([]);
  const [draft, setDraft] = useState<Draft>(() => draftFor(196));
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (option) setDraft(draftFor(option.chain.id));
  }, [option]);

  useEffect(() => {
    let live = true;
    fetch('/api/universe')
      .then((r) => r.json())
      .then((data) => {
        if (live && Array.isArray(data)) setUniverse(data);
      })
      .catch(() => {
        /* The picker degrades to empty; the panel says so below. */
      });
    return () => {
      live = false;
    };
  }, []);

  const toggle = (asset: Address) =>
    setPicked((prev) =>
      prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset],
    );

  async function create() {
    if (!walletClient || !publicClient || !option || !address) return;

    const guard = option.deployment.contracts.PolicyGuard as Address | undefined;
    const executor = option.deployment.contracts.Executor as Address | undefined;
    if (!guard || !executor) {
      setPhase({ kind: 'failed', message: 'no PolicyGuard/Executor in this deployment' });
      return;
    }

    const policy = {
      maxWeightBps: 4000,
      minCashBufferBps: 500,
      maxSlippageBps: Number(draft.maxSlippageBps),
      maxDeviationBps: Number(draft.maxDeviationBps),
      maxGapRisk: Number(draft.maxGapRisk),
      maxNotionalPerTrade: parseUnits(draft.maxNotionalUsdg || '0', USDG.decimals),
      maxFillsPerEpoch: Number(draft.maxFillsPerEpoch),
      epochDuration: 86_400,
      minRebalanceInterval: 0,
      // Off by default: the portfolio-level check costs a balance read per
      // allowed asset on every fill, and the per-trade caps already bound the
      // damage. See the field's own comment in PolicyGuard.
      enforceWeights: false,
    } as const;

    setPhase({ kind: 'signing' });
    try {
      const hash = await walletClient.writeContract({
        address: guard,
        abi: POLICY_GUARD_ABI,
        functionName: 'createMandate',
        // agent = the user. They propose their own trades, so no key of ours can
        // act on this mandate at all. executor = the deployed `Executor`, which
        // is what `Executor.execute` checks against before it will pull funds.
        args: [address, executor, policy, picked],
        chain: option.chain,
        account: address,
      });

      setPhase({ kind: 'mining', hash });
      await publicClient.waitForTransactionReceipt({ hash });

      const mandateId = await confirmMandate(guard);
      const allowed = await publicClient.readContract({
        address: guard,
        abi: POLICY_GUARD_ABI,
        functionName: 'allowedAssets',
        args: [mandateId],
      });

      setPhase({ kind: 'done', hash, mandateId, allowed });
    } catch (e) {
      const code = (e as { code?: number })?.code;
      if (code === 4001) {
        setPhase({ kind: 'idle' });
        return;
      }
      // A guard revert decodes into a sentence because every error is in the
      // ABI. Showing it is the point — a refusal with its numbers is the
      // product, not an error to swallow.
      setPhase({
        kind: 'failed',
        message: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message,
      });
    }

    /**
     * Find the mandate this wallet just created, and wait until it is readable.
     *
     * X Layer's public RPC load-balances, so a confirmed write is not
     * immediately readable — a read straight after can hit an unsynced node and
     * return zeroes rather than an error (D18). Polling `nextMandateId`
     * downwards until we find one owned by this address is both the id lookup
     * and the visibility check in one.
     */
    async function confirmMandate(guardAddress: Address): Promise<bigint> {
      for (let attempt = 0; attempt < 40; attempt++) {
        setPhase((p) => (p.kind === 'mining' ? { kind: 'confirming', hash: p.hash } : p));
        try {
          const next = await publicClient!.readContract({
            address: guardAddress,
            abi: POLICY_GUARD_ABI,
            functionName: 'nextMandateId',
          });
          for (let id = next - 1n; id > 0n && id > next - 6n; id--) {
            const m = await publicClient!.readContract({
              address: guardAddress,
              abi: POLICY_GUARD_ABI,
              functionName: 'getMandate',
              args: [id],
            });
            if (m.owner.toLowerCase() === address!.toLowerCase() && m.active) return id;
          }
        } catch {
          /* an unsynced node; try again */
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      throw new Error('the mandate was mined but never became readable — check the explorer');
    }
  }

  const busy = phase.kind === 'signing' || phase.kind === 'mining' || phase.kind === 'confirming';
  const tooMany = picked.length > MAX_ASSETS_FALLBACK;
  const explorer = option?.deployment.explorer;

  return (
    <Card step={7} title="Create a mandate">
      <Note>
        The mandate is yours: you are <code className="font-mono text-dim">owner</code> because you
        send this transaction, your funds never leave your wallet, and the policy below is what
        PolicyGuard enforces on every future fill — reverting in the trade&apos;s own transaction
        if one breaches it. You are also the <code className="font-mono text-dim">agent</code>, so
        no key of ours can propose anything against it.
      </Note>

      {!address ? (
        <p className="text-[13px] text-dim">Connect a wallet to create one.</p>
      ) : !option ? (
        <p className="text-[13px] text-caution">
          This wallet is on a chain with no deployment. Switch to X&nbsp;Layer using the control in
          the header.
        </p>
      ) : (
        <>
          <Legend>blast radius — the most this mandate can ever spend</Legend>
          <div className="mb-1 flex flex-wrap gap-4">
            <Field
              label="max per trade"
              suffix="USDG"
              value={draft.maxNotionalUsdg}
              onChange={(v) => setDraft({ ...draft, maxNotionalUsdg: v })}
            />
            <Field
              label="fills per 24h"
              value={draft.maxFillsPerEpoch}
              onChange={(v) => setDraft({ ...draft, maxFillsPerEpoch: v })}
            />
            <Field
              label="max slippage"
              suffix="bps"
              value={draft.maxSlippageBps}
              onChange={(v) => setDraft({ ...draft, maxSlippageBps: v })}
            />
            <Field
              label="max off fair value"
              suffix="bps"
              value={draft.maxDeviationBps}
              onChange={(v) => setDraft({ ...draft, maxDeviationBps: v })}
            />
            <Field
              label="max gap risk"
              value={draft.maxGapRisk}
              onChange={(v) => setDraft({ ...draft, maxGapRisk: v })}
            />
          </div>
          <p className="mb-2 text-[12px] leading-relaxed text-faint">
            On mainnet this defaults to <Num>1</Num> USDG per trade — the loss you can absorb
            without caring if a key leaks or our sizing is wrong. Raise it on purpose.
          </p>

          <Legend>
            allowed assets — {picked.length} picked
            {tooMany && <span className="text-refuse"> · over the {MAX_ASSETS_FALLBACK} limit</span>}
          </Legend>
          {universe === null ? (
            <p className="text-[13px] text-dim">Reading the universe from the chain…</p>
          ) : universe.length === 0 ? (
            <p className="text-[13px] text-caution">
              The universe could not be read. Without it there is nothing to allow — reload rather
              than creating a mandate that can hold nothing.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {universe.map((entry) => {
                const on = picked.includes(entry.address);
                return (
                  <button
                    key={entry.address}
                    onClick={() => toggle(entry.address)}
                    title={entry.name ?? entry.address}
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                      on
                        ? 'border-signal-deep bg-signal/6 text-signal'
                        : 'border-line bg-raised text-faint hover:text-ink'
                    }`}
                  >
                    {entry.symbol}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={create}
              disabled={busy || picked.length === 0 || tooMany}
              className="rounded-full border border-signal-deep bg-signal/6 px-4 py-1 font-mono text-[12px] text-signal hover:bg-signal/12 disabled:opacity-40"
            >
              {phase.kind === 'signing'
                ? 'confirm in your wallet…'
                : phase.kind === 'mining'
                  ? 'mining…'
                  : phase.kind === 'confirming'
                    ? 'waiting for the chain to serve it…'
                    : 'create mandate'}
            </button>
            {picked.length === 0 && (
              <span className="text-[12px] text-faint">Pick at least one asset.</span>
            )}
          </div>

          {phase.kind === 'confirming' && (
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              Mined. The public RPC load-balances, so a confirmed write is not immediately
              readable — polling until it is (D18) rather than showing you a zero.
            </p>
          )}

          {phase.kind === 'done' && (
            <div className="mt-4 rounded-lg border border-signal-deep bg-signal/6 px-4 py-3">
              <p className="text-[13px] text-ink">
                Mandate <Num>#{phase.mandateId.toString()}</Num> created, allowing{' '}
                <Num>{phase.allowed.length}</Num> assets.
              </p>
              {explorer && (
                <a
                  href={`${explorer}/tx/${phase.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block font-mono text-[11px] break-all text-faint hover:text-signal"
                >
                  {phase.hash}
                </a>
              )}
            </div>
          )}

          {phase.kind === 'failed' && (
            <div className="mt-4 rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
              <p className="font-mono text-[12px] leading-relaxed break-words text-refuse">
                {phase.message}
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Field({
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
      <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-md border border-line bg-raised px-2 py-1 font-mono text-[12px] text-ink outline-none focus:border-signal-deep"
        />
        {suffix && <span className="font-mono text-[11px] text-faint">{suffix}</span>}
      </span>
    </label>
  );
}
