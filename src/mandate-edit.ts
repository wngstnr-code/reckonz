/**
 * Change a mandate after it exists.
 *
 * `closeMandate`, `updatePolicy`, `setAgent`, `setAssetAllowed` and
 * `setTriggers` were all owner-only, all implemented, and all unreachable from
 * anything in this repo except `pnpm mandate`, which only ever ran at creation
 * (D52). A mandate was create-once: the rules that bound it could never be
 * tightened, the agent could never be rotated, and it could never be shut.
 *
 *   TARGET=mainnet pnpm mandate:edit 3 close
 *   TARGET=mainnet pnpm mandate:edit 3 agent 0xabc…
 *   TARGET=mainnet pnpm mandate:edit 3 asset wQQQx off
 *   TARGET=mainnet pnpm mandate:edit 3 policy maxSlippageBps=80 maxNotionalUsdg=2
 *   TARGET=mainnet pnpm mandate:edit 3 trigger add gapRisk gt 50
 *   TARGET=mainnet pnpm mandate:edit 3 trigger add capacityUsdg lt 500 wSPYx,wTSLAx
 *   TARGET=mainnet pnpm mandate:edit 3 trigger clear
 *
 * Read `pnpm mandate:show <id>` first; this script prints the before state too,
 * but a change to a live mandate deserves to be looked at twice.
 *
 * **`setTriggers` replaces wholesale on chain.** `trigger add` therefore reads
 * the existing set, appends, and writes the whole array back — so "add" means
 * add rather than "silently discard everything you had". `trigger clear` is the
 * only way to remove, and it says what it is removing before it does.
 */
import { formatUnits, getAddress, isAddress, parseUnits, type Address } from 'viem';
import { POLICY_GUARD_ABI, TRIGGER_COMPARATORS, TRIGGER_METRICS, metricIndex, comparatorIndex,
  type TriggerComparator, type TriggerMetric } from './abi';
import { USDG } from './chain';
import { addressBySymbol, loadToken } from './pool';
import { describeOnchainTrigger, scaleThreshold, type OnchainTrigger } from './triggers';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitForReceipt,
  waitUntil,
  walletFor,
} from './wallet';

const USAGE = `usage:
  TARGET=mainnet pnpm mandate:edit <id> close
  TARGET=mainnet pnpm mandate:edit <id> agent <address>
  TARGET=mainnet pnpm mandate:edit <id> asset <symbol|address> on|off
  TARGET=mainnet pnpm mandate:edit <id> policy <key=value> [key=value…]
  TARGET=mainnet pnpm mandate:edit <id> trigger add <metric> <gt|lt> <threshold> [sym,sym]
  TARGET=mainnet pnpm mandate:edit <id> trigger clear

policy keys: maxWeightBps, minCashBufferBps, maxSlippageBps, maxDeviationBps,
             maxGapRisk, maxNotionalUsdg, maxFillsPerEpoch, epochDuration,
             minRebalanceInterval, enforceWeights
metrics:     ${TRIGGER_METRICS.join(', ')}`;

const [idArg, action, ...rest] = process.argv.slice(2);

if (!idArg || !/^\d+$/.test(idArg) || !action) {
  console.error(USAGE);
  process.exit(1);
}

const mandateId = BigInt(idArg);
const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const GUARD = deployment.contracts.PolicyGuard as Address;

const owner = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(owner, t);

console.log(`\n  PolicyGuard ${GUARD}  (${deployment.name}, chain ${chain.id})`);
console.log(`  caller      ${owner.address}\n`);

const mandate = await wallet.readContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'getMandate',
  args: [mandateId],
});

if (mandate.owner === '0x0000000000000000000000000000000000000000') {
  console.error(`  mandate #${mandateId} does not exist on this guard.\n`);
  process.exit(1);
}
// The contract enforces this regardless; checking first turns a revert into a
// sentence and costs nothing.
if (mandate.owner.toLowerCase() !== owner.address.toLowerCase()) {
  console.error(`  Only the mandate's owner can change it, and that is not you.`);
  console.error(`  owner ${mandate.owner}`);
  console.error(`  you   ${owner.address}\n`);
  process.exit(1);
}
if (!mandate.active && action !== 'close') {
  console.error(`  mandate #${mandateId} is closed. Nothing can be changed on it.\n`);
  process.exit(1);
}

console.log(`  mandate #${mandateId}  version ${mandate.version}  ${mandate.active ? 'active' : 'CLOSED'}`);

/** Send, wait, then poll until the change is actually readable (D18). */
async function send<T>(
  label: string,
  call: () => Promise<`0x${string}`>,
  confirm: () => Promise<T>,
  done: (value: T) => boolean,
  what: string,
) {
  console.log(`\n  ${label}`);
  const hash = await call();
  const receipt = await waitForReceipt(wallet, hash);
  console.log(`  tx        ${hash}  (${receipt.status}, gas ${receipt.gasUsed})`);
  const value = await waitUntil(confirm, done, { attempts: 30, delayMs: 500, what });
  console.log(`  explorer  ${deployment.explorer}/tx/${hash}\n`);
  return value;
}

const readMandate = () =>
  wallet.readContract({
    address: GUARD,
    abi: POLICY_GUARD_ABI,
    functionName: 'getMandate',
    args: [mandateId],
  });

const readTriggers = () =>
  wallet.readContract({
    address: GUARD,
    abi: POLICY_GUARD_ABI,
    functionName: 'getTriggers',
    args: [mandateId],
  });

async function resolveAsset(nameOrAddress: string): Promise<Address> {
  if (isAddress(nameOrAddress)) return getAddress(nameOrAddress);
  const found = (await addressBySymbol()).get(nameOrAddress);
  if (!found) throw new Error(`unknown symbol ${nameOrAddress}`);
  return found;
}

switch (action) {
  case 'close': {
    console.log(`\n  Closing mandate #${mandateId}. This is permanent — a closed mandate cannot`);
    console.log(`  be reopened, and \`nextMandateId\` never goes backwards, so the id is spent.`);
    console.log(`  Your assets are unaffected; they are in your wallet and always were.`);
    const m = await send(
      'closing…',
      () =>
        wallet.writeContract({
          address: GUARD,
          abi: POLICY_GUARD_ABI,
          functionName: 'closeMandate',
          args: [mandateId],
        }),
      readMandate,
      (m) => !m.active,
      'the mandate to read back as closed',
    );
    console.log(`  state     ${m.active ? 'active' : 'CLOSED'} — confirmed by reading it back\n`);
    break;
  }

  case 'agent': {
    const next = rest[0];
    if (!next || !isAddress(next)) {
      console.error(`  give an address for the new agent.\n`);
      process.exit(1);
    }
    console.log(`\n  agent ${mandate.agent}\n     -> ${getAddress(next)}`);
    console.log(`  The agent proposes trades. It can never exceed the policy, and it can never`);
    console.log(`  move funds without a Permit2 signature you produce per execution.`);
    const m = await send(
      'rotating the agent…',
      () =>
        wallet.writeContract({
          address: GUARD,
          abi: POLICY_GUARD_ABI,
          functionName: 'setAgent',
          args: [mandateId, getAddress(next)],
        }),
      readMandate,
      (m) => m.agent.toLowerCase() === next.toLowerCase(),
      'the new agent',
    );
    console.log(`  agent     ${m.agent} — confirmed\n`);
    break;
  }

  case 'asset': {
    const [nameOrAddress, state] = rest;
    if (!nameOrAddress || (state !== 'on' && state !== 'off')) {
      console.error(`  usage: pnpm mandate:edit ${idArg} asset <symbol|address> on|off\n`);
      process.exit(1);
    }
    const asset = await resolveAsset(nameOrAddress);
    const token = await loadToken(asset);
    const allow = state === 'on';

    // Disallowing does not sell anything, and saying so matters: a user who
    // expects "off" to flatten the position would otherwise think they had.
    if (!allow) {
      console.log(`\n  Disallowing ${token.symbol} stops new fills into it. It does NOT sell what`);
      console.log(`  you already hold — use \`pnpm exit ${token.symbol}\` for that, and do it before`);
      console.log(`  disallowing, because an exit is a fill and the guard checks the allowlist.`);
    }

    const after = await send(
      `${allow ? 'allowing' : 'disallowing'} ${token.symbol}…`,
      () =>
        wallet.writeContract({
          address: GUARD,
          abi: POLICY_GUARD_ABI,
          functionName: 'setAssetAllowed',
          args: [mandateId, asset, allow],
        }),
      () =>
        wallet.readContract({
          address: GUARD,
          abi: POLICY_GUARD_ABI,
          functionName: 'isAllowedAsset',
          args: [mandateId, asset],
        }),
      (v) => v === allow,
      `${token.symbol} to read back as ${allow ? 'allowed' : 'disallowed'}`,
    );
    console.log(`  ${token.symbol}  ${after ? 'allowed' : 'disallowed'} — confirmed\n`);
    break;
  }

  case 'policy': {
    if (rest.length === 0) {
      console.error(`  give at least one key=value.\n\n${USAGE}\n`);
      process.exit(1);
    }

    // Read-modify-write: `updatePolicy` takes the whole struct, so anything not
    // named here must be carried over exactly. Rebuilding it from defaults
    // would silently reset the fields the user did not mention.
    const p = { ...mandate.policy };
    const changes: string[] = [];

    for (const pair of rest) {
      const [key, raw] = pair.split('=');
      if (!key || raw === undefined) {
        console.error(`  "${pair}" is not key=value\n`);
        process.exit(1);
      }
      switch (key) {
        case 'maxNotionalUsdg':
          p.maxNotionalPerTrade = parseUnits(raw, USDG.decimals);
          changes.push(`maxNotionalPerTrade -> ${raw} ${USDG.symbol}`);
          break;
        case 'enforceWeights':
          p.enforceWeights = raw === 'true';
          changes.push(`enforceWeights -> ${p.enforceWeights}`);
          break;
        case 'maxWeightBps':
        case 'minCashBufferBps':
        case 'maxSlippageBps':
        case 'maxDeviationBps':
        case 'maxGapRisk':
        case 'maxFillsPerEpoch':
        case 'epochDuration':
        case 'minRebalanceInterval':
          (p as Record<string, unknown>)[key] = Number(raw);
          changes.push(`${key} -> ${raw}`);
          break;
        default:
          console.error(`  unknown policy key "${key}"\n\n${USAGE}\n`);
          process.exit(1);
      }
    }

    console.log(`\n  ${changes.join('\n  ')}`);
    console.log(`\n  Every field not named above is carried over unchanged. The version bumps,`);
    console.log(`  so receipts record which policy was in force at the time.`);

    const m = await send(
      'updating the policy…',
      () =>
        wallet.writeContract({
          address: GUARD,
          abi: POLICY_GUARD_ABI,
          functionName: 'updatePolicy',
          args: [mandateId, p],
        }),
      readMandate,
      (m) => m.version > mandate.version,
      'the new policy version',
    );
    console.log(`  version   ${mandate.version} -> ${m.version}`);
    console.log(
      `  max/trade ${formatUnits(m.policy.maxNotionalPerTrade, USDG.decimals)} ${USDG.symbol}` +
        `   slippage ${m.policy.maxSlippageBps} bps   gap ${m.policy.maxGapRisk}\n`,
    );
    break;
  }

  case 'trigger': {
    const sub = rest[0];
    const existing = await readTriggers();

    const symbolOf = new Map<string, string>();
    const allowed = await wallet.readContract({
      address: GUARD,
      abi: POLICY_GUARD_ABI,
      functionName: 'allowedAssets',
      args: [mandateId],
    });
    for (const a of allowed) symbolOf.set(a.toLowerCase(), (await loadToken(a)).symbol);

    const asOnchain = (x: (typeof existing)[number]): OnchainTrigger => ({
      metric: Number(x.metric),
      comparator: Number(x.comparator),
      threshold: x.threshold,
      assets: [...x.assets],
    });

    console.log(`\n  current triggers (${existing.length})`);
    existing.forEach((x, i) =>
      console.log(`    ${i}. ${describeOnchainTrigger(asOnchain(x), symbolOf)}`),
    );

    if (sub === 'clear') {
      if (existing.length === 0) {
        console.log(`\n  Already empty. Nothing to do.\n`);
        process.exit(0);
      }
      console.log(`\n  Removing all ${existing.length}. Nothing will tell this mandate to leave a`);
      console.log(`  position afterwards, and no entry will be refused on trigger grounds.`);
      await send(
        'clearing…',
        () =>
          wallet.writeContract({
            address: GUARD,
            abi: POLICY_GUARD_ABI,
            functionName: 'setTriggers',
            args: [mandateId, []],
          }),
        readTriggers,
        (ts) => ts.length === 0,
        'the triggers to read back empty',
      );
      console.log(`  triggers  0 — confirmed\n`);
      break;
    }

    if (sub !== 'add') {
      console.error(`  usage: pnpm mandate:edit ${idArg} trigger add|clear …\n`);
      process.exit(1);
    }

    const [metric, comparator, threshold, scope] = rest.slice(1);
    if (!metric || !comparator || threshold === undefined) {
      console.error(`  usage: pnpm mandate:edit ${idArg} trigger add <metric> <gt|lt> <threshold> [sym,sym]\n`);
      process.exit(1);
    }
    if (metricIndex(metric as TriggerMetric) < 0) {
      console.error(`  unknown metric "${metric}" — one of: ${TRIGGER_METRICS.join(', ')}\n`);
      process.exit(1);
    }
    if (!TRIGGER_COMPARATORS.includes(comparator as TriggerComparator)) {
      console.error(`  comparator must be gt or lt\n`);
      process.exit(1);
    }
    if (!Number.isFinite(Number(threshold))) {
      console.error(`  threshold must be a number\n`);
      process.exit(1);
    }

    const assets: Address[] = [];
    for (const name of (scope ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const address = await resolveAsset(name);
      if (!allowed.some((a) => a.toLowerCase() === address.toLowerCase())) {
        console.error(`  ${name} is not on this mandate's allowlist — allow it first.\n`);
        process.exit(1);
      }
      assets.push(address);
    }

    const added: OnchainTrigger = {
      metric: metricIndex(metric as TriggerMetric),
      comparator: comparatorIndex(comparator as TriggerComparator),
      threshold: scaleThreshold(metric as TriggerMetric, Number(threshold)),
      assets,
    };

    console.log(`\n  adding: ${describeOnchainTrigger(added, symbolOf)}`);
    console.log(`  (setTriggers replaces wholesale, so the ${existing.length} above are rewritten with it)`);

    const after = await send(
      'installing…',
      () =>
        wallet.writeContract({
          address: GUARD,
          abi: POLICY_GUARD_ABI,
          functionName: 'setTriggers',
          args: [mandateId, [...existing.map(asOnchain), added]],
        }),
      readTriggers,
      (ts) => ts.length === existing.length + 1,
      'the new trigger',
    );
    console.log(`  triggers  ${after.length} — confirmed`);
    after.forEach((x, i) => console.log(`    ${i}. ${describeOnchainTrigger(asOnchain(x), symbolOf)}`));
    console.log();
    break;
  }

  default:
    console.error(`  unknown action "${action}"\n\n${USAGE}\n`);
    process.exit(1);
}
