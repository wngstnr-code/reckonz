/**
 * Everything that has to happen *before* an exit is signed, in one place.
 *
 * The mirror of `src/fill.ts`, and it exists for the same reason that one did:
 * `src/exit.ts` could sell a position, but only as a Node script holding a
 * private key. A user could enter from the browser and had to open a terminal to
 * leave — which is a strange shape for a product whose claim is risk tooling.
 *
 * The split of work is identical, and it is the security argument rather than a
 * detail: this module quotes against live pool state, checks the pool the
 * executor will actually derive, reads the oracle, predicts the fill, asks
 * `PolicyGuard.dryRun` and hashes the evidence. It holds no key, and what it
 * returns is inert until the owner signs it in their own wallet.
 *
 * ## Three things differ from the entry path, and all three are the direction
 *
 *  - **The Permit2 authorisation is over the asset, not the cash.** The owner
 *    must have approved Permit2 for the token being sold. `Executor._pullAssets`
 *    checks the permitted token index-for-index with the legs.
 *  - **Shortfall is measured below fair value.** Selling badly means receiving
 *    less; the entry path's comparison would report zero for every sale under
 *    fair value. `Executor._exitShortfallBps` inverts it, and so does
 *    `exitShortfallBps` here.
 *  - **Size comes from the position, not from a dollar target.** `pnpm exit`
 *    converts a USDG target into units through the oracle's fair value, which
 *    means an oracle that is stale or silent decides how much you may sell — the
 *    D51 trap in a different costume. The browser knows the wallet balance, so
 *    the caller names units and the oracle is left doing the one job it has:
 *    telling the guard whether the price is defensible.
 */
import { hexToString, parseUnits, type Address, type Hex } from 'viem';
import {
  ERC20_ABI,
  EXECUTOR_ABI,
  FAIR_VALUE_ORACLE_ABI,
  POLICY_GUARD_ABI,
  THESIS_REGISTRY_ABI,
} from './abi';
import { client } from './chain';
import { MAINNET } from './deployments';
import { evidenceHash, type EvidenceBundle } from './evidence';
import { persistBundle, type Persistence } from './evidence-store';
import { executionPriceE8, DEFAULT_SLIPPAGE_TOLERANCE_BPS, ZERO_HASH } from './fill';
import { findAllPools, loadPool, loadToken, simulateExactInput } from './pool';

/**
 * How far *below* fair value the sale lands, in basis points.
 *
 * Mirrors `Executor._exitShortfallBps`, including the part that looks like a
 * missing check: a stale or absent observation yields **zero**, not a large
 * number. The contract reads through `observation`, which reverts on `Stale` and
 * `NoData`, and catches it. Measuring against a value the oracle refuses to
 * stand behind would compute an enormous false shortfall — and `maxSlippageBps`
 * would then block the exit, which is the D51 trap rebuilt one layer down.
 *
 * `pnpm exit` measures against `peek` unconditionally and so can talk itself out
 * of an exit the chain would have allowed. This is the copy that matches the
 * Solidity; if they ever differ, this one is wrong.
 */
export function exitShortfallBps(
  priceE8: bigint,
  fairValueE8: bigint,
  hasValue: boolean,
  stale: boolean,
): number {
  if (stale || !hasValue || fairValueE8 <= 0n || priceE8 >= fairValueE8) return 0;
  const bps = ((fairValueE8 - priceE8) * 10_000n) / fairValueE8;
  return bps > 65_535n ? 65_535 : Number(bps);
}

/**
 * Whether that zero is a measurement or the absence of one.
 *
 * The function above must keep returning `0` — it mirrors the Solidity, and a
 * mirror that disagrees with the contract is worse than no mirror (CLAUDE.md).
 * But **zero has two meanings there**, and only one of them is a fact:
 *
 *   - the sale landed at or above fair value — measured, and good news
 *   - nothing measured it — the oracle is stale or silent, so `maxSlippageBps`
 *     has nothing to compare against and cannot block anything
 *
 * Receipt #16 is the second kind: `slippageBps: 0`, `fairValueE8: 0`, an oracle
 * 158,738 seconds old. Rendered as a number it reads as a **flawless exit**,
 * which is the most flattering possible description of the one case where no
 * protection was applied at all. That is the same defect class as D71's wrong
 * comparator: not a wrong number, a true number carrying a false meaning.
 *
 * So callers get the status alongside the number, and everything that displays
 * a shortfall must render `null` rather than `0` when it is `unmeasured`.
 */
export type ShortfallStatus = 'measured' | 'unmeasured-stale' | 'unmeasured-no-value';

export function shortfallStatus(hasValue: boolean, stale: boolean): ShortfallStatus {
  if (!hasValue) return 'unmeasured-no-value';
  if (stale) return 'unmeasured-stale';
  return 'measured';
}

/** One sentence, for a terminal or a panel. */
export function describeShortfallStatus(status: ShortfallStatus): string {
  switch (status) {
    case 'measured':
      return 'measured against a fair value the oracle is standing behind';
    case 'unmeasured-stale':
      return 'not measured: the oracle is past its freshness limit, so the mandate’s slippage cap has nothing to compare against and will not block this sale';
    case 'unmeasured-no-value':
      return 'not measured: the oracle is publishing no value for this asset, so the mandate’s slippage cap cannot apply';
  }
}

export interface ExitRequest {
  asset: Address;
  /** Human decimal string, in the **asset's** own units — not a dollar target. */
  units: string;
  mandateId: bigint;
  /**
   * The owner: who signs the permit, who Permit2 pulls the asset from, and who
   * receives the proceeds.
   */
  sender: Address;
  /**
   * Who sends the transaction, when that is not the owner. Defaults to `sender`,
   * which is the browser's case — one wallet holding both roles. The CLI can
   * split them across `OWNER_KEY` and `AGENT_KEY`, and `Executor.exit` checks
   * `msg.sender` against the mandate's agent while Permit2 checks the signature
   * against its owner, so the two are genuinely different questions.
   */
  agent?: Address;
  /** Zero when the exit claims no published reasoning. */
  thesisHash?: Hex;
  slippageToleranceBps?: number;
  /**
   * Consent to sell with no slippage protection.
   *
   * Required only when the shortfall cannot be measured. Without it the plan
   * still comes back — the user is entitled to see the quote, the pool and the
   * oracle's age before deciding — but it is marked unsignable, no evidence file
   * is written for it, and the callers refuse to hand it to a wallet.
   *
   * Deliberately not a default: an exit the guard cannot bound is a normal thing
   * to want when the oracle has lapsed, and an abnormal thing to do by accident.
   */
  acknowledgeUnmeasured?: boolean;
}

export interface ExitPlan {
  chainId: number;
  executor: Address;
  guard: Address;
  cash: Address;
  cashDecimals: number;
  /** The one leg, in exactly the shape `Executor.exit` takes. */
  leg: { asset: Address; amountIn: bigint; minAmountOutUsdg: bigint; fee: number };
  symbol: string;
  decimals: number;
  /** Units of the asset being sold, and what the wallet holds of it. */
  units: bigint;
  held: bigint;
  quote: {
    /** Settlement currency the simulation returned, gross of the execution fee. */
    amountOut: bigint;
    effectivePrice: number;
    pool: Address;
    feeTier: number;
    /** Every tier that could absorb the sale, so a user can see what was rejected. */
    considered: { fee: number; out: bigint }[];
  };
  oracle: {
    fairValueE8: bigint;
    confidenceBps: number;
    gapRisk: number;
    capacityUsdg: bigint;
    updatedAt: number;
    ageSeconds: number;
    hasValue: boolean;
    maxAgeSeconds: number;
    /**
     * Past the oracle's freshness limit. On the way *out* this is a warning and
     * not a refusal — since D56 the guard does not run `checkExecution` on an
     * exit, because an unpublished oracle trapping every open position is worse
     * than one that merely pauses new ones.
     */
    stale: boolean;
  };
  predicted: {
    executionPriceE8: bigint;
    /**
     * How far below fair value the sale lands — **`null` when nothing measured
     * it**. Never render a zero here; see `shortfallStatus`.
     */
    shortfallBps: number | null;
    status: ShortfallStatus;
    /**
     * What `Executor._exitShortfallBps` will compute and `PolicyGuard` will
     * check. Always a number, and zero in exactly the cases the contract's is.
     * Kept separate from the field above because one is what the chain does and
     * the other is what is true, and conflating them is the whole defect.
     */
    guardSlippageBps: number;
  };
  verdict: { allow: boolean; reason: string; offendingAsset: Address | null };
  /**
   * Whether this plan may be handed to a wallet. False only when the shortfall
   * is unmeasured and the caller did not acknowledge it — a refusal by us, not
   * by the guard, which is why it is separate from `verdict`.
   */
  signable: { ok: boolean; reason: string | null };
  thesis: { hash: Hex; id: number; publishedAt: number } | null;
  evidence: { hash: Hex; persistence: Persistence; bundle: EvidenceBundle };
  mandate: { id: bigint; owner: Address; agent: Address; executor: Address; active: boolean };
}

/**
 * Quote, check, and assemble — but never sign and never send.
 *
 * Throws when the request cannot honestly be turned into a signable exit: units
 * the wallet does not hold, no pool, a mandate that is not this sender's. It
 * does **not** throw on a guard rejection — that is a verdict with a reason, and
 * the caller is expected to show it.
 */
export async function prepareExit(req: ExitRequest): Promise<ExitPlan> {
  const deployment = MAINNET;
  if (!deployment) throw new Error('no mainnet deployment recorded in src/deployments.ts');

  const executor = deployment.contracts.Executor as Address;
  const guard = deployment.contracts.PolicyGuard as Address;
  const oracleAddress = deployment.contracts.FairValueOracle as Address;
  const thesisHash = (req.thesisHash ?? ZERO_HASH) as Hex;
  const tolerance = req.slippageToleranceBps ?? DEFAULT_SLIPPAGE_TOLERANCE_BPS;

  // The settlement currency the deployed executor was built with. Asking the
  // contract is the only answer that cannot drift from it.
  const cash = await client.readContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: 'cash',
  });
  const cashDecimals = await client.readContract({
    address: cash,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });

  const token = await loadToken(req.asset);
  const units = parseUnits(req.units, token.decimals);
  if (units <= 0n) throw new Error('the size must be greater than zero');

  // ---------------------------------------------------------- the mandate

  const mandate = await client.readContract({
    address: guard,
    abi: POLICY_GUARD_ABI,
    functionName: 'getMandate',
    args: [req.mandateId],
  });

  if (!mandate.active) throw new Error(`mandate #${req.mandateId} is closed`);
  if (mandate.executor.toLowerCase() !== executor.toLowerCase()) {
    throw new Error(
      `mandate #${req.mandateId} points at executor ${mandate.executor}, not ${executor}. ` +
        `It was created against an older deployment and cannot be exited through this one.`,
    );
  }
  // `Executor.exit` reverts with NotAgent for anyone else, so this would be a
  // guaranteed-failed transaction. Checked against whoever will actually send
  // it, which is the owner unless the caller said otherwise.
  const agent = req.agent ?? req.sender;
  if (mandate.agent.toLowerCase() !== agent.toLowerCase()) {
    throw new Error(
      `mandate #${req.mandateId} names ${mandate.agent} as its agent, and only that address can ` +
        `exit against it. This one is ${agent}.`,
    );
  }
  // And the owner, separately: `_pullAssets` passes `m.owner` to Permit2 as the
  // signer and sends the proceeds there. Signing with anything else approves,
  // sends, and reverts on an invalid signer, having paid gas to learn it.
  if (mandate.owner.toLowerCase() !== req.sender.toLowerCase()) {
    throw new Error(
      `mandate #${req.mandateId} is owned by ${mandate.owner}. The permit has to be signed by the ` +
        `owner, which is who Permit2 pulls the asset from and who receives the proceeds, so ` +
        `this wallet (${req.sender}) cannot exit it, even as its agent.`,
    );
  }

  // Permit2 authorises a pull; it does not create the balance. A permit for
  // units that are not there is a signature the user reads, approves, and
  // watches revert.
  const held = await client.readContract({
    address: req.asset,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [req.sender],
  });
  if (held < units) {
    throw new Error(
      `this wallet holds ${held} units of ${token.symbol} and the exit would sell ${units}. ` +
        `Permit2 authorises a pull, it does not create the balance.`,
    );
  }

  // ------------------------------------------- the quote, in the sell direction

  const candidates = await findAllPools(req.asset, cash);
  if (candidates.length === 0) {
    throw new Error(`no ${token.symbol}/USDG pool on X Layer to sell into`);
  }

  const considered: { fee: number; out: bigint }[] = [];
  let best: { fee: number; out: bigint; pool: Address } | null = null;
  // Serial: the public RPC throttles, and each `loadPool` is a burst of reads.
  for (const candidate of candidates) {
    const pool = await loadPool(candidate.address);
    // The asset is the *input* here. `zeroForOne` is true when the input token
    // sorts first, which is exactly how `V3Swapper` derives it.
    const zeroForOne = pool.token0.address.toLowerCase() === req.asset.toLowerCase();
    const result = simulateExactInput(pool, units, zeroForOne);
    // A simulation that ran past its prefetched tick window stopped early and
    // priced only the input it managed to consume, so a floor derived from it
    // protects nothing (D34). Drop the tier rather than quote a lower bound as
    // if it were a price.
    if (result.exhaustedWindow) continue;
    const out = result.amountOut < 0n ? -result.amountOut : result.amountOut;
    considered.push({ fee: candidate.fee, out });
    if (out > 0n && (best === null || out > best.out)) {
      best = { fee: candidate.fee, out, pool: candidate.address };
    }
  }

  if (!best) {
    throw new Error(
      `no ${token.symbol}/USDG pool could absorb this size without running past the tick window ` +
        `the quote prefetched. Sell less.`,
    );
  }

  // The executor derives the pool from (asset, cash, fee); we quoted one found
  // through the factory. They must be the same pool, or the sale happens
  // somewhere the quote never looked — the check that would have caught D35
  // before it cost a transaction.
  const derivedPool = await client.readContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: 'poolFor',
    args: [req.asset, cash, best.fee],
  });
  if (derivedPool.toLowerCase() !== best.pool.toLowerCase()) {
    throw new Error(
      `the executor would swap in ${derivedPool} but this quote came from ${best.pool}. ` +
        `Refusing to plan an exit against a pool we did not price.`,
    );
  }

  const minAmountOutUsdg = (best.out * BigInt(10_000 - tolerance)) / 10_000n;

  // ----------------------------------------------------------- the thesis

  let thesis: ExitPlan['thesis'] = null;
  if (thesisHash !== ZERO_HASH) {
    const registry = deployment.contracts.ThesisRegistry as Address | undefined;
    if (!registry) throw new Error('a thesis hash was given but no ThesisRegistry is deployed');

    const [id, exists] = await client.readContract({
      address: registry,
      abi: THESIS_REGISTRY_ABI,
      functionName: 'idOf',
      args: [thesisHash],
    });
    if (!exists) throw new Error(`thesis ${thesisHash} is not published on ${deployment.name}`);

    const published = await client.readContract({
      address: registry,
      abi: THESIS_REGISTRY_ABI,
      functionName: 'get',
      args: [id],
    });
    thesis = { hash: thesisHash, id: Number(id), publishedAt: Number(published.publishedAt) };
  }

  // ------------------------------------------- predict it, then ask the guard

  // `peek`, which never reverts — `observation` throws on `Stale`, whatever the
  // names suggest (D64). A stale value on the way out is a thing to *show*: it
  // no longer blocks the exit, and the user is entitled to know the number in
  // front of them is one the oracle has stopped defending.
  const [observation, maxAge] = await Promise.all([
    client.readContract({
      address: oracleAddress,
      abi: FAIR_VALUE_ORACLE_ABI,
      functionName: 'peek',
      args: [req.asset],
    }),
    client.readContract({
      address: oracleAddress,
      abi: FAIR_VALUE_ORACLE_ABI,
      functionName: 'maxAge',
    }),
  ]);

  const decidedAt = Math.floor(Date.now() / 1000);
  const ageSeconds = Math.max(0, decidedAt - Number(observation.updatedAt));
  const stale = Number(observation.updatedAt) === 0 || ageSeconds > Number(maxAge);

  // Settlement paid per whole asset unit. The roles of the two amounts swap on
  // an exit — the cash is what comes out — and the arithmetic is otherwise the
  // entry path's, because `Executor._priceE8` is the same function on both
  // sides. Gross of the execution fee, matching `_exitSwap`: the fee never
  // reaches a pool, so folding it in would describe a price no pool quoted.
  const priceE8 = executionPriceE8(best.out, units, token.decimals, Number(cashDecimals));
  const guardSlippageBps = exitShortfallBps(
    priceE8,
    observation.fairValueE8,
    observation.hasValue,
    stale,
  );
  const status = shortfallStatus(observation.hasValue, stale);
  const measured = status === 'measured';
  // The number that goes to the chain is the mirror's, always. The number shown
  // is null when nothing measured it, so no caller can print a zero that means
  // "unprotected" in a column headed "slippage".
  const shortfallBps = measured ? guardSlippageBps : null;
  const signable = measured || req.acknowledgeUnmeasured === true;

  const [allow, rawReason, offending] = await client.readContract({
    address: guard,
    abi: POLICY_GUARD_ABI,
    functionName: 'dryRun',
    args: [
      req.mandateId,
      [
        {
          asset: req.asset,
          isExit: true,
          // Named for the entry path and used in reverse, exactly as
          // `_exitSwap` fills them in: the cash is what comes out, and
          // `amountOut` carries the units sold, which is what the position
          // accounting subtracts.
          amountInUsdg: best.out,
          amountOut: units,
          executionPriceE8: priceE8,
          slippageBps: guardSlippageBps,
          // Stamped by the guard from the oracle. Passing our own read would be
          // asking it to check our arithmetic rather than its own.
          fairValueE8: 0n,
          gapRisk: 0,
        },
      ],
    ],
  });

  const reason = allow ? 'ALLOW' : hexToString(rawReason).replace(/\0+$/, '');

  // ---------------------------------------------------------- the evidence

  // The exit's bundle records the one thing that matters most on the way out:
  // how old the oracle's view was when the decision was taken. Since D56 a stale
  // value no longer blocks an exit, so the age is no longer implied by the fill
  // having happened — it has to be written down (D57).
  const bundle: EvidenceBundle = {
    kind: 'exit',
    chainId: deployment.chainId,
    decidedAt,
    mandateId: req.mandateId.toString(),
    executor,
    guard,
    thesisHash,
    legs: [
      {
        asset: req.asset,
        symbol: token.symbol,
        amountIn: units.toString(),
        minAmountOut: minAmountOutUsdg.toString(),
        feeTier: best.fee,
        simulatedOut: best.out.toString(),
        // Price impact is an entry-path measurement against a notional in cash.
        // `pnpm exit` records null here and so does this.
        impactBps: null,
      },
    ],
    observations: [
      {
        asset: req.asset,
        fairValueE8: observation.fairValueE8.toString(),
        confidenceBps: Number(observation.confidenceBps),
        gapRisk: Number(observation.gapRisk),
        capacityUsdg: observation.capacityUsdg.toString(),
        updatedAt: Number(observation.updatedAt),
        ageSeconds,
        hasValue: observation.hasValue,
      },
    ],
    dryRun: { ok: allow, reason, offendingAsset: allow ? null : offending },
    // Present only on an exit nothing could measure, and only once the seller
    // said so. It records the decision rather than the condition: `ageSeconds`
    // above already proves the oracle had lapsed, and what this adds is that the
    // sale went ahead knowing the slippage cap could not apply. Absent fields
    // are dropped by `canonicalise`, so a measured exit hashes exactly as before.
    shortfall: measured ? undefined : { status, acknowledged: signable },
  };

  // The hash is what binds; the file is only how someone checks it. Written at
  // plan time, before anything is signed, for the same reason the entry path
  // does it: `evidence/` holds the plans that could be signed, not the sales
  // that settled. A guard rejection is left out because its hash never reaches
  // the chain, so no append-only receipt anchors it — see `src/fill.ts`.
  //
  // `signable` is the extra condition this path carries. An unacknowledged
  // unmeasured exit is a plan the caller is being shown, not one that can
  // happen: we refuse it on our side before the guard is ever the constraint,
  // so its bundle would name a sale that had no route to the wallet at all.
  const hash = evidenceHash(bundle);
  const persistence: Persistence =
    allow && signable
      ? await persistBundle(bundle)
      : {
          kind: 'none',
          reason: allow
            ? 'unacknowledged unmeasured exit: this plan cannot be signed, so nothing was archived'
            : 'the guard refused this exit, so no bundle was archived',
        };

  return {
    chainId: deployment.chainId,
    executor,
    guard,
    cash,
    cashDecimals: Number(cashDecimals),
    leg: { asset: req.asset, amountIn: units, minAmountOutUsdg, fee: best.fee },
    symbol: token.symbol,
    decimals: token.decimals,
    units,
    held,
    quote: {
      amountOut: best.out,
      effectivePrice: Number(priceE8) / 1e8,
      pool: derivedPool,
      feeTier: best.fee,
      considered,
    },
    oracle: {
      fairValueE8: observation.fairValueE8,
      confidenceBps: Number(observation.confidenceBps),
      gapRisk: Number(observation.gapRisk),
      capacityUsdg: observation.capacityUsdg,
      updatedAt: Number(observation.updatedAt),
      ageSeconds,
      hasValue: observation.hasValue,
      maxAgeSeconds: Number(maxAge),
      stale,
    },
    predicted: { executionPriceE8: priceE8, shortfallBps, status, guardSlippageBps },
    verdict: { allow, reason, offendingAsset: allow ? null : offending },
    signable: {
      ok: signable,
      reason: signable
        ? null
        : `the shortfall is ${describeShortfallStatus(status)}. Acknowledge that to sell anyway.`,
    },
    thesis,
    evidence: { hash, persistence, bundle },
    mandate: {
      id: req.mandateId,
      owner: mandate.owner,
      agent: mandate.agent,
      executor: mandate.executor,
      active: mandate.active,
    },
  };
}
