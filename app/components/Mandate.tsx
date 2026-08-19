"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseUnits, type Address } from "viem";
import { POLICY_GUARD_ABI } from "@/src/abi";
import { USDG } from "@/src/chain";
import type { UniverseEntry } from "@/src/pipeline";
import { encodeTriggers, describeOnchainTrigger } from "@/src/triggers";
import { awaitReceipt } from "./awaitReceipt";
import {
  FOLLOW_EVENT,
  publishFollow,
  INSTALL_TRIGGERS_EVENT,
  MANDATES_CHANGED_EVENT,
  type FollowRequest,
  type TriggerInstallRequest,
} from "./follow";
import { takeHandoff } from "./handoff";
import { AssetMark } from "./console/AssetMark";
import { Legend, Num } from "./ui";
import { useWallet } from "./useWallet";

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
  maxNotionalUsdg: chainId === 196 ? "1" : "5000",
  maxFillsPerEpoch: chainId === 196 ? "3" : "8",
  maxSlippageBps: "50",
  maxDeviationBps: "100",
  maxGapRisk: "60",
});

/**
 * How the exit rules ended up, reported separately from the mandate itself.
 *
 * They are a **second transaction** — `createMandate` takes a policy and an
 * allowlist, not triggers — so the two can succeed independently, and a mandate
 * that exists with no rules installed is the outcome a user must never mistake
 * for a mandate that has them. `'failed'` is therefore rendered as loudly as a
 * revert, even though the mandate above it worked.
 */
type Rules =
  | { kind: "none" }
  | { kind: "installing" }
  | { kind: "installed"; hash: `0x${string}`; count: number }
  | { kind: "failed"; message: string };

type Phase =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "mining"; hash: `0x${string}` }
  | { kind: "confirming"; hash: `0x${string}` }
  | {
      kind: "done";
      hash: `0x${string}`;
      mandateId: bigint;
      allowed: readonly Address[];
      rules: Rules;
    }
  | { kind: "failed"; message: string };

export function Mandate() {
  const { address, option, walletClient, publicClient } = useWallet();

  const [universe, setUniverse] = useState<UniverseEntry[] | null>(null);
  const [picked, setPicked] = useState<Address[]>([]);
  const [draft, setDraft] = useState<Draft>(() => draftFor(196));
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [follow, setFollow] = useState<FollowRequest | null>(null);
  const [compiled, setCompiled] = useState<TriggerInstallRequest | null>(null);
  const [installRules, setInstallRules] = useState(true);
  const panel = useRef<HTMLElement>(null);

  /**
   * The compiled exit rules, arriving from the triggers panel above (D76).
   *
   * Encoded here rather than there because the mandate's allowlist is not known
   * until the assets are picked, and `encodeTriggers` drops a rule whose assets
   * fall outside it rather than widening it to the whole basket. So this
   * recomputes as the picker changes, and what the list shows is what the
   * transaction will carry.
   */
  const encoded = useMemo(() => {
    if (!compiled || !universe) return null;
    const addressOf = new Map(universe.map((u) => [u.symbol, u.address]));
    return encodeTriggers(compiled.exitTriggers, addressOf, picked);
  }, [compiled, universe, picked]);

  const symbolOf = useMemo(
    () =>
      new Map((universe ?? []).map((u) => [u.address.toLowerCase(), u.symbol])),
    [universe],
  );

  useEffect(() => {
    if (option) setDraft(draftFor(option.chain.id));
  }, [option]);

  /**
   * Follow, arriving from a published thesis below (D50). It preselects the
   * assets and nothing else: the caps stay at the deliberately small mainnet
   * defaults, and the follower still sizes and signs it themselves.
   */
  useEffect(() => {
    const onFollow = (e: Event) => {
      setFollow((e as CustomEvent<FollowRequest>).detail);
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(FOLLOW_EVENT, onFollow);
    return () => window.removeEventListener(FOLLOW_EVENT, onFollow);
  }, []);

  useEffect(() => {
    const onTriggers = (e: Event) => {
      setCompiled((e as CustomEvent<TriggerInstallRequest>).detail);
      setInstallRules(true);
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(INSTALL_TRIGGERS_EVENT, onTriggers);
    return () => window.removeEventListener(INSTALL_TRIGGERS_EVENT, onTriggers);
  }, []);

  /**
   * The same two hand-offs, arriving from another page.
   *
   * Follow now lives on `/receipts` and the compiled exit rules on `/idea`,
   * so the DOM events above only fire when sender and receiver happen to share
   * a document. `handoff.ts` carries them across the navigation instead, and
   * this drains it once on mount. See that file for why the events are kept
   * rather than replaced.
   */
  useEffect(() => {
    const handoff = takeHandoff();
    if (!handoff) return;
    if (handoff.kind === "follow") {
      setFollow(handoff.payload);
      // And tell the rest of the page. This form is the only thing that drains
      // the hand-off, so without this the fill card and the basket rail never
      // learn a thesis is being followed — which was every arrival from
      // `/receipts`, the one path that produces a follow.
      publishFollow(handoff.payload);
    } else {
      setCompiled(handoff.payload);
      setInstallRules(true);
    }
  }, []);

  // Matched against the universe rather than trusted: the picker renders from
  // the universe, so an address that is not in it would be silently selected and
  // never visible. Runs again when the universe arrives, so a follow that lands
  // first is not lost.
  useEffect(() => {
    if (!follow || !universe) return;
    const wanted = new Set(follow.assets.map((a) => a.toLowerCase()));
    setPicked(
      universe
        .filter((u) => wanted.has(u.address.toLowerCase()))
        .map((u) => u.address),
    );
  }, [follow, universe]);

  useEffect(() => {
    let live = true;
    fetch("/api/universe")
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

    const guard = option.deployment.contracts.PolicyGuard as
      Address | undefined;
    const executor = option.deployment.contracts.Executor as
      Address | undefined;
    if (!guard || !executor) {
      setPhase({
        kind: "failed",
        message: "no PolicyGuard/Executor in this deployment",
      });
      return;
    }

    const policy = {
      maxWeightBps: 4000,
      minCashBufferBps: 500,
      maxSlippageBps: Number(draft.maxSlippageBps),
      maxDeviationBps: Number(draft.maxDeviationBps),
      maxGapRisk: Number(draft.maxGapRisk),
      maxNotionalPerTrade: parseUnits(
        draft.maxNotionalUsdg || "0",
        USDG.decimals,
      ),
      maxFillsPerEpoch: Number(draft.maxFillsPerEpoch),
      epochDuration: 86_400,
      minRebalanceInterval: 0,
      // Off by default: the portfolio-level check costs a balance read per
      // allowed asset on every fill, and the per-trade caps already bound the
      // damage. See the field's own comment in PolicyGuard.
      enforceWeights: false,
    } as const;

    setPhase({ kind: "signing" });
    try {
      const hash = await walletClient.writeContract({
        address: guard,
        abi: POLICY_GUARD_ABI,
        functionName: "createMandate",
        // agent = the user. They propose their own trades, so no key of ours can
        // act on this mandate at all. executor = the deployed `Executor`, which
        // is what `Executor.execute` checks against before it will pull funds.
        args: [address, executor, policy, picked],
        chain: option.chain,
        account: address,
      });

      setPhase({ kind: "mining", hash });
      await awaitReceipt(publicClient, hash);

      const mandateId = await confirmMandate(guard);
      const allowed = await publicClient.readContract({
        address: guard,
        abi: POLICY_GUARD_ABI,
        functionName: "allowedAssets",
        args: [mandateId],
      });

      const wanted = installRules ? (encoded?.triggers ?? []) : [];
      setPhase({
        kind: "done",
        hash,
        mandateId,
        allowed,
        rules: wanted.length ? { kind: "installing" } : { kind: "none" },
      });
      // The fill panel enumerates what this wallet can execute against, and it
      // read the chain before this mandate existed. Tell it to look again.
      window.dispatchEvent(new Event(MANDATES_CHANGED_EVENT));

      // The second transaction. Deliberately after the mandate is *readable*
      // rather than after it is mined: `setTriggers` is a dependent write, and
      // on this RPC a dependent transaction's gas estimation reverts against an
      // unsynced node exactly as a read returns zeroes (D18).
      if (wanted.length) {
        try {
          const rulesHash = await walletClient.writeContract({
            address: guard,
            abi: POLICY_GUARD_ABI,
            functionName: "setTriggers",
            args: [mandateId, wanted],
            chain: option.chain,
            account: address,
          });
          await awaitReceipt(publicClient, rulesHash);
          const installed = await confirmTriggers(
            guard,
            mandateId,
            wanted.length,
          );
          setPhase((p) =>
            p.kind === "done"
              ? {
                  ...p,
                  rules: {
                    kind: "installed",
                    hash: rulesHash,
                    count: installed,
                  },
                }
              : p,
          );
        } catch (e) {
          const code = (e as { code?: number })?.code;
          setPhase((p) =>
            p.kind === "done"
              ? {
                  ...p,
                  rules: {
                    kind: "failed",
                    message:
                      code === 4001
                        ? "you declined the second transaction — the mandate exists with no exit rules"
                        : ((e as { shortMessage?: string }).shortMessage ??
                          (e as Error).message),
                  },
                }
              : p,
          );
        }
      }
    } catch (e) {
      const code = (e as { code?: number })?.code;
      if (code === 4001) {
        setPhase({ kind: "idle" });
        return;
      }
      // A guard revert decodes into a sentence because every error is in the
      // ABI. Showing it is the point — a refusal with its numbers is the
      // product, not an error to swallow.
      setPhase({
        kind: "failed",
        message:
          (e as { shortMessage?: string }).shortMessage ?? (e as Error).message,
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
        setPhase((p) =>
          p.kind === "mining" ? { kind: "confirming", hash: p.hash } : p,
        );
        try {
          const next = await publicClient!.readContract({
            address: guardAddress,
            abi: POLICY_GUARD_ABI,
            functionName: "nextMandateId",
          });
          for (let id = next - 1n; id > 0n && id > next - 6n; id--) {
            const m = await publicClient!.readContract({
              address: guardAddress,
              abi: POLICY_GUARD_ABI,
              functionName: "getMandate",
              args: [id],
            });
            if (m.owner.toLowerCase() === address!.toLowerCase() && m.active)
              return id;
          }
        } catch {
          /* an unsynced node; try again */
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      throw new Error(
        "the mandate was mined but never became readable — check the explorer",
      );
    }

    /**
     * Read the rules back before claiming they are installed.
     *
     * Same reason as `confirmMandate`: a confirmed write is not immediately
     * readable here. "Probably installed" is not an answer for a risk control —
     * the CLI's `breaker` and `mandate:edit` both poll for the same reason.
     */
    async function confirmTriggers(
      guardAddress: Address,
      mandateId: bigint,
      expected: number,
    ): Promise<number> {
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const onChain = await publicClient!.readContract({
            address: guardAddress,
            abi: POLICY_GUARD_ABI,
            functionName: "getTriggers",
            args: [mandateId],
          });
          if (onChain.length === expected) return onChain.length;
        } catch {
          /* an unsynced node; try again */
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      throw new Error(
        "the rules were sent but never read back — check the explorer before trusting them",
      );
    }
  }

  const busy =
    phase.kind === "signing" ||
    phase.kind === "mining" ||
    phase.kind === "confirming";
  const tooMany = picked.length > MAX_ASSETS_FALLBACK;
  const explorer = option?.deployment.explorer;

  return (
    <section ref={panel}>
      {follow && (
        <div className="mb-4 rounded-lg border border-signal-deep bg-signal/6 px-4 py-2.5">
          <p className="text-[12.5px] leading-relaxed text-ink">
            Following thesis <Num>#{follow.thesisId}</Num> — its executed basket
            ({follow.symbols.join(", ")}) is what gets allowed here. Nothing
            else is copied: the caps are yours, and so is the size. Weights are
            not a policy field, and the planner sizes legs against the depth
            that exists for <em>your</em> notional.
          </p>
          {universe &&
            address &&
            option &&
            picked.length < follow.assets.length && (
              <p className="mt-1 text-[12px] text-caution">
                {follow.assets.length - picked.length} of its assets are not in
                the universe this page can read, and were not selected.
              </p>
            )}
        </div>
      )}

      {compiled && (
        <div className="mb-4 rounded-lg border border-line bg-raised px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[10.5px] font-semibold tracking-[0.09em] text-faint uppercase">
              Exit rules from your thesis
            </h3>
            <label className="flex items-center gap-2 text-[12px] text-dim">
              <input
                type="checkbox"
                checked={installRules}
                onChange={(e) => setInstallRules(e.target.checked)}
                className="accent-signal"
              />
              install them
            </label>
          </div>

          {/* What the second transaction will carry, recomputed against the
              picker above. A rule scoped to an asset this mandate will not hold
              is dropped rather than quietly widened — `encodeTriggers` refuses
              to turn "exit wMUx" into "exit everything". */}
          {encoded && encoded.triggers.length > 0 ? (
            <ul className="grid gap-1.5">
              {encoded.triggers.map((t, i) => (
                <li key={i} className="font-mono text-[12px] text-ink">
                  {describeOnchainTrigger(t, symbolOf)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-caution">
              None of the compiled rules survive against the assets picked above
              — pick the assets the thesis named, or create the mandate without
              rules and add them later.
            </p>
          )}

          {encoded && encoded.dropped.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-caution">
              {encoded.dropped.map((d, i) => (
                <li key={i}>
                  <span className="font-mono text-ink">{d.description}</span> —{" "}
                  {d.reason}
                </li>
              ))}
            </ul>
          )}

          {encoded && encoded.flagged.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-refuse">
              {encoded.flagged.map((f, i) => (
                <li key={i}>
                  <span className="font-mono">{f.description}</span> —{" "}
                  {f.reason}
                </li>
              ))}
            </ul>
          )}

          {compiled.manualWatch.length > 0 && (
            <p className="mt-2 text-[12px] text-dim">
              {compiled.manualWatch.length} condition
              {compiled.manualWatch.length === 1 ? "" : "s"} no metric captures
              stay yours to watch — they are not installed, and nothing pretends
              otherwise.
            </p>
          )}

          <p className="mt-2 text-[12px] text-faint">
            This is a <strong className="text-dim">second transaction</strong>{" "}
            after the mandate is created:{" "}
            <code className="font-mono">createMandate</code> takes a policy and
            an allowlist, not rules. You will be asked to sign twice.
          </p>
        </div>
      )}

      {!address ? (
        <p className="text-[13px] text-dim">Connect a wallet to create one.</p>
      ) : !option ? (
        <p className="text-[13px] text-caution">
          This wallet is on a chain with no deployment. Switch to X&nbsp;Layer
          using the control in the header.
        </p>
      ) : (
        <>
          <Legend>blast radius — the most this mandate can ever spend</Legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="max per trade"
              suffix="USDG"
              hint="Defaults to 1 on mainnet: the loss you can absorb without caring if a key leaks or our sizing is wrong. Raise it on purpose."
              value={draft.maxNotionalUsdg}
              onChange={(v) => setDraft({ ...draft, maxNotionalUsdg: v })}
            />
            <Field
              label="fills per 24h"
              hint="The rate limit. An exit spends one of these too."
              value={draft.maxFillsPerEpoch}
              onChange={(v) => setDraft({ ...draft, maxFillsPerEpoch: v })}
            />
            <Field
              label="max slippage"
              suffix="bps"
              hint="How far the fill may land from the size quoted."
              value={draft.maxSlippageBps}
              onChange={(v) => setDraft({ ...draft, maxSlippageBps: v })}
            />
            <Field
              label="max off fair value"
              suffix="bps"
              hint="How far the pool price may sit from the oracle's, or the guard reverts."
              value={draft.maxDeviationBps}
              onChange={(v) => setDraft({ ...draft, maxDeviationBps: v })}
            />
            <Field
              label="max gap risk"
              hint="0–100. How much overnight gap this mandate will carry."
              value={draft.maxGapRisk}
              onChange={(v) => setDraft({ ...draft, maxGapRisk: v })}
            />
          </div>

          <Legend>
            allowed assets — {picked.length} picked
            {tooMany && (
              <span className="text-refuse">
                {" "}
                · over the {MAX_ASSETS_FALLBACK} limit
              </span>
            )}
          </Legend>
          {universe === null ? (
            <p className="text-[13px] text-dim">
              Reading the universe from the chain…
            </p>
          ) : universe.length === 0 ? (
            <p className="text-[13px] text-caution">
              The universe could not be read. Without it there is nothing to
              allow — reload rather than creating a mandate that can hold
              nothing.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {universe.map((entry) => {
                const on = picked.includes(entry.address);
                return (
                  <button
                    key={entry.address}
                    onClick={() => toggle(entry.address)}
                    title={entry.name ?? entry.address}
                    className={`flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 font-mono text-[12.5px] transition-colors ${
                      on
                        ? "border-signal-deep bg-signal/8 text-signal"
                        : "border-line bg-raised text-dim hover:border-edge hover:text-ink"
                    }`}
                  >
                    <AssetMark symbol={entry.symbol} size={18} />
                    {entry.symbol}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={create}
            disabled={busy || picked.length === 0 || tooMany}
            className="mt-7 w-full rounded-xl border border-signal-deep bg-signal/8 px-4 py-3 font-mono text-[14px] text-signal hover:bg-signal/14 disabled:opacity-40"
          >
            {phase.kind === "signing"
              ? "confirm in your wallet…"
              : phase.kind === "mining"
                ? "mining…"
                : phase.kind === "confirming"
                  ? "waiting for the chain to serve it…"
                  : picked.length === 0
                    ? "Pick at least one asset"
                    : tooMany
                      ? `Too many assets — the limit is ${MAX_ASSETS_FALLBACK}`
                      : "Create mandate"}
          </button>

          {phase.kind === "confirming" && (
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              Mined. The public RPC load-balances, so a confirmed write is not
              immediately readable — polling until it is (D18) rather than
              showing you a zero.
            </p>
          )}

          {phase.kind === "done" && (
            <div className="mt-4 rounded-lg border border-signal-deep bg-signal/6 px-4 py-3">
              <p className="text-[13px] text-ink">
                Mandate <Num>#{phase.mandateId.toString()}</Num> created,
                allowing <Num>{phase.allowed.length}</Num> assets.
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

              {phase.rules.kind === "installing" && (
                <p className="mt-2 text-[12.5px] text-dim">
                  Installing the exit rules — confirm the second transaction in
                  your wallet.
                </p>
              )}
              {phase.rules.kind === "installed" && (
                <p className="mt-2 text-[12.5px] text-ink">
                  <Num>{phase.rules.count}</Num> exit rule
                  {phase.rules.count === 1 ? "" : "s"} installed and read back
                  from the chain. PolicyGuard now refuses a fill on this mandate
                  while any of them is firing.
                  {explorer && (
                    <a
                      href={`${explorer}/tx/${phase.rules.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block font-mono text-[11px] break-all text-faint hover:text-signal"
                    >
                      {phase.rules.hash}
                    </a>
                  )}
                </p>
              )}
              {/* As loud as a revert on purpose: the mandate above succeeded, and
                  a user who reads that line and stops has a live mandate with no
                  exit rules on it. */}
              {phase.rules.kind === "failed" && (
                <p className="mt-2 rounded-md border border-refuse/40 bg-refuse/6 px-3 py-2 text-[12.5px] text-refuse">
                  The mandate exists, but its exit rules were{" "}
                  <strong>not</strong> installed: {phase.rules.message}. Add
                  them from the mandate panel below, or with{" "}
                  <code className="font-mono">
                    pnpm mandate:edit {phase.mandateId.toString()} trigger
                  </code>
                  .
                </p>
              )}
            </div>
          )}

          {phase.kind === "failed" && (
            <div className="mt-4 rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
              <p className="font-mono text-[12px] leading-relaxed break-words text-refuse">
                {phase.message}
              </p>
            </div>
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-faint">
            The mandate is yours: you are{" "}
            <code className="font-mono">owner</code> because you send this
            transaction, your funds never leave your wallet, and the policy
            above is what PolicyGuard enforces on every future fill — reverting
            in the trade&apos;s own transaction if one breaches it. You are also
            the <code className="font-mono">agent</code>, so no key of ours can
            propose anything against it.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * One cap, in a box of its own.
 *
 * Five small inputs on a shared row read as a settings dialog, and these are not
 * settings — each one is a bound the chain will enforce inside a trade, and the
 * user is choosing the number. So the field borrows the swap box's proportions:
 * the label small and quiet above, the value the largest thing in the box, the
 * unit as a chip beside it rather than as loose text trailing the input.
 *
 * `focus-within` on the container rather than `focus` on the input, because the
 * box is what the eye reads as the control.
 */
function Field({
  label,
  value,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  suffix?: string;
  /** What the number means, in the box, where it is read. */
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block rounded-xl border border-line bg-raised px-4 py-3 focus-within:border-signal-deep">
      <span className="block text-[11px] font-semibold tracking-[0.09em] text-faint uppercase">
        {label}
      </span>
      <span className="mt-1.5 flex items-baseline gap-2">
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent font-mono text-[20px] tabular-nums text-ink outline-none"
        />
        {suffix && (
          <span className="shrink-0 rounded-full border border-line bg-panel px-2 py-0.5 font-mono text-[11px] text-dim">
            {suffix}
          </span>
        )}
      </span>
      {hint && (
        <span className="mt-1.5 block text-[12px] leading-snug text-faint">
          {hint}
        </span>
      )}
    </label>
  );
}
