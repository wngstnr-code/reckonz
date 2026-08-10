/**
 * Runs the fair-value engine and publishes the result to the deployed
 * FairValueOracle, then reads it back and asks the contract for an execution
 * decision. This is the loop end to end on a real chain.
 *
 * Assets are keyed by their **X Layer mainnet** addresses even when publishing
 * to testnet — the oracle is an address-keyed registry, and reusing the real
 * identifiers keeps testnet observations comparable to mainnet ones.
 */
import {
  createWalletClient,
  http,
  parseAbi,
  publicActions,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerTestnet } from './chain';
import { ASSETS, computeFairValue, toOraclePayload } from './fairvalue';
import { capacity, loadVenues } from './planner';

/** Impact limit the published capacity is measured at. */
const REFERENCE_IMPACT_BPS = Number(process.env.REFERENCE_IMPACT_BPS ?? 50);

const ORACLE = (process.env.ORACLE_ADDRESS ??
  '0x40d6C616dEBD91Fd85eAF11C281E0c4B2b74D87b') as Address;

const ADDRESS_BY_SYMBOL: Record<string, Address> = {
  wSPYx: '0xe7e553cd128f0011777323a0b44a7b96ea1cb540',
  wNVDAx: '0xa8ddb5cd96b5222afe198316e9a57caa642850d5',
  wSPCXx: '0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072',
  wCRCLx: '0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8',
  wINTCx: '0x33aa35b0271fffe2048cc093ab7fe60931786719',
  wMUx: '0xe2047ee3bddb5c99ae428ab83df63f8730698e30',
  wSKHYx: '0x6215a58ed045d71f2561aaabe54f4c885c522998',
  wSNDKx: '0x75e82e2884ea10f72fca777449b73377f4646219',
};

const oracleAbi = parseAbi([
  'struct Publication { address asset; uint128 fairValueE8; uint32 confidenceBps; int32 basisBps; uint128 capacityUsdg; uint8 gapRisk; uint8 state; uint64 anchorAt; bool hasValue; }',
  'function publishMany(Publication[] items)',
  'function peek(address asset) view returns ((uint128 fairValueE8, uint32 confidenceBps, int32 basisBps, uint128 capacityUsdg, uint8 gapRisk, uint8 state, uint64 anchorAt, uint64 updatedAt, bool hasValue))',
  'function checkExecution(address asset, uint256 executionPriceE8, uint8 maxGapRisk, uint32 maxDeviationBps) view returns (bool ok, bytes32 reason)',
]);

const pk = process.env.PRIVATE_KEY;
if (!pk) throw new Error('PRIVATE_KEY is not set — see .env.example');

const account = privateKeyToAccount(pk as `0x${string}`);
const client = createWalletClient({
  account,
  chain: xLayerTestnet,
  transport: http(),
}).extend(publicActions);

console.log(`\n  FairValueOracle ${ORACLE}  (chain ${xLayerTestnet.id})`);
console.log(`  publisher       ${account.address}\n`);

// 1 — run the off-chain engine: fair value from marketdata, capacity and basis
//     from live mainnet pool state via the planner.
const now = Math.floor(Date.now() / 1000);
type Item = {
  asset: Address;
  fairValueE8: bigint;
  confidenceBps: number;
  basisBps: number;
  capacityUsdg: bigint;
  gapRisk: number;
  state: number;
  anchorAt: bigint;
  hasValue: boolean;
};
const items: Item[] = [];

for (const spec of ASSETS) {
  const address = ADDRESS_BY_SYMBOL[spec.symbol];
  if (!address) continue;

  const venues = await loadVenues(address);
  const onchainPrice = venues[0]?.spot;
  const capacityUsdg = venues.length ? capacity(venues, REFERENCE_IMPACT_BPS) : 0n;

  const report = await computeFairValue(spec, { now, onchainPrice });
  const p = toOraclePayload(report);

  items.push({
    asset: address,
    fairValueE8: p.fairValueE8,
    confidenceBps: p.confidenceBps,
    // Withheld basis publishes as 0 — the guard only reaches a basis trigger
    // once the oracle gate has already passed, which requires a value.
    basisBps: Math.round(report.basisBps ?? 0),
    capacityUsdg,
    gapRisk: p.gapRisk,
    state: p.state,
    anchorAt: BigInt(p.anchorAt),
    hasValue: p.hasValue,
  });

  console.log(
    `  ${spec.symbol.padEnd(9)} ` +
      `fv=${p.hasValue ? (Number(p.fairValueE8) / 1e8).toFixed(2).padStart(11) : 'withheld'.padStart(11)}  ` +
      `band=${(p.confidenceBps / 100).toFixed(2).padStart(6)}%  ` +
      `basis=${(report.basisBps === undefined ? '—' : (report.basisBps / 100).toFixed(2) + '%').padStart(8)}  ` +
      `cap=${(Number(capacityUsdg) / 1e6).toFixed(0).padStart(6)}  ` +
      `gap=${String(p.gapRisk).padStart(3)}`,
  );
}

const assets = items.map((i) => i.asset);

// 2 — publish
console.log(`\n  publishing ${assets.length} observations…`);
const hash = await client.writeContract({
  address: ORACLE,
  abi: oracleAbi,
  functionName: 'publishMany',
  args: [items],
});
const receipt = await client.waitForTransactionReceipt({ hash });
console.log(`  tx ${hash}`);
console.log(`  block ${receipt.blockNumber}  gas ${receipt.gasUsed}  status ${receipt.status}`);

/**
 * The public X Layer RPC load-balances across nodes, so a read issued straight
 * after a confirmed write can land on a node that has not synced that block and
 * return zeroes — a stale read, not an error. Wait until a node that has the
 * write answers before reading anything back.
 */
async function waitForState(probe: Address, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const o = await client.readContract({
      address: ORACLE,
      abi: oracleAbi,
      functionName: 'peek',
      args: [probe],
    });
    if (o.updatedAt !== 0n) {
      if (i > 0) console.log(`  (state visible after ${i + 1} reads — RPC nodes lag)`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('published state never became readable');
}
await waitForState(assets[0]!);
console.log();

// 3 — read it back and let the contract decide
console.log('  contract read-back + checkExecution (maxGapRisk 60, ≤100bp deviation)\n');
for (let i = 0; i < assets.length; i++) {
  const symbol = ASSETS.find((a) => ADDRESS_BY_SYMBOL[a.symbol] === assets[i])!.symbol;
  const obs = await client.readContract({
    address: ORACLE,
    abi: oracleAbi,
    functionName: 'peek',
    args: [assets[i]!],
  });

  // Execute exactly at fair value — the deviation term is then zero, so any
  // rejection here is the oracle's own state talking, not the price.
  const [ok, reason] = await client.readContract({
    address: ORACLE,
    abi: oracleAbi,
    functionName: 'checkExecution',
    args: [assets[i]!, obs.fairValueE8, 60, 100],
  });

  const decoded = reason === `0x${'0'.repeat(64)}` ? '' : Buffer.from(reason.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');
  console.log(
    `  ${symbol.padEnd(9)} onchain fv=${(Number(obs.fairValueE8) / 1e8).toFixed(2).padStart(12)}  ` +
      `gap=${String(obs.gapRisk).padStart(3)}  cap=${(Number(obs.capacityUsdg) / 1e6).toFixed(0).padStart(6)}  ` +
      `→ ${ok ? 'ALLOW' : `REJECT ${decoded}`}`,
  );
}
console.log();
