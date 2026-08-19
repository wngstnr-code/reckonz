'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { ERC20_ABI, EXECUTOR_ABI, POLICY_GUARD_ABI } from '@/src/abi';
import { ADDR } from '@/src/chain';
import { awaitReceipt } from './awaitReceipt';
import type { UniverseEntry } from '@/src/pipeline';
import { buildPermit, describePermit, PERMIT_TTL_SEC } from '@/src/permit';
import {
  FILLED_EVENT,
  MANDATES_CHANGED_EVENT,
  PICK_ASSET_EVENT,
  QUOTED_EVENT,
  type FilledDetail,
  type PickAssetDetail,
  type QuotedDetail,
} from './follow';
import { SwapBox, SwapLeg, TokenChip } from './console/trade/SwapBox';
import { Chevron, MenuList, useMenu } from './console/trade/Menu';
import { Legend, Num, Pill, tokenAmount } from './ui';
import { useWallet } from './useWallet';

/**
 * The way out, from the browser.
 *
 * `Fill` could enter a position and nothing here could leave one: `pnpm exit`
 * has sold a position back to USDG since D51, but only as a Node script holding
 * a private key. A product whose claim is risk tooling cannot have an entrance
 * on the page and an exit in a terminal — the moment you actually want to leave
 * is the moment you are least able to go and find a shell.
 *
 * The split is the same as `Fill`, for the same reason:
 *
 *  - The **server** (`POST /api/exit`) simulates every fee tier in the sell
 *    direction, checks the pool the executor will derive, reads the oracle, asks
 *    `PolicyGuard.dryRun` and hashes the evidence. It holds no key.
 *  - The **browser** approves Permit2 once for the token being sold, signs an
 *    authorisation scoped to that token, that many units, one spender and twenty
 *    minutes, and sends the transaction.
 *
 * Two things differ from the entry path and both are the direction. The permit
 * names the **asset**, not the cash — so the one-off Permit2 approval is a
 * separate approval per xStock. And the oracle is **advisory** here: since D56
 * the guard does not run `checkExecution` on an exit, because an unpublished
 * oracle trapping every open position is worse than one that pauses new ones.
 * The floor derived from the pool simulation is what protects the sale.
 */

/** `POST /api/exit` serialises BigInt as a decimal string — see the route. */
interface WirePlan {
  chainId: number;
  executor: Address;
  guard: Address;
  cash: Address;
  cashDecimals: number;
  leg: { asset: Address; amountIn: string; minAmountOutUsdg: string; fee: number };
  symbol: string;
  decimals: number;
  units: string;
  held: string;
  quote: {
    amountOut: string;
    effectivePrice: number;
    pool: Address;
    feeTier: number;
    considered: { fee: number; out: string }[];
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
  predicted: {
    executionPriceE8: string;
    /** `null` when nothing measured it — never render a zero here (D77). */
    shortfallBps: number | null;
    status: 'measured' | 'unmeasured-stale' | 'unmeasured-no-value';
    /** What the contract will compute and the guard will check. */
    guardSlippageBps: number;
  };
  verdict: { allow: boolean; reason: string; offendingAsset: Address | null };
  /** Our own refusal, separate from the guard's: see D77. */
  signable: { ok: boolean; reason: string | null };
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

interface Holding {
  address: Address;
  symbol: string;
  decimals: number;
  balance: bigint;
}

interface Usable {
  id: bigint;
  assets: Address[];
  breaker: boolean;
  /** An exit spends one of these, the same as an entry — `dryRun` returns EPOCH_LIMIT either way. */
  fillsThisEpoch: number;
  maxFillsPerEpoch: number;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'quoting' }
  | { kind: 'approving' }
  | { kind: 'signing' }
  | { kind: 'sending' }
  | { kind: 'mining'; hash: Hex }
  | { kind: 'confirming'; hash: Hex }
  | { kind: 'done'; hash: Hex; received: bigint; decimals: number }
  | { kind: 'failed'; message: string };

const e8 = (raw: string) => (Number(BigInt(raw)) / 1e8).toFixed(4);
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function Exit() {
  const { address, option, walletClient, publicClient } = useWallet();

  const [universe, setUniverse] = useState<UniverseEntry[]>([]);
  const [mandates, setMandates] = useState<Usable[] | null>(null);
  const [mandateId, setMandateId] = useState<bigint | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [asset, setAsset] = useState<Address | null>(null);
  const [units, setUnits] = useState('');
  const [plan, setPlan] = useState<WirePlan | null>(null);
  /** Consent to sell with no slippage protection, when nothing can measure it. */
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [loadError, setLoadError] = useState<string | null>(null);

  /** The mandate picker, which is ours rather than the platform's. See `Menu`. */
  const menu = useMenu();

  const mainnet = option?.chain.id === 196;
  const executor = option?.deployment.contracts.Executor as Address | undefined;

  useEffect(() => {
    fetch('/api/universe')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setUniverse(d))
      .catch(() => {});
  }, []);

  const symbolOf = new Map(universe.map((u) => [u.address.toLowerCase(), u.symbol]));

  // A position row in the left column, or a leg in the basket rail, naming what
  // to sell. Only the sell direction: the buy message belongs to `Fill`.
  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<PickAssetDetail>).detail;
      if (d?.direction === 'sell') setAsset(d.asset as Address);
    };
    window.addEventListener(PICK_ASSET_EVENT, onPick);
    return () => window.removeEventListener(PICK_ASSET_EVENT, onPick);
  }, []);

  /**
   * The mandates this wallet can exit through, and what it actually holds of
   * each allowed asset.
   *
   * The balance is read from the token, not from `getPosition`. The guard's
   * position is what *it* recorded from settled fills; the permit pulls from the
   * wallet. When the two disagree — an asset bought under a different mandate,
   * or transferred in — the wallet balance is the one that decides whether the
   * transfer succeeds.
   */
  const load = useCallback(async () => {
    if (!publicClient || !option || !address || !executor) return;
    const guard = option.deployment.contracts.PolicyGuard as Address | undefined;
    if (!guard) return;

    setLoadError(null);
    try {
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
          breaker: m.circuitBreaker,
          fillsThisEpoch: Number(m.fillsThisEpoch),
          maxFillsPerEpoch: Number(m.policy.maxFillsPerEpoch),
        });
      }
      setMandates(found);
    } catch (e) {
      // A throttled RPC is not an empty list of mandates.
      setLoadError(e instanceof Error ? e.message : String(e));
      setMandates([]);
    }
  }, [publicClient, option, address, executor]);

  useEffect(() => {
    void load();
  }, [load]);

  // A fill placed above, or a mandate whose allowlist changed, changes what
  // there is to sell here.
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener(FILLED_EVENT, reload);
    window.addEventListener(MANDATES_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener(FILLED_EVENT, reload);
      window.removeEventListener(MANDATES_CHANGED_EVENT, reload);
    };
  }, [load]);

  const mandate = mandates?.find((m) => m.id === mandateId) ?? null;

  useEffect(() => {
    if (!mandates || mandates.length === 0) return;
    if (!mandates.some((m) => m.id === mandateId)) {
      setMandateId(mandates[mandates.length - 1]!.id);
    }
  }, [mandates, mandateId]);

  // What this wallet holds of the selected mandate's allowlist. Read here rather
  // than after quoting: an exit that cannot be funded should say so before the
  // user reads a price.
  useEffect(() => {
    let cancelled = false;
    if (!publicClient || !address || !mandate) {
      setHoldings([]);
      return;
    }
    (async () => {
      const read: Holding[] = [];
      for (const a of mandate.assets) {
        const [balance, decimals] = await Promise.all([
          publicClient.readContract({
            address: a,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          }),
          publicClient.readContract({ address: a, abi: ERC20_ABI, functionName: 'decimals' }),
        ]);
        read.push({
          address: a,
          symbol: symbolOf.get(a.toLowerCase()) ?? a.slice(0, 10),
          decimals: Number(decimals),
          balance,
        });
      }
      if (!cancelled) setHoldings(read);
    })().catch((e) => {
      if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
    // `universe.length` rather than `symbolOf`: the map is rebuilt every render
    // and would re-read the chain on each one.
  }, [publicClient, address, mandate, universe.length]);

  // Default to something there is actually a position in — offering a zero
  // balance as the first choice makes the panel look broken when it is not.
  useEffect(() => {
    if (holdings.length === 0) return;
    if (asset && holdings.some((h) => h.address === asset)) return;
    setAsset((holdings.find((h) => h.balance > 0n) ?? holdings[0]!).address);
  }, [holdings, asset]);

  const holding = holdings.find((h) => h.address === asset) ?? null;

  // A plan describes one asset at one size against one mandate. Changing any of
  // them and keeping the old plan on screen would leave a "sign & exit" button
  // that sells something other than what the form now says.
  useEffect(() => {
    setPlan(null);
    // The acknowledgement is about one sale of one size. Carrying it across a
    // change of asset or size would be consent to something else.
    setAck(false);
  }, [asset, units, mandateId]);

  const busy = !['idle', 'done', 'failed'].includes(phase.kind);
  const validUnits = /^\d+(\.\d+)?$/.test(units) && Number(units) > 0;
  const wanted = holding && validUnits ? parseUnits(units, holding.decimals) : null;
  const shortOfAsset = wanted !== null && holding !== null && holding.balance < wanted;

  // `acknowledged` is passed rather than read from state: ticking the box calls
  // this immediately, and a state update is not visible until the next render.
  async function check(acknowledged = ack) {
    if (!address || !mandateId || !asset) return;
    setPlan(null);
    setPhase({ kind: 'quoting' });
    try {
      const response = await fetch('/api/exit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          asset,
          units,
          mandateId: mandateId.toString(),
          sender: address,
          acknowledgeUnmeasured: acknowledged,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? `the quote failed (${response.status})`);
      const quoted = body as WirePlan;
      setPlan(quoted);
      setPhase({ kind: 'idle' });
      window.dispatchEvent(
        new CustomEvent<QuotedDetail>(QUOTED_EVENT, {
          detail: {
            symbol: quoted.symbol,
            isExit: true,
            allow: quoted.verdict.allow,
            reason: quoted.verdict.allow ? undefined : quoted.verdict.reason,
          },
        }),
      );
    } catch (e) {
      setPhase({ kind: 'failed', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function sell() {
    if (!plan || !walletClient || !publicClient || !address || !option) return;

    const amountIn = BigInt(plan.leg.amountIn);
    try {
      // 1. Permit2 pulls through an ERC20 allowance the owner grants it once —
      //    per token. The approval the entry path made was for USDG, so the
      //    first exit in each asset needs its own.
      const allowance = await publicClient.readContract({
        address: plan.leg.asset,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, ADDR.permit2 as Address],
      });
      if (allowance < amountIn) {
        setPhase({ kind: 'approving' });
        const approval = await walletClient.writeContract({
          address: plan.leg.asset,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDR.permit2 as Address, (1n << 160n) - 1n],
          chain: option.chain,
          account: address,
        });
        await awaitReceipt(publicClient, approval);

        // Confirmed is not readable on this chain, and the next transaction
        // depends on this allowance: gas estimation for it can revert against a
        // node that has not seen the approval yet (D18). Waiting is cheaper than
        // a failed estimate the user reads as a broken app.
        let visible = false;
        for (let attempt = 0; attempt < 30 && !visible; attempt++) {
          const seen = await publicClient.readContract({
            address: plan.leg.asset,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, ADDR.permit2 as Address],
          });
          visible = seen >= amountIn;
          if (!visible) await new Promise((r) => setTimeout(r, 500));
        }
        if (!visible) {
          throw new Error(
            'the Permit2 approval was mined but is not readable yet, wait a moment and press ' +
              'exit again rather than signing against state the chain has not served.',
          );
        }
      }

      // 2. The authorisation, over the asset being sold rather than the cash.
      //    Same module the CLI exit uses; the signed struct names `spender` and
      //    the calldata struct does not, because Permit2 reconstructs it from
      //    `msg.sender`.
      setPhase({ kind: 'signing' });
      const payload = await buildPermit(publicClient, {
        token: plan.leg.asset,
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
        address: plan.cash,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      setPhase({ kind: 'sending' });
      const hash = await walletClient.writeContract({
        address: plan.executor,
        abi: EXECUTOR_ABI,
        functionName: 'exit',
        args: [
          BigInt(plan.mandate.id),
          [
            {
              asset: plan.leg.asset,
              amountIn,
              minAmountOutUsdg: BigInt(plan.leg.minAmountOutUsdg),
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
        throw new Error(`the exit reverted on chain: ${hash}`);
      }

      // A confirmed receipt does not mean the next read lands on a node that has
      // seen the block. Polling until the cash moves rather than reporting a
      // zero for a sale that worked (D18).
      setPhase({ kind: 'confirming', hash });
      let received = 0n;
      for (let attempt = 0; attempt < 30; attempt++) {
        const after = await publicClient.readContract({
          address: plan.cash,
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

      setPhase({ kind: 'done', hash, received, decimals: plan.cashDecimals });
      setPlan(null);
      setUnits('');
      // The position this closed belongs to the panels above — the mandate's
      // recorded position moved, a receipt now exists, and the fill panel's cash
      // line just went up. The listener above re-reads this panel, so there is
      // no explicit `load()` here.
      window.dispatchEvent(
        new CustomEvent<FilledDetail>(FILLED_EVENT, {
          detail: { symbol: plan.symbol, isExit: true },
        }),
      );
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
    <>
      {!address ? (
        <p className="text-[13px] text-dim">Connect a wallet to sell one.</p>
      ) : !option ? (
        <p className="text-[13px] text-caution">
          This wallet is on a chain with no deployment. Switch to X&nbsp;Layer using the control in
          the header.
        </p>
      ) : !mainnet ? (
        <p className="text-[13px] leading-relaxed text-caution">
          Only mainnet means anything here: X&nbsp;Layer testnet has no xStock pools, so there is
          nothing to sell into. Switch to X&nbsp;Layer 196.
        </p>
      ) : loadError ? (
        <div className="rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
          <p className="font-mono text-[12px] leading-relaxed break-words text-refuse">
            {loadError}
          </p>
          <p className="mt-1 text-[12px] text-faint">
            The chain could not be read, which is not the same as holding nothing.
          </p>
        </div>
      ) : mandates === null ? (
        <p className="text-[13px] text-dim">Reading your mandates from the chain…</p>
      ) : mandates.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-dim">
          No mandate this wallet can exit through. An exit is a fill, so it needs the same mandate
          an entry does.
        </p>
      ) : (
        <>
          <div ref={menu.box} className="relative mb-3">
            <button
              onClick={() => menu.setOpen(!menu.open)}
              aria-haspopup="listbox"
              aria-expanded={menu.open}
              className="flex w-full items-center justify-between gap-3 rounded-lg bg-inset px-3.5 py-2.5"
            >
              <span className="text-[14px] text-ink">Mandate</span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[15px] text-ink">#{mandateId?.toString()}</span>
                <Chevron open={menu.open} />
              </span>
            </button>
            {menu.open && (
              <MenuList
                options={mandates.map((m) => ({
                  value: m.id.toString(),
                  label: `Mandate #${m.id.toString()}`,
                }))}
                value={mandateId?.toString() ?? ''}
                onChange={(next) => setMandateId(BigInt(next))}
                onClose={() => menu.setOpen(false)}
              />
            )}
          </div>

          {/* The same box as the entry, with the halves swapped. That is what an
              exit is, and giving it its own layout would make the reverse trade
              look like a different kind of act than the one it undoes. */}
          <SwapBox
            top={
              <SwapLeg
                label="Sell"
                amount={units}
                onAmountChange={setUnits}
                token={
                  <TokenChip
                    symbol={holding?.symbol ?? symbolOf.get((asset ?? '').toLowerCase()) ?? '—'}
                    value={asset ?? ''}
                    onChange={(next) => setAsset(next as Address)}
                    options={holdings.map((h) => ({
                      value: h.address,
                      label: h.balance === 0n ? `${h.symbol}, none held` : h.symbol,
                    }))}
                  />
                }
                hint={
                  holding ? (
                    <span
                      className={shortOfAsset ? 'text-caution' : undefined}
                      title={formatUnits(holding.balance, holding.decimals)}
                    >
                      you hold {tokenAmount(formatUnits(holding.balance, holding.decimals))}
                    </span>
                  ) : null
                }
                right={
                  holding && holding.balance > 0n ? (
                    <button
                      onClick={() => setUnits(formatUnits(holding.balance, holding.decimals))}
                      className="font-mono text-[11.5px] text-faint underline decoration-dotted hover:text-ink"
                    >
                      all
                    </button>
                  ) : null
                }
              />
            }
            bottom={
              <SwapLeg
                label="Receive"
                amount={plan ? formatUnits(BigInt(plan.quote.amountOut), plan.cashDecimals) : ''}
                token={<TokenChip symbol="USDG" />}
                hint={plan ? `at ${plan.quote.effectivePrice.toFixed(4)}` : 'quote to see the size'}
              />
            }
          />

          {holdings.length === 0 && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-dim">
              This mandate allows no assets, so there is nothing it can sell.
            </p>
          )}

          {mandate && (
            <p className="mt-2.5 font-mono text-[12px] text-ink tabular-nums">
              {/* An exit spends one of the epoch's fills. Showing it here rather
                  than letting the user meet EPOCH_LIMIT at the quote: the point
                  of a rate limit is to be visible before it binds. */}
              {mandate.fillsThisEpoch}/{mandate.maxFillsPerEpoch} fills this epoch, and this would
              be one
              {mandate.breaker && (
                <span className="text-refuse"> · breaker tripped, exits stopped too</span>
              )}
            </p>
          )}

          {shortOfAsset && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-caution">
              More {holding?.symbol} than this wallet holds. Permit2 authorises a pull, it does not
              create the balance.
            </p>
          )}

          {!plan && (
            <button
              onClick={() => void check()}
              disabled={busy || !asset || !validUnits || shortOfAsset}
              className="mt-4 w-full rounded-xl bg-ink px-4 py-3.5 text-[15px] font-semibold text-ground hover:opacity-90 disabled:opacity-30"
            >
              {phase.kind === 'quoting' ? 'quoting…' : 'Quote & check'}
            </button>
          )}

          {plan && <Plan plan={plan} />}

          {/* Our refusal, above the guard's. The plan is real and worth reading —
              the quote, the pool, the floor — but with a lapsed oracle
              `maxSlippageBps` compares against a shortfall of zero whatever the
              pool pays, so nothing bounds this sale. The user may still want it;
              they may not discover it afterwards from a receipt reading 0 bps. */}
          {plan && !plan.signable.ok && (
            <div className="mb-4 rounded-lg border border-refuse/40 bg-refuse/6 px-4 py-3">
              <p className="text-[12.5px] leading-relaxed text-refuse">
                This sale would go out <strong>with no slippage protection</strong>.{' '}
                {plan.signable.reason}
              </p>
              <label className="mt-2 flex items-center gap-2 text-[12.5px] text-dim">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => {
                    setAck(e.target.checked);
                    if (e.target.checked) void check(true);
                  }}
                  className="accent-refuse"
                />
                Sell anyway. I accept that the mandate&apos;s slippage cap cannot apply
              </label>
            </div>
          )}

          {plan?.verdict.allow && plan.signable.ok && (
            <>
              <Legend>what you are about to sign</Legend>
              <ul className="mb-3 grid gap-0.5">
                {describePermit(
                  {
                    token: plan.leg.asset,
                    amount: BigInt(plan.leg.amountIn),
                    spender: plan.executor,
                    owner: address,
                    chainId: option.chain.id,
                  },
                  // The permit is built when you commit, moments from now, so
                  // this is the TTL it will carry rather than one already
                  // running.
                  BigInt(Math.floor(Date.now() / 1000) + PERMIT_TTL_SEC),
                  plan.symbol,
                  plan.decimals,
                ).map((line) => (
                  <li key={line} className="font-mono text-[12px] text-dim">
                    · {line}
                  </li>
                ))}
              </ul>

              <button
                onClick={sell}
                disabled={busy}
                className="w-full rounded-xl bg-ink px-4 py-3.5 text-[15px] font-semibold text-ground hover:opacity-90 disabled:opacity-30"
              >
                {phase.kind === 'approving'
                  ? `approving Permit2 for ${plan.symbol} in your wallet…`
                  : phase.kind === 'signing'
                    ? 'sign the permit in your wallet…'
                    : phase.kind === 'sending'
                      ? 'confirm the exit in your wallet…'
                      : phase.kind === 'mining'
                        ? 'mining…'
                        : phase.kind === 'confirming'
                          ? 'waiting for the chain to serve the balance…'
                          : 'sign & exit'}
              </button>
            </>
          )}

          {phase.kind === 'confirming' && (
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              Mined. The public RPC load-balances, so a confirmed write is not immediately
              readable. Polling until the balance moves rather than reporting a zero (D18).
            </p>
          )}

          {phase.kind === 'done' && (
            <div className="mt-4 rounded-lg border border-signal-deep bg-signal/6 px-4 py-3">
              {phase.received > 0n ? (
                <p className="text-[13px] text-ink">
                  Exited. <Num>{formatUnits(phase.received, phase.decimals)}</Num> USDG landed in
                  your own wallet, net of the execution fee. The executor held it only long enough
                  to split that fee off.
                </p>
              ) : (
                <p className="text-[13px] leading-relaxed text-ink">
                  Mined, and the USDG balance has not become readable within 15 seconds. The
                  transaction is below. Check it on the explorer rather than trusting a zero.
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

          <p className="mt-4 text-[12.5px] leading-relaxed text-ink">
            The permit here names the <em>asset</em> rather than USDG, so each xStock needs its own
            one-off Permit2 approval. The approval, the signature and the sending happen in your
            wallet.
          </p>
        </>
      )}
    </>
  );
}

/** The decision, laid out before anything is signed. */
function Plan({ plan }: { plan: WirePlan }) {
  return (
    <>
      <Legend>quote</Legend>
      <ul className="grid gap-0.5 font-mono text-[12px] tabular-nums">
        <Row label="sells">
          <Num>{formatUnits(BigInt(plan.units), plan.decimals)}</Num> {plan.symbol} for{' '}
          <Num>{formatUnits(BigInt(plan.quote.amountOut), plan.cashDecimals)}</Num> USDG
        </Row>
        <Row label="price">
          <Num>{e8(plan.predicted.executionPriceE8)}</Num>{' '}
          <span className="text-faint">
            per {plan.symbol}, gross of the execution fee · fee tier {plan.quote.feeTier} · pool{' '}
            {plan.quote.pool.slice(0, 10)}…, the one the executor derives
          </span>
        </Row>
        <Row label="floor">
          {formatUnits(BigInt(plan.leg.minAmountOutUsdg), plan.cashDecimals)} USDG{' '}
          <span className="text-faint">or the swap reverts</span>
        </Row>
        {plan.quote.considered.length > 1 && (
          <Row label="tiers">
            <span className="text-faint">
              {plan.quote.considered
                .map((c) => `${c.fee}: ${formatUnits(BigInt(c.out), plan.cashDecimals)}`)
                .join(' · ')}
            </span>
          </Row>
        )}
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
              withheld, the oracle will not defend a number for this asset
            </span>
          )}
        </Row>
        <Row label="shortfall">
          {plan.predicted.shortfallBps === null ? (
            <span className="text-faint">
              not measured. A value the oracle has stopped defending would compute a large false
              shortfall, and the mandate&apos;s slippage limit would then block the exit. The
              contract catches the same revert and does the same thing.
            </span>
          ) : (
            <>
              <Num tone={plan.predicted.shortfallBps > 100 ? 'caution' : undefined}>
                {plan.predicted.shortfallBps}
              </Num>{' '}
              <span className="text-faint">bps below fair value</span>
            </>
          )}
        </Row>
        {plan.oracle.stale && (
          <Row label="">
            <span className="text-caution">
              past the oracle&apos;s {plan.oracle.maxAgeSeconds}s freshness limit. On the way out
              that is a warning, not a refusal. Trapping an open position because the publisher
              stopped would be worse than letting it leave (D56). The floor above is the protection.
            </span>
          </Row>
        )}
      </ul>

      <Legend>verdict</Legend>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {plan.verdict.allow ? (
          <Pill tone="ok">ALLOW</Pill>
        ) : (
          <Pill tone="warn">REJECT · {plan.verdict.reason}</Pill>
        )}
        {plan.verdict.offendingAsset && (
          <span className="font-mono text-[11px] text-faint">on {plan.verdict.offendingAsset}</span>
        )}
      </div>
      {!plan.verdict.allow && (
        <p className="mb-2 text-[12px] leading-relaxed text-faint">
          Asked before any gas was spent. The same check runs inside the transaction, so exiting
          anyway would revert. This is the trip not taken, not a trip that failed.
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
                ? 'hashed but not archived, nothing was decided to happen here'
                : `not archived: ${plan.evidence.persistence.reason}. Download it below, or the hash on chain will point at nothing.`}
            </span>
          ) : plan.evidence.persistence.kind === 'blob' ? (
            <a
              href={plan.evidence.persistence.url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-faint hover:text-signal"
            >
              archived, anyone can fetch it and re-derive this hash
            </a>
          ) : (
            <span className="text-faint">
              written to {plan.evidence.persistence.path}. The hash binds, the file is how anyone
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
