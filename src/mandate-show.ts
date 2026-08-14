/**
 * Everything a mandate owner should be able to see about their own mandate.
 *
 * `getPosition` and `getTriggers` existed since the guard was written and
 * nothing ever read them (D52): `pnpm mandate` printed the triggers once, at
 * creation, and never again. A user could not answer "what am I holding and
 * what rules are bounding it" without writing their own script.
 *
 * Read-only. This file never sends a transaction — that is `mandate-edit.ts`,
 * and the split is deliberate so a typo here cannot cost anything.
 *
 *   TARGET=mainnet pnpm mandate:show 3
 *   TARGET=mainnet pnpm mandate:show          # every mandate this key owns
 */
import { erc20Abi, formatUnits, type Address } from 'viem';
import { POLICY_GUARD_ABI, RECEIPT_REGISTRY_ABI } from './abi';
import { USDG } from './chain';
import { loadToken } from './pool';
import { describeOnchainTrigger } from './triggers';
import { accountFrom, chainFor, deploymentFor, target, walletFor } from './wallet';

const ARG = process.argv[2];
if (ARG !== undefined && !/^\d+$/.test(ARG)) {
  console.error('usage: TARGET=mainnet pnpm mandate:show [mandateId]');
  process.exit(1);
}

const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const GUARD = deployment.contracts.PolicyGuard as Address;

const owner = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(owner, t);

console.log(`\n  PolicyGuard ${GUARD}  (${deployment.name}, chain ${chain.id})`);
console.log(`  reading as  ${owner.address}\n`);

const nextId = await wallet.readContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'nextMandateId',
});

const ids = ARG
  ? [BigInt(ARG)]
  : Array.from({ length: Number(nextId) - 1 }, (_, i) => BigInt(i + 1));

let shown = 0;
for (const id of ids) {
  const m = await wallet.readContract({
    address: GUARD,
    abi: POLICY_GUARD_ABI,
    functionName: 'getMandate',
    args: [id],
  });

  if (m.owner === '0x0000000000000000000000000000000000000000') {
    if (ARG) {
      console.error(`  mandate #${id} does not exist on this guard.\n`);
      process.exit(1);
    }
    continue;
  }
  // Without an explicit id this lists only what the caller owns — a guard holds
  // everyone's mandates, and printing strangers' policies by default is not a
  // default worth having.
  if (!ARG && m.owner.toLowerCase() !== owner.address.toLowerCase()) continue;
  shown++;

  const yours = m.owner.toLowerCase() === owner.address.toLowerCase();
  console.log(`  ── mandate #${id}${yours ? '' : '   (not yours — read only)'}`);
  console.log(`     owner     ${m.owner}`);
  console.log(`     agent     ${m.agent}`);
  console.log(`     executor  ${m.executor}`);
  console.log(
    `     state     ${m.active ? 'active' : 'CLOSED'}` +
      `${m.circuitBreaker ? '  ⛔ BREAKER TRIPPED — nothing can execute, exits included' : ''}`,
  );
  console.log(`     version   ${m.version}   fills this epoch ${m.fillsThisEpoch}/${m.policy.maxFillsPerEpoch}`);

  const p = m.policy;
  console.log(`\n     policy`);
  console.log(`       max per trade      ${formatUnits(p.maxNotionalPerTrade, USDG.decimals)} ${USDG.symbol}`);
  console.log(`       max slippage       ${p.maxSlippageBps} bps`);
  console.log(`       max off fair value ${p.maxDeviationBps} bps`);
  console.log(`       max gap risk       ${p.maxGapRisk}`);
  console.log(`       max weight         ${p.maxWeightBps} bps${p.enforceWeights ? '' : '  (not enforced)'}`);
  console.log(`       min cash buffer    ${p.minCashBufferBps} bps${p.enforceWeights ? '' : '  (not enforced)'}`);
  console.log(`       epoch              ${p.epochDuration}s, min rebalance ${p.minRebalanceInterval}s`);

  const allowed = await wallet.readContract({
    address: GUARD,
    abi: POLICY_GUARD_ABI,
    functionName: 'allowedAssets',
    args: [id],
  });

  const symbolOf = new Map<string, string>();
  console.log(`\n     allowed assets (${allowed.length}) and positions`);
  for (const asset of allowed) {
    const token = await loadToken(asset);
    symbolOf.set(asset.toLowerCase(), token.symbol);

    const [isAllowed, position, held] = await Promise.all([
      wallet.readContract({
        address: GUARD,
        abi: POLICY_GUARD_ABI,
        functionName: 'isAllowedAsset',
        args: [id, asset],
      }),
      wallet.readContract({
        address: GUARD,
        abi: POLICY_GUARD_ABI,
        functionName: 'getPosition',
        args: [id, asset],
      }),
      wallet.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [m.owner],
      }),
    ]);

    // The position is what the guard *recorded*; the balance is what the wallet
    // *holds*. They diverge whenever an asset was traded under another mandate,
    // which is normal and worth showing rather than reconciling away.
    console.log(
      `       ${token.symbol.padEnd(8)} ${isAllowed ? 'allowed  ' : 'DISALLOWED'}` +
        `  position ${formatUnits(position.units, token.decimals)}` +
        `  wallet ${formatUnits(held, token.decimals)}` +
        (position.costBasisE8 > 0n ? `  basis ${formatUnits(position.costBasisE8, 8)}` : ''),
    );
  }

  const triggers = await wallet.readContract({
    address: GUARD,
    abi: POLICY_GUARD_ABI,
    functionName: 'getTriggers',
    args: [id],
  });

  console.log(`\n     exit triggers (${triggers.length})`);
  if (triggers.length === 0) {
    console.log(`       none — nothing will ever tell this mandate to leave a position.`);
  }
  triggers.forEach((trigger, i) => {
    console.log(
      `       ${i}. ${describeOnchainTrigger(
        {
          metric: Number(trigger.metric),
          comparator: Number(trigger.comparator),
          threshold: trigger.threshold,
          assets: [...trigger.assets],
        },
        symbolOf,
      )}`,
    );
  });

  const [firedIdx, firingAssets, staleAssets] = await wallet.readContract({
    address: GUARD,
    abi: POLICY_GUARD_ABI,
    functionName: 'firedTriggers',
    args: [id],
  });

  if (firedIdx.length > 0) {
    console.log(`\n     ⚠ firing now: trigger ${firedIdx.join(', ')}`);
    console.log(`       assets ${firingAssets.map((a) => symbolOf.get(a.toLowerCase()) ?? a).join(', ')}`);
    console.log(`       Entries into these are refused. Exits are not — that is the point.`);
  } else {
    console.log(`\n     nothing firing`);
  }
  if (staleAssets.length > 0) {
    console.log(
      `     ⚠ oracle stale for ${staleAssets
        .map((a) => symbolOf.get(a.toLowerCase()) ?? a)
        .join(', ')} — entries into these are refused; exits are not (D56)`,
    );
    // The line above used to say a stale value blocked exits too, which was
    // true when it was written and stopped being true with D56: the guard no
    // longer runs `checkExecution` on the way out, precisely so an unpublished
    // oracle cannot trap an open position. Verified against mainnet mandate #1
    // on 2026-08-14 — `dryRun` allowed a wTSLAx exit with the value 43h stale.
  }

  await showHistory(id, symbolOf, Number(m.version));
  console.log();
}

/**
 * What this mandate actually did — the half `mandate:show` never had.
 *
 * `receiptsOf` and `performance` were deployed, correct, and had never been
 * called by anything in this repo. A view nobody reads is a view nobody has
 * verified: the same argument D35 makes about the Universal Router, one layer
 * down and far less costly to settle. Both were checked against a full scan of
 * the registry on mainnet on 2026-08-14 and agreed exactly.
 *
 * ## `receiptsOf` answers by **id**, not by mandate
 *
 * `ReceiptRegistry` is *kept* across every migration — that is the point of it,
 * one append-only history — while `PolicyGuard` has been redeployed twice. Each
 * new guard starts its ids at 1, so "mandate #1" names a different mandate on
 * each of them and they all write to this registry. On mainnet today
 * `receiptsOf(1)` returns 16 receipts of which **three belong to a previous
 * guard's** mandate #1, and there are two more under a mandate #3 that no
 * deployed guard has ever had.
 *
 * There is no stored field naming the guard, so this cannot be resolved
 * exactly. What can be proved is one direction: a mandate can never have
 * written a receipt at a policy version **above its own**, because the version
 * only ever increases and only on this guard. Anything above is foreign with
 * certainty; anything at or below is merely unproven, and saying which is which
 * is better than implying the whole list is this mandate's (D72).
 */
async function showHistory(id: bigint, symbolOf: Map<string, string>, version: number) {
  const registry = deployment.contracts.ReceiptRegistry as Address | undefined;
  if (!registry) return;

  // One call instead of walking `count()` and filtering — which is the whole
  // point of the view, and why the scan below is over this mandate's ids only.
  const ids = await wallet.readContract({
    address: registry,
    abi: RECEIPT_REGISTRY_ABI,
    functionName: 'receiptsOf',
    args: [id],
  });

  if (ids.length === 0) {
    console.log(`\n     receipts (0) — nothing has ever executed under mandate id ${id}.`);
    return;
  }

  const records = [];
  for (const receiptId of ids) {
    const [receipt, fills] = await wallet.readContract({
      address: registry,
      abi: RECEIPT_REGISTRY_ABI,
      functionName: 'get',
      args: [receiptId],
    });
    records.push({ receiptId, receipt, fills, foreign: receipt.policyVersion > version });
  }

  const foreign = records.filter((r) => r.foreign).length;
  console.log(`\n     receipts (${ids.length} under mandate id ${id})`);
  if (foreign > 0) {
    console.log(
      `       ⚠ ${foreign} marked ‡ were written at a policy version above this mandate's` +
        ` (v${version}),\n         so they belong to an earlier guard's mandate ${id}. The registry is kept` +
        `\n         across migrations and ids restart, so this view answers by id.`,
    );
  }

  const SHOWN = 8;
  const recent = records.slice(-SHOWN);
  if (records.length > SHOWN) {
    console.log(`       … ${records.length - SHOWN} older, not shown`);
  }
  for (const { receiptId, receipt, fills, foreign: isForeign } of recent) {
    const when = new Date(Number(receipt.timestamp) * 1000).toISOString().slice(0, 16).replace('T', ' ');
    const legs = fills
      .map((f) => {
        const symbol = symbolOf.get(f.asset.toLowerCase()) ?? f.asset.slice(0, 8);
        // The sign is the direction, and on an exit `amountInUsdg` is the cash
        // that came *back* rather than the cash that went out.
        return `${f.isExit ? '-' : '+'}${symbol} ${formatUnits(f.amountInUsdg, USDG.decimals)}`;
      })
      .join(', ');
    console.log(`       #${String(receiptId).padStart(3)}${isForeign ? '‡' : ' '} ${when}Z  ${legs}`);
  }

  const [notional, slippageBps, fillCount] = await wallet.readContract({
    address: registry,
    abi: RECEIPT_REGISTRY_ABI,
    functionName: 'performance',
    args: [id],
  });

  // `performance` sums **every** fill under this id — exits included, and other
  // guards' mandates included. On an exit `amountInUsdg` is proceeds, not
  // capital deployed, so the notional adds money in to money out; and since D68
  // an exit against a stale oracle records `slippageBps: 0`, which drags the
  // weighted average down.
  //
  // The contract's own comment calls it the primitive a track-record page reads
  // and says it "cannot be inflated by the agent". True — it is inflated by the
  // arithmetic instead. So it is printed, and printed next to the number that
  // answers the question a reader actually has: this mandate's own entries.
  // `src/track-record.ts` computes the second kind, deliberately (D50, D72).
  let entryNotional = 0n;
  let entryWeighted = 0n;
  let entryFills = 0;
  for (const { fills, foreign: isForeign } of records) {
    if (isForeign) continue;
    for (const f of fills) {
      if (f.isExit) continue;
      entryNotional += f.amountInUsdg;
      entryWeighted += f.amountInUsdg * BigInt(f.slippageBps);
      entryFills += 1;
    }
  }
  const entrySlippage = entryNotional === 0n ? 0n : entryWeighted / entryNotional;

  console.log(
    `\n     performance()  ${formatUnits(notional, USDG.decimals)} ${USDG.symbol}` +
      ` · ${slippageBps} bps · ${fillCount} fills`,
  );
  console.log(
    `       every fill ever recorded under id ${id}, exits counted as notional and their` +
      `\n       slippage averaged in. Capital this mandate actually deployed:` +
      `\n       ${formatUnits(entryNotional, USDG.decimals)} ${USDG.symbol} over ${entryFills} entries at ${entrySlippage} bps.`,
  );
}
