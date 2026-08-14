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
import { POLICY_GUARD_ABI } from './abi';
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
  console.log();
}

if (shown === 0) {
  console.log(`  No mandates owned by ${owner.address} on this guard.\n`);
}
