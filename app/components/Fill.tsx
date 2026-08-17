'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { ERC20_ABI, EXECUTOR_ABI, POLICY_GUARD_ABI } from '@/src/abi';
import { ADDR } from '@/src/chain';
import { awaitReceipt } from './awaitReceipt';
import type { UniverseEntry } from '@/src/pipeline';
import { buildPermit, describePermit, PERMIT_TTL_SEC } from '@/src/permit';
import { FILLED_EVENT, FOLLOW_EVENT, MANDATES_CHANGED_EVENT, type FollowRequest } from './follow';
import { Card, Legend, Note, Num, Pill } from './ui';
import { useWallet } from './useWallet';

/**
 * One real fill, from the browser.
 *
 * Every part of this existed and none of it was reachable: `src/permit.ts` could
 * build the authorisation, `Executor.execute` could spend it, and the only way
 * to join the two was a Node script holding a private key. **The browser had
 * never placed a fill.**
 *
 * The split of work is the security argument, not an implementation detail:
 *
 *  - The **server** (`POST /api/fill`) quotes, checks the pool the executor will
 *    derive, reads the oracle, asks `PolicyGuard.dryRun`, and hashes the
 *    evidence. It holds no key and what it returns cannot move anything.
 *  - The **browser** does the three things that must happen in the user's own
 *    wallet: approve Permit2 once per token, sign an authorisation scoped to one
 *    token, one amount, one spender and twenty minutes, and send the
 *    transaction. Nothing here is signed on the user's behalf, and the page
 *    never sees a key.
 *
 * The guard then runs *inside* the fill: a policy breach unwinds the swap in the
 * same transaction rather than being reported after it. Which is why a refusal
 * shown below is not a wasted trip — it is the reason not to make one.
 */

/** `POST /api/fill` serialises BigInt as a decimal string — see the route. */
interface WirePlan {
  chainId: number;
  executor: Address;
  guard: Address;
  cash: Address;
  cashDecimals: number;
  leg: { asset: Address; amountInUsdg: string; minAmountOut: string; fee: number };
  amountIn: string;
  symbol: string;
  decimals: number;
  quote: {
    out: number;
    amountOut: string;
    effectivePrice: number;
    impactBps: number;
    pool: Address;
    feeTier: number;
  };
  oracle: {
    fairValueE8: string;
    confidenceBps: number;
    gapRisk: number;
    capacityUsdg: string;
    updatedAt: number;
    ageSeconds: number;
    hasValue: boolean;
    maxAgeSeconds: number;
    stale: boolean;
  };
  predicted: { executionPriceE8: string; slippageBps: number };
  verdict: { allow: boolean; reason: string; offendingAsset: Address | null };
  thesis: { hash: Hex; id: number; publishedAt: number } | null;
  evidence: {
    hash: Hex;
    /** Where the bundle went. `none` means nobody can ever audit this fill (D80). */
    persistence:
      | { kind: 'blob'; url: string }
      | { kind: 'file'; path: string }
      | { kind: 'none'; reason: string };
    bundle: unknown;
  };
  mandate: { id: string; owner: Address; agent: Address; executor: Address; active: boolean };
}

interface Usable {
  id: bigint;
  assets: Address[];
  maxNotionalPerTrade: bigint;
  fillsThisEpoch: number;
  maxFillsPerEpoch: number;
  breaker: boolean;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'quoting' }
  | { kind: 'approving' }
  | { kind: 'signing' }
  | { kind: 'sending' }
  | { kind: 'mining'; hash: Hex }
  | { kind: 'confirming'; hash: Hex }
  | { kind: 'done'; hash: Hex; received: bigint; symbol: string; decimals: number }
  | { kind: 'failed'; message: string };

const e8 = (raw: string) => (Number(BigInt(raw)) / 1e8).toFixed(4);
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function Fill() {
  const { address, option, walletClient, publicClient } = useWallet();

  const [universe, setUniverse] = useState<UniverseEntry[]>([]);
  const [mandates, setMandates] = useState<Usable[] | null>(null);
  const [mandateId, setMandateId] = useState<bigint | null>(null);
  const [asset, setAsset] = useState<Address | null>(null);
  const [amount, setAmount] = useState('0.5');
  const [follow, setFollow] = useState<FollowRequest | null>(null);
  const [plan, setPlan] = useState<WirePlan | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [cash, setCash] = useState<{ address: Address; decimals: number; balance: bigint } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const mainnet = option?.chain.id === 196;
  const executor = option?.deployment.contracts.Executor as Address | undefined;

  useEffect(() => {
    fetch('/api/universe')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setUniverse(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onFollow = (e: Event) => setFollow((e as CustomEvent<FollowRequest>).detail);
    window.addEventListener(FOLLOW_EVENT, onFollow);
    return () => window.removeEventListener(FOLLOW_EVENT, onFollow);
  }, []);

  const symbolOf = new Map(universe.map((u) => [u.address.toLowerCase(), u.symbol]));

  /**
   * The mandates this wallet can actually execute against — owner, active, and
   * pointing at *this* executor, with the wallet as agent. Anything else would
   * revert, and finding that out on chain costs gas.
   */
  const load = useCallback(async () => {
    if (!publicClient || !option || !address || !executor) return;
    const guard = option.deployment.contracts.PolicyGuard as Address | undefined;
    if (!guard) return;

    setLoadError(null);
    try {
      // The settlement currency the deployed executor was built with, and what
      // this wallet holds of it. Read here rather than after quoting: a fill
      // that cannot be funded should say so before the user reads a price.
      const cashAddress = await publicClient.readContract({
        address: executor,
        abi: EXECUTOR_ABI,
        functionName: 'cash',
      });
      const [cashDecimals, balance] = await Promise.all([
        publicClient.readContract({
          address: cashAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
        publicClient.readContract({
          address: cashAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
      ]);
      setCash({ address: cashAddress, decimals: Number(cashDecimals), balance });

      const next = await publicClient.readContract({
        address: guard,
        abi: POLICY_GUARD_ABI,
        functionName: 'nextMandateId',
      });

      const found: Usable[] = [];
      // Serial: the public RPC throttles, the same discipline `serial()`
      // enforces on the server side.
      for (let id = 1n; id < next; id++) {
        const m = await publicClient.readContract({
          address: guard,
          abi: POLICY_GUARD_ABI,
          functionName: 'getMandate',
          args: [id],
        });
        if (
          !m.active ||
          m.owner.toLowerCase() !== address.toLowerCase() ||
          m.agent.toLowerCase() !== address.toLowerCase() ||
          m.executor.toLowerCase() !== executor.toLowerCase()
        ) {
          continue;
        }
        const assets = await publicClient.readContract({
          address: guard,
          abi: POLICY_GUARD_ABI,
          functionName: 'allowedAssets',
          args: [id],
        });
        found.push({
          id,
          assets: [...assets],
          maxNotionalPerTrade: m.policy.maxNotionalPerTrade,
          fillsThisEpoch: Number(m.fillsThisEpoch),
          maxFillsPerEpoch: Number(m.policy.maxFillsPerEpoch),
          breaker: m.circuitBreaker,
        });
      }
      setMandates(found);
    } catch (e) {
      // A throttled RPC is not an empty list of mandates. Without this the
      // panel sat on "reading…" forever and the rejection went to the console.
      setLoadError(e instanceof Error ? e.message : String(e));
      setMandates([]);
    }
  }, [publicClient, option, address, executor]);

  useEffect(() => {
    void load();
  }, [load]);

  // A mandate created in the panel above is not visible here until something
  // re-reads the chain. Without this the flow "create a mandate, then fill"
  // ends at "no mandate this wallet can execute against", which is false.
  //
  // `reckonz:filled` for the same reason, and it is not only this panel's own
  // fills: the exit panel below fires it too, and an exit *raises* the USDG this
  // one reports. Without it, selling a position leaves the cash line here
  // showing a balance the chain has already left behind.
  useEffect(() => {
    const onChanged = () => void load();
    window.addEventListener(MANDATES_CHANGED_EVENT, onChanged);
    window.addEventListener(FILLED_EVENT, onChanged);
    return () => {
      window.removeEventListener(MANDATES_CHANGED_EVENT, onChanged);
      window.removeEventListener(FILLED_EVENT, onChanged);
    };
  }, [load]);

  // A plan describes one asset at one size against one mandate. Changing any of
  // them and keeping the old plan on screen would leave a "sign & fill" button
  // that executes something other than what the form now says.
  useEffect(() => {
    setPlan(null);
  }, [asset, amount, mandateId]);

  // Pick the newest usable mandate, and an asset inside it — preferring the
  // followed thesis's basket when there is one.
  useEffect(() => {
    if (!mandates || mandates.length === 0) return;
    const current = mandates.find((m) => m.id === mandateId) ?? mandates[mandates.length - 1]!;
    if (current.id !== mandateId) setMandateId(current.id);

    if (asset && current.assets.some((a) => a.toLowerCase() === asset.toLowerCase())) return;
    const wanted = follow?.assets.map((a) => a.toLowerCase()) ?? [];
    const preferred = current.assets.find((a) => wanted.includes(a.toLowerCase()));
    setAsset(preferred ?? current.assets[0] ?? null);
  }, [mandates, mandateId, asset, follow]);

  const mandate = mandates?.find((m) => m.id === mandateId) ?? null;
  const busy = !['idle', 'done', 'failed'].includes(phase.kind);

  /**
   * A new follow re-points the asset at that thesis's basket, even when one is
   * already selected — following wSPYx and leaving wTSLAx in the box is a fill
   * that cannot carry the hash, and the user has to notice and fix it.
   *
   * Applied once per follow, tracked by identity rather than by value: the
   * mandate object is rebuilt on every chain read, and re-forcing the asset on
   * each of those would overrule a choice the user made afterwards.
   */
  const applied = useRef<FollowRequest | null>(null);
  useEffect(() => {
    if (!follow || follow === applied.current || !mandate) return;
    const wanted = follow.assets.map((a) => a.toLowerCase());
    const preferred = mandate.assets.find((a) => wanted.includes(a.toLowerCase()));
    applied.current = follow;
    if (preferred) setAsset(preferred);
  }, [follow, mandate]);

  /**
   * Whether the asset being bought is actually in the followed thesis's basket.
   *
   * Following a thesis and then filling something it never held would stamp its
   * hash onto a trade it did not produce — a receipt that points at reasoning
   * that says nothing about it, which is worse than an untethered fill because
   * it looks like evidence (the same argument `execute.ts` makes about an
   * unpublished hash). So the hash rides along only when the asset matches.
   */
  const carriesThesis = Boolean(
    follow && asset && follow.assets.some((a) => a.toLowerCase() === asset.toLowerCase()),
  );

  const validAmount = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;
  const wanted = cash && validAmount ? parseUnits(amount, cash.decimals) : null;
  const shortOfCash = wanted !== null && cash !== null && cash.balance < wanted;

  async function check() {
    if (!address || !mandateId || !asset) return;
    setPlan(null);
    setPhase({ kind: 'quoting' });
    try {
      const response = await fetch('/api/fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          asset,
          amountUsdg: amount,
          mandateId: mandateId.toString(),
          sender: address,
          // Only when the asset is one this thesis actually held. An untethered
          // fill claims no reasoning, which is honest; claiming reasoning it did
          // not come from is not.
          ...(carriesThesis && follow ? { thesisHash: follow.contentHash } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? `the quote failed (${response.status})`);
      setPlan(body as WirePlan);
      setPhase({ kind: 'idle' });
    } catch (e) {
      setPhase({ kind: 'failed', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function fill() {
    if (!plan || !walletClient || !publicClient || !address || !option) return;

    const amountIn = BigInt(plan.amountIn);
    try {
      // 1. Permit2 pulls through an ERC20 allowance the owner grants it once.
      //    Without this the signature is valid and the transfer still fails.
      const allowance = await publicClient.readContract({
        address: plan.cash,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, ADDR.permit2 as Address],
      });
      if (allowance < amountIn) {
        setPhase({ kind: 'approving' });
        const approval = await walletClient.writeContract({
          address: plan.cash,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDR.permit2 as Address, (1n << 160n) - 1n],
          chain: option.chain,
          account: address,
        });
        await awaitReceipt(publicClient, approval);

        // Confirmed is not readable on this chain. The next transaction depends
        // on this allowance, and gas estimation for it can revert against a node
        // that has not seen the approval yet — D18 warns about exactly this, and
        // `execute.ts` polls here for exactly this reason. Waiting is cheaper
        // than a failed estimate the user reads as a broken app.
        let visible = false;
        for (let attempt = 0; attempt < 30 && !visible; attempt++) {
          const seen = await publicClient.readContract({
            address: plan.cash,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, ADDR.permit2 as Address],
          });
          visible = seen >= amountIn;
          if (!visible) await new Promise((r) => setTimeout(r, 500));
        }
        if (!visible) {
          throw new Error(
            'the Permit2 approval was mined but is not readable yet — wait a moment and press ' +
              'fill again rather than signing against state the chain has not served.',
          );
        }
      }

      // 2. The authorisation, built by the same module every CLI fill uses.
      //    The signed struct names `spender`; the calldata struct does not,
      //    because Permit2 reconstructs it from `msg.sender` — which is what
      //    makes this usable by the executor and by nothing else.
      setPhase({ kind: 'signing' });
      const payload = await buildPermit(publicClient, {
        token: plan.cash,
        amount: amountIn,
        spender: plan.executor,
        owner: address,
        chainId: option.chain.id,
      });
      const signature = await walletClient.signTypedData({
        account: address,
        ...payload.typedData,
      });

      const before = await publicClient.readContract({
        address: plan.leg.asset,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      setPhase({ kind: 'sending' });
      const hash = await walletClient.writeContract({
        address: plan.executor,
        abi: EXECUTOR_ABI,
        functionName: 'execute',
        args: [
          BigInt(plan.mandate.id),
          [
            {
              asset: plan.leg.asset,
              amountInUsdg: BigInt(plan.leg.amountInUsdg),
              minAmountOut: BigInt(plan.leg.minAmountOut),
              fee: plan.leg.fee,
            },
          ],
          payload.permit,
          signature,
          plan.thesis?.hash ?? ZERO_HASH,
          plan.evidence.hash,
          // evidenceCID — the bundle is pinned nowhere, so this stays empty
          // rather than becoming a pointer to nothing (D57).
          '',
        ],
        chain: option.chain,
        account: address,
      });

      setPhase({ kind: 'mining', hash });
      const receipt = await awaitReceipt(publicClient, hash);
      if (receipt.status !== 'success') {
        throw new Error(`the fill reverted on chain — ${hash}`);
      }

      // A confirmed receipt does not mean the next read lands on a node that
      // has seen the block — this exact read once returned the pre-trade
      // balance and printed "received 0" for a fill that worked (D18).
      setPhase({ kind: 'confirming', hash });
      let received = 0n;
      for (let attempt = 0; attempt < 30; attempt++) {
        const after = await publicClient.readContract({
          address: plan.leg.asset,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        });
        if (after > before) {
          received = after - before;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      setPhase({
        kind: 'done',
        hash,
        received,
        symbol: plan.symbol,
        decimals: plan.decimals,
      });
      setPlan(null);
      // The receipt this produced belongs to a thesis's track record if it
      // carried a hash. Tell the panel above to read the registries again.
      // Which re-reads this panel too, through the listener above — so there is
      // no explicit `load()` here any more. Doing both ran two serial chain
      // walks at once against an RPC that throttles.
      window.dispatchEvent(new Event(FILLED_EVENT));
    } catch (e) {
      const code = (e as { code?: number })?.code;
      if (code === 4001) {
        setPhase({ kind: 'idle' });
        return;
      }
      // A guard revert decodes into a sentence, because every refusal is in the
      // ABI. Showing it verbatim is the product.
      setPhase({
        kind: 'failed',
        message: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message,
      });
    }
  }

  return (
    <Card title="Execute a fill">
      <Note>
        The quote, the oracle read and the guard&apos;s verdict come from the server; the approval,
        the signature and the transaction happen in your wallet. Nothing is signed on your behalf,
        and the permit below authorises one token, one amount, one contract, for twenty minutes.
      </Note>

      {!address ? (
        <p className="text-[13px] text-dim">Connect a wallet to place one.</p>
      ) : !option ? (
        <p className="text-[13px] text-caution">
          This wallet is on a chain with no deployment. Switch to X&nbsp;Layer using the control in
          the header.
        </p>
      ) : !mainnet ? (
        <p className="text-[13px] leading-relaxed text-caution">
          Only mainnet means anything here: X&nbsp;Layer testnet has no xStock pools, so a quote
          would be priced against liquidity that chain does not have and the swap would revert.
          Switch to X&nbsp;Layer 196.
        </p>
      ) : loadError ? (
        <div className="rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
          <p className="font-mono text-[12px] leading-relaxed break-words text-refuse">
            {loadError}
          </p>
          <p className="mt-1 text-[12px] text-faint">
            The chain could not be read, which is not the same as owning no mandate.
          </p>
        </div>
      ) : mandates === null ? (
        <p className="text-[13px] text-dim">Reading your mandates from the chain…</p>
      ) : mandates.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-dim">
          No mandate this wallet can execute against. Create one above — it has to be active, own
          this wallet as both owner and agent, and point at the executor deployed here.
        </p>
      ) : (
        <>
          {follow && (
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-signal-deep bg-signal/6 px-4 py-2.5">
              <p className="max-w-[70ch] text-[12.5px] leading-relaxed text-ink">
                Following thesis <Num>#{follow.thesisId}</Num> —{' '}
                {carriesThesis ? (
                  <>
                    this fill will carry its hash, so it lands in that thesis&apos;s track record
                    rather than counting as an untethered trade.
                  </>
                ) : (
                  <span className="text-caution">
                    the asset selected is not one this thesis held ({follow.symbols.join(', ')}),
                    so the fill will <em>not</em> carry its hash. Stamping it on a trade the thesis
                    never produced would look like evidence and be none.
                  </span>
                )}
              </p>
              <button
                onClick={() => setFollow(null)}
                className="rounded-full border border-line bg-raised px-2.5 py-0.5 font-mono text-[10.5px] text-faint hover:text-ink"
              >
                stop following
              </button>
            </div>
          )}

          <div className="mb-1 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">mandate</span>
              <select
                value={mandateId?.toString() ?? ''}
                onChange={(e) => setMandateId(BigInt(e.target.value))}
                className="rounded-md border border-line bg-raised px-2 py-1 font-mono text-[12px] text-ink outline-none focus:border-signal-deep"
              >
                {mandates.map((m) => (
                  <option key={m.id.toString()} value={m.id.toString()}>
                    #{m.id.toString()}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">asset</span>
              <select
                value={asset ?? ''}
                onChange={(e) => setAsset(e.target.value as Address)}
                className="rounded-md border border-line bg-raised px-2 py-1 font-mono text-[12px] text-ink outline-none focus:border-signal-deep"
              >
                {(mandate?.assets ?? []).map((a) => (
                  <option key={a} value={a}>
                    {symbolOf.get(a.toLowerCase()) ?? a.slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">size</span>
              <span className="flex items-baseline gap-1.5">
                <input
                  value={amount}
                  inputMode="decimal"
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-24 rounded-md border border-line bg-raised px-2 py-1 font-mono text-[12px] text-ink outline-none focus:border-signal-deep"
                />
                <span className="font-mono text-[11px] text-faint">USDG</span>
              </span>
            </label>

            <button
              onClick={check}
              disabled={busy || !asset || !validAmount}
              className="rounded-full border border-line bg-raised px-4 py-1 font-mono text-[12px] text-ink hover:border-signal-deep disabled:opacity-40"
            >
              {phase.kind === 'quoting' ? 'quoting…' : 'quote & check'}
            </button>
          </div>

          {mandate && cash && (
            <p className="mb-2 font-mono text-[11px] text-faint">
              {formatUnits(mandate.maxNotionalPerTrade, cash.decimals)} USDG per trade ·{' '}
              {mandate.fillsThisEpoch}/{mandate.maxFillsPerEpoch} fills this epoch · you hold{' '}
              <span className={shortOfCash ? 'text-caution' : undefined}>
                {formatUnits(cash.balance, cash.decimals)} USDG
              </span>
              {mandate.breaker && <span className="text-refuse"> · breaker tripped</span>}
            </p>
          )}

          {shortOfCash && (
            <p className="mb-2 text-[12px] leading-relaxed text-caution">
              That is more USDG than this wallet holds. The guard would allow it and the transfer
              would fail — Permit2 authorises a pull, it does not create the balance.
            </p>
          )}

          {plan && <Plan plan={plan} />}

          {plan?.verdict.allow && (
            <>
              <Legend>what you are about to sign</Legend>
              <ul className="mb-3 grid gap-0.5">
                {describePermit(
                  {
                    token: plan.cash,
                    amount: BigInt(plan.amountIn),
                    spender: plan.executor,
                    owner: address,
                    chainId: option.chain.id,
                  },
                  // The permit is built when you commit, moments from now, so
                  // this is the TTL it will carry rather than one already running.
                  BigInt(Math.floor(Date.now() / 1000) + PERMIT_TTL_SEC),
                  'USDG',
                  plan.cashDecimals,
                ).map((line) => (
                  <li key={line} className="font-mono text-[12px] text-dim">
                    · {line}
                  </li>
                ))}
              </ul>

              <button
                onClick={fill}
                disabled={busy || shortOfCash}
                className="rounded-full border border-signal-deep bg-signal/6 px-4 py-1 font-mono text-[12px] text-signal hover:bg-signal/12 disabled:opacity-40"
              >
                {phase.kind === 'approving'
                  ? 'approving Permit2 in your wallet…'
                  : phase.kind === 'signing'
                    ? 'sign the permit in your wallet…'
                    : phase.kind === 'sending'
                      ? 'confirm the fill in your wallet…'
                      : phase.kind === 'mining'
                        ? 'mining…'
                        : phase.kind === 'confirming'
                          ? 'waiting for the chain to serve the balance…'
                          : 'sign & fill'}
              </button>
            </>
          )}

          {phase.kind === 'confirming' && (
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              Mined. The public RPC load-balances, so a confirmed write is not immediately
              readable — polling until the balance moves rather than reporting a zero (D18).
            </p>
          )}

          {phase.kind === 'done' && (
            <div className="mt-4 rounded-lg border border-signal-deep bg-signal/6 px-4 py-3">
              {phase.received > 0n ? (
                <p className="text-[13px] text-ink">
                  Filled — <Num>{formatUnits(phase.received, phase.decimals)}</Num> {phase.symbol}{' '}
                  landed in your own wallet. The executor never held it.
                </p>
              ) : (
                // A fill that worked once printed "received 0" because the read
                // hit a node that had not seen the block (D18). Saying the
                // balance is not visible yet is true; saying zero arrived is not.
                <p className="text-[13px] leading-relaxed text-ink">
                  Mined, and the {phase.symbol} balance has not become readable within 15 seconds.
                  The transaction is below — check it on the explorer rather than trusting a zero.
                </p>
              )}
              {option.deployment.explorer && (
                <a
                  href={`${option.deployment.explorer}/tx/${phase.hash}`}
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

/** The decision, laid out before anything is signed. */
function Plan({ plan }: { plan: WirePlan }) {
  return (
    <>
      <Legend>quote</Legend>
      <ul className="grid gap-0.5 font-mono text-[12px] tabular-nums">
        <Row label="buys">
          <Num>{plan.quote.out.toFixed(6)}</Num> {plan.symbol} at{' '}
          <Num>{plan.quote.effectivePrice.toFixed(4)}</Num>
        </Row>
        <Row label="impact">
          <Num tone={plan.quote.impactBps > 50 ? 'caution' : undefined}>
            {(plan.quote.impactBps / 100).toFixed(2)}%
          </Num>{' '}
          <span className="text-faint">
            fee tier {plan.quote.feeTier} · pool {plan.quote.pool.slice(0, 10)}…, the one the
            executor derives
          </span>
        </Row>
        <Row label="floor">
          {formatUnits(BigInt(plan.leg.minAmountOut), plan.decimals)} {plan.symbol}{' '}
          <span className="text-faint">or the swap reverts</span>
        </Row>
      </ul>

      <Legend>oracle</Legend>
      <ul className="grid gap-0.5 font-mono text-[12px] tabular-nums">
        <Row label="fair value">
          {plan.oracle.hasValue ? (
            <>
              <Num tone={plan.oracle.stale ? 'caution' : undefined}>
                {e8(plan.oracle.fairValueE8)}
              </Num>{' '}
              <span className="text-faint">
                ±{(plan.oracle.confidenceBps / 100).toFixed(2)}% · {plan.oracle.ageSeconds}s old
              </span>
            </>
          ) : (
            <span className="text-caution">
              withheld — the oracle will not defend a number for this asset
            </span>
          )}
        </Row>
        {plan.oracle.stale && (
          <Row label="">
            <span className="text-caution">
              past the oracle&apos;s {plan.oracle.maxAgeSeconds}s freshness limit, so the guard
              refuses on age alone — the publisher is not running
            </span>
          </Row>
        )}
        <Row label="gap risk">
          <Num tone={plan.oracle.gapRisk > 50 ? 'caution' : undefined}>{plan.oracle.gapRisk}</Num>
        </Row>
        <Row label="predicted">
          <Num>{e8(plan.predicted.executionPriceE8)}</Num>{' '}
          <span className="text-faint">
            paid, {plan.predicted.slippageBps} bps above fair value
          </span>
        </Row>
      </ul>

      <Legend>verdict</Legend>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {plan.verdict.allow ? (
          <Pill tone="ok">ALLOW — the guard would let this through</Pill>
        ) : (
          <Pill tone="warn">REJECT · {plan.verdict.reason}</Pill>
        )}
        {plan.verdict.offendingAsset && (
          <span className="font-mono text-[11px] text-faint">
            on {plan.verdict.offendingAsset}
          </span>
        )}
      </div>
      {!plan.verdict.allow && (
        <p className="mb-2 text-[12px] leading-relaxed text-faint">
          Asked before any gas was spent. The same check runs inside the transaction, so executing
          anyway would revert — this is the trip not taken, not a trip that failed.
        </p>
      )}

      <ul className="grid gap-0.5 font-mono text-[11.5px]">
        <Row label="evidence">
          <span className="break-all text-dim">{plan.evidence.hash}</span>
        </Row>
        <Row label="">
          {/* The hash goes on chain either way, so an unarchived bundle is not a
              broken fill — it is a fill nobody can ever audit, which is a
              different and quieter kind of loss. It used to read "not stored"
              in the same grey as everything else; in production that was every
              fill (D80). */}
          {plan.evidence.persistence.kind === 'none' ? (
            <span className="text-caution">
              {!plan.verdict.allow
                ? 'hashed but not archived — nothing was decided to happen here'
                : `not archived — ${plan.evidence.persistence.reason}. Download it below, or the hash on chain will point at nothing.`}
            </span>
          ) : plan.evidence.persistence.kind === 'blob' ? (
            <a
              href={plan.evidence.persistence.url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-faint hover:text-signal"
            >
              archived — anyone can fetch it and re-derive this hash
            </a>
          ) : (
            <span className="text-faint">
              written to {plan.evidence.persistence.path} — the hash binds, the file is how anyone
              checks it
            </span>
          )}
        </Row>
        <Row label="">
          {/* Offered whatever happened above: the bundle is the user's own
              record of what they were shown before they signed. */}
          <button
            onClick={() => downloadBundle(plan.evidence.hash, plan.evidence.bundle)}
            className="text-faint underline decoration-dotted hover:text-signal"
          >
            download the bundle
          </button>
        </Row>
        {plan.thesis && (
          <Row label="thesis">
            <span className="text-dim">
              #{plan.thesis.id}, published{' '}
              {new Date(plan.thesis.publishedAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}
              Z — before this fill
            </span>
          </Row>
        )}
      </ul>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-3">
      <span className="w-20 shrink-0 text-faint">{label}</span>
      <span className="text-dim">{children}</span>
    </li>
  );
}

/**
 * Hand the user their own copy.
 *
 * The bundle is what they were shown before they signed, and its hash is on
 * chain. When nothing archived it — a read-only runtime with no blob store —
 * this is the only copy that will ever exist, so the button is offered even
 * when the archive worked.
 */
function downloadBundle(hash: string, bundle: unknown) {
  const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${hash}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
