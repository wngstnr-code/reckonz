/**
 * Creates a mandate on testnet, installs exit triggers compiled from a thesis,
 * and shows the guard refusing a trade — using capacity measured from real
 * mainnet pool liquidity, published to the oracle by `pnpm publish`.
 *
 * The deployer plays owner, agent and executor here. In production those are
 * three different keys; the separation is what the access-control tests cover.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  http,
  parseAbi,
  publicActions,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerTestnet } from './chain';

const GUARD = (process.env.GUARD_ADDRESS ??
  '0xa06C2930C279Fd60b6Cbe0752732e008044fc8Ed') as Address;

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
]);

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const client = createWalletClient({ account, chain: xLayerTestnet, transport: http() })
  .extend(publicActions);

console.log(`\n  PolicyGuard ${GUARD}  (chain ${xLayerTestnet.id})`);
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

/**
 * A confirmed receipt is not enough on X Layer: the public RPC load-balances,
 * and the *gas estimation* for the next transaction can land on a node that has
 * not seen this one yet — which reads the mandate as owner 0x0 and reverts
 * NotOwner. Dependent transactions need the state confirmed visible, not just
 * the receipt (see docs/04-decisions.md D18).
 */
for (let i = 0; i < 30; i++) {
  const m = await client.readContract({
    address: GUARD,
    abi: guardAbi,
    functionName: 'getMandate',
    args: [mandateId],
  });
  if (m.owner.toLowerCase() === account.address.toLowerCase()) {
    if (i > 0) console.log(`  (mandate visible after ${i + 1} reads — RPC nodes lag)`);
    break;
  }
  if (i === 29) throw new Error('mandate never became readable');
  await new Promise((r) => setTimeout(r, 500));
}
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

console.log('\n  attempting a 100 USDG buy on each\n');
for (const [name, asset, price] of [
  ['wMUx', wMUx, 87280000000n],
  ['wNVDAx', wNVDAx, 22321000000n],
] as const) {
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
      const [idx, , value, threshold] = (reverted.data.args ?? []) as bigint[];
      console.log(
        `    ${name.padEnd(8)} REJECT  ${reverted.data.errorName}` +
          ` — trigger #${idx}: capacity ${Number(value) / 1e6} < ${Number(threshold) / 1e6} USDG`,
      );
    } else {
      console.log(`    ${name.padEnd(8)} REJECT  ${(e as Error).message.split('\n')[0]}`);
    }
  }
}
console.log();
