/**
 * One real exit, end to end: size it, ask the guard, sign for exactly those
 * units, then sell the position back to USDG.
 *
 *   TARGET=mainnet pnpm exit wSPYx 0.1          # sell ~$0.10 of wSPYx
 *   TARGET=mainnet pnpm exit wSPYx --units 0.0005   # sell exactly 0.0005 units
 *
 * ## This script no longer plans anything
 *
 * It used to: quote every fee tier, mirror `_priceE8` and `_exitShortfallBps`,
 * assemble the evidence bundle, all inline. The browser then needed the same
 * work and got `src/exit-plan.ts`, so there were two copies of arithmetic that
 * decides whether the guard rejects — and they had already diverged. **The copy
 * here was the wrong one** (D68): it measured shortfall against `peek`
 * unconditionally, while `Executor._exitShortfallBps` reads through
 * `observation`, catches the `Stale` revert and returns zero. With a stale
 * oracle and a market that had moved, this script computed an enormous false
 * shortfall, fed it to `dryRun`, and printed `REJECT: SLIPPAGE` for a
 * transaction the chain would have executed — refusing an exit is the one
 * failure this system is least allowed to have.
 *
 * Patching the second copy would have left two copies. So `prepareExit` is now
 * the only planner, shared with `POST /api/exit`, and this file is what it
 * always should have been: argument parsing, a key, and a transaction.
 *
 * ## Mainnet only, said out loud
 *
 * `pool.ts` reads through the mainnet-pinned `client` in `chain.ts`, so
 * `TARGET=testnet` here has always quoted mainnet pools while writing to
 * testnet. Testnet has no xStock pools to sell into either. Refusing is honest;
 * the previous silence was not.
 */
import { formatUnits, parseUnits, type Address } from 'viem';
import { ERC20_ABI, EXECUTOR_ABI, FAIR_VALUE_ORACLE_ABI, POLICY_GUARD_ABI } from './abi';
import { ADDR, client, USDG } from './chain';
import { prepareExit } from './exit-plan';
import { buildPermit, describePermit } from './permit';
import { addressBySymbol, loadToken } from './pool';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitForReceipt,
  waitUntil,
  walletFor,
} from './wallet';

const args = process.argv.slice(2);
const SYMBOL_OR_ADDRESS = args[0];

const unitsFlag = args.indexOf('--units');
/** When given, the size is in the asset's own units and the oracle is not consulted to size. */
const UNITS_ARG = unitsFlag === -1 ? null : args[unitsFlag + 1];
const TARGET_USDG = unitsFlag === -1 ? (args[1] ?? '0.1') : null;

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
const MANDATE_ID = process.env.MANDATE_ID ? BigInt(process.env.MANDATE_ID) : null;
const THESIS_HASH = (process.env.THESIS_HASH ?? ZERO_HASH) as `0x${string}`;

if (!SYMBOL_OR_ADDRESS || (UNITS_ARG !== null && !/^\d+(\.\d+)?$/.test(UNITS_ARG))) {
  console.error('usage: TARGET=mainnet pnpm exit <symbol|address> [usdgTarget]');
  console.error('       TARGET=mainnet pnpm exit <symbol|address> --units <amount>');
  process.exit(1);
}

const t = target();
if (t !== 'mainnet') {
  console.error(`\n  This command is mainnet only. See the header: the pool reads go through the`);
  console.error(`  mainnet client whatever TARGET says, and testnet has no xStock pool to sell`);
  console.error(`  into. Re-run with TARGET=mainnet.\n`);
  process.exit(1);
}

const chain = chainFor(t);
const deployment = deploymentFor(t);
const EXECUTOR = deployment.contracts.Executor as Address;
const GUARD = deployment.contracts.PolicyGuard as Address;
const ORACLE = deployment.contracts.FairValueOracle as Address;
const cash = USDG.address as Address;

const owner = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const agent = accountFrom('AGENT_KEY', 'PRIVATE_KEY');
const ownerWallet = walletFor(owner, t);
const agentWallet = walletFor(agent, t);

const asset = SYMBOL_OR_ADDRESS.startsWith('0x')
  ? (SYMBOL_OR_ADDRESS as Address)
  : (await addressBySymbol()).get(SYMBOL_OR_ADDRESS);

if (!asset) {
  console.error(`unknown symbol ${SYMBOL_OR_ADDRESS}`);
  process.exit(1);
}

const token = await loadToken(asset);
console.log(`\n  Executor ${EXECUTOR}  (${deployment.name}, chain ${chain.id})`);
console.log(`  owner    ${owner.address}`);
if (agent.address !== owner.address) console.log(`  agent    ${agent.address}`);

// -------------------------------------------------------- 1. how many units

const held = await ownerWallet.readContract({
  address: asset,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [owner.address],
});
console.log(`  holding  ${formatUnits(held, token.decimals)} ${token.symbol}`);
if (held === 0n) {
  console.error(`\n  Nothing to sell. Buy some first with pnpm execute.\n`);
  process.exit(1);
}

/**
 * A dollar target has to be turned into units by something, and the only
 * candidate is the oracle's fair value — which is why `--units` exists. Sizing
 * through a value the oracle has stopped defending lets a stale publisher decide
 * how much of your own position you may sell, and that is the shape of D51.
 * The browser names units for this reason (D68).
 */
let units: bigint;
if (UNITS_ARG !== null) {
  units = parseUnits(UNITS_ARG, token.decimals);
} else {
  const observation = await ownerWallet.readContract({
    address: ORACLE,
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'peek',
    args: [asset],
  });

  if (observation.updatedAt === 0n) {
    console.error(`\n  The oracle has never published a value for ${token.symbol}, so a dollar`);
    console.error(`  target cannot be turned into units. Name the units instead:`);
    console.error(`    TARGET=mainnet pnpm exit ${SYMBOL_OR_ADDRESS} --units <amount>\n`);
    process.exit(1);
  }
  if (!observation.hasValue || observation.fairValueE8 === 0n) {
    console.error(`\n  The oracle has no publishable value for ${token.symbol}. Refusing to size a`);
    console.error(`  trade against a number it will not stand behind — use --units.\n`);
    process.exit(1);
  }

  const maxAge = await ownerWallet.readContract({
    address: ORACLE,
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'maxAge',
  });
  const ageSeconds = BigInt(Math.floor(Date.now() / 1000)) - observation.updatedAt;
  if (ageSeconds > maxAge) {
    console.log(
      `\n  ⚠ the oracle's ${token.symbol} value is ${(Number(ageSeconds) / 60).toFixed(0)} min old,` +
        ` past its ${Number(maxAge) / 60} min maxAge.`,
    );
    console.log(`    It is being used to size only, because it is the only estimate there is —`);
    console.log(`    the protection on the fill is the min-out floor below, not this number.`);
    console.log(`    --units skips it entirely, and publishing first would be better:`);
    console.log(`      TARGET=mainnet pnpm oracle:publish`);
  }

  // units = usd / price, at chain precision throughout
  units = (parseUnits(TARGET_USDG!, USDG.decimals) * 10n ** BigInt(token.decimals) * 100n) /
    observation.fairValueE8;
}

if (units === 0n) {
  console.error(`\n  That rounds to zero units of ${token.symbol}.\n`);
  process.exit(1);
}
if (units > held) {
  console.error(
    `\n  Would need ${formatUnits(units, token.decimals)} ${token.symbol} and only` +
      ` ${formatUnits(held, token.decimals)} is held.\n`,
  );
  process.exit(1);
}

// --------------------------------------------- 2. the plan, from one planner

const mandateId =
  MANDATE_ID ??
  (await (async () => {
    const next = await ownerWallet.readContract({
      address: GUARD,
      abi: POLICY_GUARD_ABI,
      functionName: 'nextMandateId',
    });
    for (let id = next - 1n; id > 0n; id--) {
      const m = await ownerWallet.readContract({
        address: GUARD,
        abi: POLICY_GUARD_ABI,
        functionName: 'getMandate',
        args: [id],
      });
      // Owned, active, and pointing at the executor this build targets. Any one
      // missing means the mandate cannot be used, however recent it is.
      if (
        m.active &&
        m.owner.toLowerCase() === owner.address.toLowerCase() &&
        m.executor.toLowerCase() === EXECUTOR.toLowerCase()
      ) {
        return id;
      }
    }
    throw new Error('no active mandate for this owner — run pnpm mandate first');
  })());

console.log(`  mandate  #${mandateId}`);
console.log(`\n  planning…`);

// Everything `prepareExit` throws is a sentence about why this exit cannot
// honestly be planned — a closed mandate, a wallet that is not its agent, no
// pool deep enough. Letting viem's stack trace answer a question the user is
// entitled to one line about is what this file used to complain about.
const plan = await prepareExit({
  asset,
  units: formatUnits(units, token.decimals),
  mandateId,
  sender: owner.address,
  agent: agent.address,
  thesisHash: THESIS_HASH,
}).catch((e: unknown) => {
  console.error(`\n  ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

for (const tier of plan.quote.considered) {
  const chosen = tier.fee === plan.quote.feeTier ? ' ←' : '';
  console.log(
    `  fee ${String(tier.fee).padStart(5)}  ->  ` +
      `${formatUnits(tier.out, plan.cashDecimals)} ${USDG.symbol}${chosen}`,
  );
}

console.log(
  `\n  selling   ${formatUnits(plan.units, plan.decimals)} ${plan.symbol}` +
    ` -> ${formatUnits(plan.quote.amountOut, plan.cashDecimals)} ${USDG.symbol}`,
);
console.log(`  pool      ${plan.quote.pool}  (the one the executor derives)`);
console.log(`  floor     ${formatUnits(plan.leg.minAmountOutUsdg, plan.cashDecimals)} ${USDG.symbol}`);
console.log(`  price     ${formatUnits(plan.predicted.executionPriceE8, 8)} per ${plan.symbol}`);
console.log(
  `  fair      ${formatUnits(plan.oracle.fairValueE8, 8)}` +
    ` (${plan.oracle.ageSeconds}s old${plan.oracle.stale ? ', STALE' : ''})`,
);
// Zero here is a measurement, not a missing one: `_exitShortfallBps` returns
// zero against a value the oracle refuses to defend, and so does the planner.
console.log(
  `  shortfall ${plan.predicted.shortfallBps} bps below fair value` +
    (plan.oracle.stale || !plan.oracle.hasValue
      ? '  (not measured — the oracle is not defending a number, and neither is the contract)'
      : ''),
);

if (!plan.verdict.allow) {
  console.error(`\n  guard would REJECT: ${plan.verdict.reason}  ${plan.verdict.offendingAsset}`);
  console.error('  Refusing to spend gas on a transaction the guard will revert.\n');
  process.exit(1);
}
console.log(`  dryRun    ALLOW`);
console.log(`  evidence  ${plan.evidence.hash}${plan.evidence.stored ? '' : '  (not stored)'}`);

// --------------------------------- 3. Permit2, over the asset being sold

const allowance = await ownerWallet.readContract({
  address: asset,
  abi: ERC20_ABI,
  functionName: 'allowance',
  args: [owner.address, ADDR.permit2],
});
if (allowance < plan.leg.amountIn) {
  console.log(`\n  approving Permit2 to move ${plan.symbol}…`);
  const hash = await ownerWallet.writeContract({
    address: asset,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ADDR.permit2, (1n << 160n) - 1n],
  });
  await waitForReceipt(ownerWallet, hash);
  await waitUntil(
    () =>
      ownerWallet.readContract({
        address: asset,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner.address, ADDR.permit2],
      }),
    (a) => a >= plan.leg.amountIn,
    { what: 'Permit2 allowance' },
  );
  console.log(`  approved`);
}

// The same module the browser signs with, so a CLI exit and a browser exit
// cannot authorise subtly different things. It reads the nonce bitmap through
// the mainnet public client — which this script is now pinned to anyway, and
// which is the only chain the rest of the plan came from.
const payload = await buildPermit(client, {
  token: asset,
  amount: plan.leg.amountIn,
  spender: EXECUTOR,
  owner: owner.address,
  chainId: chain.id,
});

console.log(`\n  permit    nonce ${payload.nonce}, over the asset rather than the cash`);
for (const line of describePermit(
  { token: asset, amount: plan.leg.amountIn, spender: EXECUTOR, owner: owner.address, chainId: chain.id },
  payload.deadline,
  plan.symbol,
  plan.decimals,
)) {
  console.log(`            · ${line}`);
}

const signature = await ownerWallet.signTypedData({
  account: owner,
  ...payload.typedData,
});

// -------------------------------------------------------------- 4. exit

const cashBefore = await ownerWallet.readContract({
  address: cash,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [owner.address],
});

console.log(`\n  exiting…`);
const hash = await agentWallet.writeContract({
  address: EXECUTOR,
  abi: EXECUTOR_ABI,
  functionName: 'exit',
  args: [
    mandateId,
    [
      {
        asset,
        amountIn: plan.leg.amountIn,
        minAmountOutUsdg: plan.leg.minAmountOutUsdg,
        fee: plan.leg.fee,
      },
    ],
    payload.permit,
    signature,
    THESIS_HASH,
    plan.evidence.hash,
    '', // evidenceCID — nothing pins the bundle yet, so this stays empty
  ],
});
const receipt = await waitForReceipt(agentWallet, hash);
console.log(`  tx        ${hash}  (${receipt.status}, gas ${receipt.gasUsed})`);

// Polled, not read once: a confirmed receipt does not mean the next read lands
// on a node that has seen the block, and a stale read here would print a
// correct trade as if nothing had happened. See D18.
const cashAfter = await waitUntil(
  () =>
    ownerWallet.readContract({
      address: cash,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner.address],
    }),
  (b) => b > cashBefore,
  { attempts: 30, delayMs: 500, what: `the ${USDG.symbol} the exit realised` },
);

console.log(
  `\n  received  ${formatUnits(cashAfter - cashBefore, USDG.decimals)} ${USDG.symbol}` +
    ` (net of the execution fee)`,
);
console.log(`  explorer  ${deployment.explorer}/tx/${hash}\n`);
