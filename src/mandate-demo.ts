/**
 * Creates a mandate, installs exit triggers compiled from a thesis, and shows
 * the guard refusing a trade — using capacity measured from real mainnet pool
 * liquidity, published to the oracle by `pnpm oracle:publish`.
 *
 * Chain comes from `TARGET` (default testnet), so this cannot write to one
 * chain while printing another.
 *
 * The deployer plays owner, agent and executor here. In production those are
 * three different keys; the separation is what the access-control tests cover.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  parseAbi,
  type Address,
} from 'viem';
import { accountFrom, chainFor, deploymentFor, target, waitUntil, walletFor } from './wallet';

// Chain and addresses both come from TARGET. Defaulting to the recorded
// deployment rather than a literal also keeps this off older guards that are
// still live on the same chain.
const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const GUARD = (process.env.GUARD_ADDRESS ?? deployment.contracts.PolicyGuard) as Address;

const wMUx = '0xe2047ee3bddb5c99ae428ab83df63f8730698e30' as Address;
const wNVDAx = '0xa8ddb5cd96b5222afe198316e9a57caa642850d5' as Address;

const guardAbi = parseAbi([
  'struct Policy { uint16 maxWeightBps; uint16 minCashBufferBps; uint16 maxSlippageBps; uint16 maxDeviationBps; uint8 maxGapRisk; uint128 maxNotionalPerTrade; uint16 maxFillsPerEpoch; uint32 epochDuration; uint32 minRebalanceInterval; bool enforceWeights; }',
  'struct Trigger { uint8 metric; uint8 comparator; int256 threshold; address[] assets; }',
  'struct Fill { address asset; bool isExit; uint128 amountInUsdg; uint128 amountOut; uint128 executionPriceE8; uint16 slippageBps; uint128 fairValueE8; uint8 gapRisk; }',
  'function createMandate(address agent, address executor, Policy policy, address[] assets) returns (uint256)',
  'function setTriggers(uint256 mandateId, Trigger[] triggers)',
  'function validateAndRecord(uint256 mandateId, Fill[] fills, bytes32 thesisHash, bytes32 evidenceHash, string evidenceCID) returns (uint256)',
  'function firedTriggers(uint256 mandateId) view returns (uint256[] triggerIndexes, address[] assets, address[] staleAssets)',
  'function nextMandateId() view returns (uint256)',
  'function getMandate(uint256 mandateId) view returns ((address owner, address agent, address executor, uint32 version, bool active, bool circuitBreaker, uint64 lastActionAt, uint64 epochStart, uint16 fillsThisEpoch, (uint16,uint16,uint16,uint16,uint8,uint128,uint16,uint32,uint32,bool) policy))',
  'error TriggerFired(uint256 triggerIndex, address asset, int256 value, int256 threshold)',
  'error OracleRejected(address asset, bytes32 reason)',
  'error AssetNotAllowed(address asset)',
  'error SlippageTooHigh(address asset, uint16 realised, uint16 limit)',
  'error NotionalTooLarge(address asset, uint128 amount, uint128 limit)',
]);

const oracleAbi = parseAbi([
  'function peek(address asset) view returns ((uint128 fairValueE8, uint32 confidenceBps, int32 basisBps, uint128 capacityUsdg, uint8 gapRisk, uint8 state, uint64 anchorAt, uint64 updatedAt, bool hasValue))',
]);

const account = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const client = walletFor(account, t);

console.log(`\n  PolicyGuard ${GUARD}  (${deployment.name}, chain ${chain.id})`);
console.log(`  owner/agent/executor ${account.address}\n`);

// 1 — create the mandate
const policy = {
  maxWeightBps: 4000,
  minCashBufferBps: 500,
  maxSlippageBps: 50,
  maxDeviationBps: 100,
  maxGapRisk: 60,
  maxNotionalPerTrade: 5_000_000000n,
  maxFillsPerEpoch: 8,
  epochDuration: 86_400,
  minRebalanceInterval: 0,
  enforceWeights: false,
} as const;

const mandateId = await client.readContract({
  address: GUARD,
  abi: guardAbi,
  functionName: 'nextMandateId',
});

let hash = await client.writeContract({
  address: GUARD,
  abi: guardAbi,
  functionName: 'createMandate',
  args: [account.address, account.address, policy, [wMUx, wNVDAx]],
});
await client.waitForTransactionReceipt({ hash });

// A confirmed receipt is not enough on X Layer: the public RPC load-balances,
// and the *gas estimation* for the next transaction can land on a node that has
// not seen this one yet — which reads the mandate as owner 0x0 and reverts
// NotOwner. Dependent transactions need the state confirmed visible, not just
// the receipt. See D18.
await waitUntil(
  () =>
    client.readContract({
      address: GUARD,
      abi: guardAbi,
      functionName: 'getMandate',
      args: [mandateId],
    }),
  (m) => m.owner.toLowerCase() === account.address.toLowerCase(),
  { attempts: 30, delayMs: 500, what: 'the mandate' },
);
console.log(`  mandate #${mandateId} created — allows wMUx, wNVDAx`);

// 2 — install triggers compiled from the thesis
//     "Liquidity thins to the point the position cannot be exited sanely."
//       → capacityUsdg < 1,000 USDG   (metric 5, comparator lt)
const triggers = [
  { metric: 5, comparator: 1, threshold: 1_000_000000n, assets: [] as Address[] },
];
hash = await client.writeContract({
  address: GUARD,
  abi: guardAbi,
  functionName: 'setTriggers',
  args: [mandateId, triggers],
});
await client.waitForTransactionReceipt({ hash });
console.log(`  trigger installed — exit when capacityUsdg < 1,000 (basket-wide)\n`);

// 3 — ask the guard what is firing right now
async function report() {
  for (let i = 0; i < 20; i++) {
    const [idx, assets, stale] = await client.readContract({
      address: GUARD,
      abi: guardAbi,
      functionName: 'firedTriggers',
      args: [mandateId],
    });
    if (idx.length || stale.length || i === 19) {
      console.log(`  firedTriggers → ${idx.length} firing, ${stale.length} stale`);
      for (let k = 0; k < idx.length; k++) {
        console.log(`    trigger #${idx[k]} fires for ${assets[k]}`);
      }
      for (const s of stale) console.log(`    stale observation: ${s}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
await report();

// 4 — try to buy each and let the guard decide
const fill = (asset: Address, priceE8: bigint) => [
  {
    asset,
    isExit: false,
    amountInUsdg: 100_000000n,
    amountOut: (100_000000n * 10n ** 20n) / priceE8,
    executionPriceE8: priceE8,
    slippageBps: 10,
    fairValueE8: 0n,
    gapRisk: 0,
  },
];

// Price each fill AT the oracle's current fair value. Hardcoded prices go
// stale, and a fill rejected for drifting 2% from fair value would be a
// truthful rejection of the wrong thing — this demo is about the trigger.
const ORACLE = (process.env.ORACLE_ADDRESS ??
  deployment.contracts.FairValueOracle) as Address;

async function fairValueOf(asset: Address): Promise<bigint> {
  const o = await client.readContract({
    address: ORACLE,
    abi: oracleAbi,
    functionName: 'peek',
    args: [asset],
  });
  if (!o.hasValue || o.fairValueE8 === 0n) {
    throw new Error(`oracle has no publishable value for ${asset} — run pnpm oracle:publish`);
  }
  return o.fairValueE8;
}

console.log('\n  attempting a 100 USDG buy on each, priced at the oracle\'s fair value\n');
for (const [name, asset] of [
  ['wMUx', wMUx],
  ['wNVDAx', wNVDAx],
] as const) {
  const price = await fairValueOf(asset);
  try {
    await client.simulateContract({
      account,
      address: GUARD,
      abi: guardAbi,
      functionName: 'validateAndRecord',
      args: [mandateId, fill(asset, price), '0x'.padEnd(66, '1') as `0x${string}`, '0x'.padEnd(66, '2') as `0x${string}`, 'ipfs://demo'],
    });
    console.log(`    ${name.padEnd(8)} ALLOW`);
  } catch (e) {
    const reverted =
      e instanceof BaseError
        ? e.walk((err) => err instanceof ContractFunctionRevertedError)
        : undefined;
    if (reverted instanceof ContractFunctionRevertedError && reverted.data) {
      const args = (reverted.data.args ?? []) as unknown[];
      if (reverted.data.errorName === 'TriggerFired') {
        const [idx, , value, threshold] = args as bigint[];
        console.log(
          `    ${name.padEnd(8)} REJECT  TriggerFired` +
            ` — trigger #${idx}: capacity ${Number(value) / 1e6} < ${Number(threshold) / 1e6} USDG`,
        );
      } else if (reverted.data.errorName === 'OracleRejected') {
        const reason = Buffer.from(String(args[1]).slice(2), 'hex')
          .toString('utf8')
          .replace(/\0+$/, '');
        console.log(`    ${name.padEnd(8)} REJECT  OracleRejected — ${reason}`);
      } else {
        console.log(`    ${name.padEnd(8)} REJECT  ${reverted.data.errorName} ${args.join(' ')}`);
      }
    } else {
      console.log(`    ${name.padEnd(8)} REJECT  ${(e as Error).message.split('\n')[0]}`);
    }
  }
}
console.log();
