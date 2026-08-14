/**
 * Everything that has to happen *before* a fill is signed, in one place.
 *
 * `src/execute.ts` has done this since the first mainnet fill, inline, as a Node
 * script holding a key. The browser needs the same work done — quote against
 * live pool state, check the pool the executor will actually derive, read the
 * oracle, predict the fill, ask the guard, assemble the evidence — and only then
 * hand the user something to sign. None of it can run in the browser: it needs
 * thousands of pool reads over a throttled RPC and a filesystem for the bundle.
 *
 * So it runs here, on the server, behind `POST /api/fill`, and the browser is
 * left with exactly the three things that must happen in the user's wallet: the
 * Permit2 approval, the signature, and the transaction. That split is the
 * non-custodial claim expressed as an architecture — this module never sees a
 * key, and what it returns is inert until the owner signs it.
 *
 * The two functions that mirror `Executor` are exported separately and are
 * pure. They were previously written out inside `execute.ts`; a second copy in
 * the API route would be a third place for the same arithmetic to drift from
 * the Solidity, and this arithmetic decides whether the guard rejects.
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
import { evidenceHash, type EvidenceBundle } from './evidence';
import { persistBundle, type Persistence } from './evidence-store';
import { bestQuote, loadVenues } from './planner';
import { loadToken } from './pool';
import { MAINNET } from './deployments';

export const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/** How far below the simulated output the swap may fill before it reverts. */
export const DEFAULT_SLIPPAGE_TOLERANCE_BPS = 100;

/**
 * Settlement paid per whole asset unit, at 8 decimals.
 *
 * Mirrors `Executor._priceE8`. If it differs from the Solidity, this is the copy
 * that is wrong — the same rule `src/guard.ts` follows for `checkExecution`.
 */
export function executionPriceE8(
  amountIn: bigint,
  amountOut: bigint,
  assetDecimals: number,
  cashDecimals: number,
): bigint {
  return (
    (amountIn * 10n ** BigInt(assetDecimals) * 100_000_000n) /
    (amountOut * 10n ** BigInt(cashDecimals))
  );
}

/**
 * How far above fair value the fill lands, in basis points.
 *
 * Mirrors `Executor._shortfallBps`: measured against the **oracle**, not against
 * the quote. Paying more than the market said is not the interesting failure;
 * paying more than the asset is worth is.
 */
export function shortfallBps(priceE8: bigint, fairValueE8: bigint, hasValue: boolean): number {
  if (!hasValue || fairValueE8 <= 0n || priceE8 <= fairValueE8) return 0;
  return Number(((priceE8 - fairValueE8) * 10_000n) / fairValueE8);
}

export interface FillRequest {
  asset: Address;
  /** Human decimal string, in the settlement currency. */
  amountUsdg: string;
  mandateId: bigint;
  /** The wallet that will sign the permit and send the transaction. */
  sender: Address;
  /** Zero when the fill claims no published reasoning. */
  thesisHash?: Hex;
  slippageToleranceBps?: number;
}

export interface FillPlan {
  chainId: number;
  executor: Address;
  guard: Address;
  cash: Address;
  cashDecimals: number;
  /** The one leg, in exactly the shape `Executor.execute` takes. */
  leg: { asset: Address; amountInUsdg: bigint; minAmountOut: bigint; fee: number };
  amountIn: bigint;
  symbol: string;
  decimals: number;
  quote: {
    /** Whole asset units the simulation returned. */
    out: number;
    amountOut: bigint;
    effectivePrice: number;
    impactBps: number;
    pool: Address;
    feeTier: number;
  };
  oracle: {
    fairValueE8: bigint;
    confidenceBps: number;
    gapRisk: number;
    capacityUsdg: bigint;
    updatedAt: number;
    ageSeconds: number;
    hasValue: boolean;
    /** The oracle's own freshness limit, in seconds. */
    maxAgeSeconds: number;
    /** Past that limit the guard refuses, whatever the value says. */
    stale: boolean;
  };
  predicted: { executionPriceE8: bigint; slippageBps: number };
  /**
   * The guard's own answer, asked before any gas is spent. A refusal is a
   * result, not an error — it is the product working, and it arrives with the
   * reason and the asset that caused it.
   */
  verdict: { allow: boolean; reason: string; offendingAsset: Address | null };
  thesis: { hash: Hex; id: number; publishedAt: number } | null;
  evidence: {
    hash: Hex;
    /** False when the runtime has no writable filesystem — the hash still binds. */
    /** Where the bundle actually went. `none` means nobody can audit this fill. */
    persistence: Persistence;
    bundle: EvidenceBundle;
  };
  mandate: { id: bigint; owner: Address; agent: Address; executor: Address; active: boolean };
}

/**
 * Quote, check, and assemble — but never sign and never send.
 *
 * Throws when the request cannot honestly be turned into a signable fill (no
 * pool, a quote that ran past its tick window, a mandate that is not this
 * sender's). It does **not** throw on a guard rejection: that is a verdict with
 * a reason, and the caller is expected to show it rather than treat it as a
 * failure.
 */
export async function prepareFill(req: FillRequest): Promise<FillPlan> {
  const deployment = MAINNET;
  if (!deployment) throw new Error('no mainnet deployment recorded in src/deployments.ts');

  const executor = deployment.contracts.Executor as Address;
  const guard = deployment.contracts.PolicyGuard as Address;
  const oracleAddress = deployment.contracts.FairValueOracle as Address;
  const thesisHash = (req.thesisHash ?? ZERO_HASH) as Hex;
  const tolerance = req.slippageToleranceBps ?? DEFAULT_SLIPPAGE_TOLERANCE_BPS;

  // The settlement currency is whatever the deployed executor was built with.
  // Asking the contract is the only answer that cannot drift from it.
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
  const amountIn = parseUnits(req.amountUsdg, cashDecimals);
  if (amountIn <= 0n) throw new Error('amount must be greater than zero');

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
        `It was created against an older deployment and cannot be filled through this one.`,
    );
  }
  // `Executor.execute` reverts with NotAgent for anyone else, so this would be a
  // guaranteed-failed transaction. Saying so here costs a read; finding out on
  // chain costs gas and a confusing error.
  if (mandate.agent.toLowerCase() !== req.sender.toLowerCase()) {
    throw new Error(
      `mandate #${req.mandateId} names ${mandate.agent} as its agent, and only that address can ` +
        `execute against it. This wallet is ${req.sender}.`,
    );
  }
  // And the owner, separately, because `Executor._pull` passes `m.owner` to
  // Permit2 as the signer and sends the bought asset there. A caller who is the
  // agent but not the owner would approve, sign, send — and revert on an
  // invalid signer, having paid gas to learn it. The CLI splits these two roles
  // across two keys; the browser has one wallet, so it must hold both.
  if (mandate.owner.toLowerCase() !== req.sender.toLowerCase()) {
    throw new Error(
      `mandate #${req.mandateId} is owned by ${mandate.owner}. The permit has to be signed by the ` +
        `owner — that is who Permit2 pulls from and who receives the asset — so this wallet ` +
        `(${req.sender}) cannot fill it, even as its agent.`,
    );
  }

  // ------------------------------------------------------------ the quote

  const venues = await loadVenues(req.asset);
  if (venues.length === 0) throw new Error('no USDG pool for this asset on X Layer');

  const quoted = bestQuote(venues, amountIn);
  if (!quoted) throw new Error('no venue could quote this size');

  // A simulation that ran past its prefetched tick window stopped early and
  // priced only the input it managed to consume, so a `minAmountOut` derived
  // from it protects nothing. Refuse the quote rather than ship it (D34).
  if (quoted.result.exhaustedWindow) {
    throw new Error(
      `the quote for ${req.amountUsdg} USDG ran past the prefetched tick window, so it is a ` +
        `lower bound rather than a price. Try a smaller size.`,
    );
  }

  const token = await loadToken(req.asset);
  const feeTier = quoted.venue.pool.fee;
  const minAmountOut = (quoted.result.amountOut * BigInt(10_000 - tolerance)) / 10_000n;

  // The executor derives the pool from (cash, asset, fee); we quoted a pool
  // found through the factory. They must be the same pool, or the fill happens
  // somewhere the quote never looked. This is the check that would have caught
  // D35 before it cost a transaction.
  const derivedPool = await client.readContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: 'poolFor',
    args: [cash, req.asset, feeTier],
  });
  if (derivedPool.toLowerCase() !== quoted.venue.pool.address.toLowerCase()) {
    throw new Error(
      `the executor would swap in ${derivedPool} but this quote came from ` +
        `${quoted.venue.pool.address}. Refusing to plan a fill against a pool we did not price.`,
    );
  }

  // ----------------------------------------------------------- the thesis

  let thesis: FillPlan['thesis'] = null;
  if (thesisHash !== ZERO_HASH) {
    const registry = deployment.contracts.ThesisRegistry as Address | undefined;
    if (!registry) throw new Error('a thesis hash was given but no ThesisRegistry is deployed');

    const [id, exists] = await client.readContract({
      address: registry,
      abi: THESIS_REGISTRY_ABI,
      functionName: 'idOf',
      args: [thesisHash],
    });
    // The receipt carries this hash forever. A hash that resolves to nothing
    // would look like evidence and be worse than an untethered fill.
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

  // `peek`, which returns the raw record and never reverts — `observation`
  // reverts on `Stale`, whatever the name suggests. Rendering must not throw
  // when the oracle is out of date: a stale value is a thing to *show*, and the
  // guard below is what refuses on it, with the reason.
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

  const priceE8 = executionPriceE8(
    amountIn,
    quoted.result.amountOut,
    token.decimals,
    cashDecimals,
  );
  const slippageBps = shortfallBps(priceE8, observation.fairValueE8, observation.hasValue);

  const [allow, rawReason, offending] = await client.readContract({
    address: guard,
    abi: POLICY_GUARD_ABI,
    functionName: 'dryRun',
    args: [
      req.mandateId,
      [
        {
          asset: req.asset,
          isExit: false,
          amountInUsdg: amountIn,
          amountOut: quoted.result.amountOut,
          executionPriceE8: priceE8,
          slippageBps,
          // The guard stamps these from the oracle itself; passing our own read
          // would be asking it to check our arithmetic rather than its own.
          fairValueE8: 0n,
          gapRisk: 0,
        },
      ],
    ],
  });

  const reason = allow ? 'ALLOW' : hexToString(rawReason).replace(/\0+$/, '');
  const decidedAt = Math.floor(Date.now() / 1000);
  const ageSeconds = Math.max(0, decidedAt - Number(observation.updatedAt));

  // ---------------------------------------------------------- the evidence

  // Assembled from the numbers this decision actually used, and hashed *before*
  // anything is signed. Recording it afterwards from the receipt would prove
  // nothing — the interesting claim is what was known beforehand (D57).
  const bundle: EvidenceBundle = {
    kind: 'entry',
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
        amountIn: amountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        feeTier,
        simulatedOut: quoted.out.toString(),
        impactBps: quoted.impactBps,
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
  };

  // The hash is what binds; the file is only how someone checks it. A serverless
  // runtime has no writable filesystem, so the write is attempted and its
  // failure reported rather than raised — the alternative is refusing to fill
  // because we could not save a copy of our own reasoning.
  //
  // Only written when the guard allows. A rejected plan will never be signed,
  // and `evidence/` is the record of fills that happened — filling it with
  // bundles for trades nobody made would make the directory worth less, not
  // more. The hash is returned either way.
  const hash = evidenceHash(bundle);
  const persistence: Persistence = allow
    ? await persistBundle(bundle)
    : { kind: 'none', reason: 'the guard refused this fill, so no bundle was archived' };

  return {
    chainId: deployment.chainId,
    executor,
    guard,
    cash,
    cashDecimals: Number(cashDecimals),
    leg: { asset: req.asset, amountInUsdg: amountIn, minAmountOut, fee: feeTier },
    amountIn,
    symbol: token.symbol,
    decimals: token.decimals,
    quote: {
      out: quoted.out,
      amountOut: quoted.result.amountOut,
      effectivePrice: quoted.effectivePrice,
      impactBps: quoted.impactBps,
      pool: derivedPool,
      feeTier,
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
      stale: Number(observation.updatedAt) === 0 || ageSeconds > Number(maxAge),
    },
    predicted: { executionPriceE8: priceE8, slippageBps },
    verdict: { allow, reason, offendingAsset: allow ? null : offending },
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
