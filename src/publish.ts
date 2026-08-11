/**
 * Runs the fair-value engine and publishes the result to the deployed
 * FairValueOracle, then reads it back and asks the contract for an execution
 * decision. This is the loop end to end on a real chain.
 *
 * Assets are keyed by their **X Layer mainnet** addresses even when publishing
 * to testnet — the oracle is an address-keyed registry, and reusing the real
 * identifiers keeps testnet observations comparable to mainnet ones.
 */
import { type Address } from 'viem';
import { FAIR_VALUE_ORACLE_ABI } from './abi';
import { ASSETS, computeFairValue, toOraclePayload } from './fairvalue';
import { capacity, loadVenues } from './planner';
import { addressBySymbol } from './pool';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitUntil,
  walletFor,
} from './wallet';

/** Impact limit the published capacity is measured at. */
const REFERENCE_IMPACT_BPS = Number(process.env.REFERENCE_IMPACT_BPS ?? 50);

// Chain and addresses both come from TARGET, so this script cannot publish to
// one chain while reporting another. Defaulting to the recorded deployment
// rather than a literal also keeps it off older contracts that are still live.
const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const ORACLE = (process.env.ORACLE_ADDRESS ??
  deployment.contracts.FairValueOracle) as Address;

// Symbols joined to addresses by reading the chain, so this script cannot carry
// a stale copy of the universe. Mainnet addresses even when publishing to
// testnet — see the header.
const ADDRESS_BY_SYMBOL = await addressBySymbol();

const account = accountFrom('PUBLISHER_KEY', 'PRIVATE_KEY');
const client = walletFor(account, t);

console.log(`\n  FairValueOracle ${ORACLE}  (${deployment.name}, chain ${chain.id})`);
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
  const address = ADDRESS_BY_SYMBOL.get(spec.symbol);
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
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'publishMany',
  args: [items],
});
const receipt = await client.waitForTransactionReceipt({ hash });
console.log(`  tx ${hash}`);
console.log(`  block ${receipt.blockNumber}  gas ${receipt.gasUsed}  status ${receipt.status}`);

// The public X Layer RPC load-balances, so a read issued straight after a
// confirmed write can land on a node that has not synced the block and return
// zeroes — a stale read, not an error. See D18.
await waitUntil(
  () =>
    client.readContract({
      address: ORACLE,
      abi: FAIR_VALUE_ORACLE_ABI,
      functionName: 'peek',
      args: [assets[0]!],
    }),
  (o) => o.updatedAt !== 0n,
  { attempts: 20, delayMs: 500, what: 'the published observation' },
);
console.log();

// 3 — read it back and let the contract decide
console.log('  contract read-back + checkExecution (maxGapRisk 60, ≤100bp deviation)\n');
for (let i = 0; i < assets.length; i++) {
  const symbol = ASSETS.find((a) => ADDRESS_BY_SYMBOL.get(a.symbol) === assets[i])!.symbol;
  const obs = await client.readContract({
    address: ORACLE,
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'peek',
    args: [assets[i]!],
  });

  // Execute exactly at fair value — the deviation term is then zero, so any
  // rejection here is the oracle's own state talking, not the price.
  const [ok, reason] = await client.readContract({
    address: ORACLE,
    abi: FAIR_VALUE_ORACLE_ABI,
    functionName: 'checkExecution',
    args: [assets[i]!, obs.fairValueE8, 60, 100],
  });

  const decoded = reason === `0x${'0'.repeat(64)}` ? '' : Buffer.from(reason.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');
  console.log(
    `  ${symbol.padEnd(9)} onchain fv=${(Number(obs.fairValueE8) / 1e8).toFixed(2).padStart(12)}  ` +
      `gap=${String(obs.gapRisk).padStart(3)}  cap=${(Number(obs.capacityUsdg) / 1e6).toFixed(0).padStart(6)}  ` +
      `→ ${ok ? 'ALLOW' : `REJECT ${decoded}`}`,
  );

  // A value the contract's jump bound refused comes back withheld even though
  // we sent one. Reporting it is not optional: a publisher that cannot tell
  // "the oracle declined my number" from "I published a withhold" would keep
  // resending and never learn it has to confirm.
  const sent = items.find((it) => it.asset === assets[i])!;
  if (sent.hasValue && !obs.hasValue) {
    const a = await client.readContract({
      address: ORACLE,
      abi: FAIR_VALUE_ORACLE_ABI,
      functionName: 'anchorOf',
      args: [assets[i]!],
    });
    const jumpPct =
      a.valueE8 === 0n
        ? '—'
        : `${((Number(sent.fairValueE8 - a.valueE8) / Number(a.valueE8)) * 100).toFixed(1)}%`;
    console.log(
      `  ${''.padEnd(9)} withheld by the publish bound: ${(Number(sent.fairValueE8) / 1e8).toFixed(2)} is ` +
        `${jumpPct} from the anchor ${(Number(a.valueE8) / 1e8).toFixed(2)}. ` +
        `Re-publish the same value after JUMP_CONFIRM_DELAY to confirm it.`,
    );
  }
}
console.log();
