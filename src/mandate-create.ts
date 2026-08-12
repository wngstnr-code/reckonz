/**
 * Create a mandate, deliberately.
 *
 * `pnpm mandate` is a demo: it hardcodes three asset addresses, creates the
 * mandate with the deployer as its own executor and patches that afterwards
 * with `setExecutor`. Both are fine for a walkthrough and wrong for a mandate
 * that will hold money — the hardcoded addresses are the copy of the universe
 * this repo keeps deleting, and a mandate that is briefly its own executor is a
 * mandate in a state nobody designed.
 *
 *   TARGET=mainnet pnpm mandate:create wTSLAx,wNVDAx,wQQQx
 *   TARGET=mainnet pnpm mandate:create wTSLAx,wNVDAx 2      # 2 USDG per trade
 *
 * Symbols resolve through `addressBySymbol()`, so the allowlist cannot drift
 * from what is deployed. The executor comes from `src/deployments.ts` and is
 * set at creation, because `Executor.execute` checks `m.executor == address(this)`
 * before it will pull a single USDG.
 *
 * The agent is the owner. Anything else means handing a key the right to propose
 * against your mandate, which is a decision to make on purpose and not a default.
 */
import { formatUnits, parseUnits, type Address } from 'viem';
import { POLICY_GUARD_ABI } from './abi';
import { USDG } from './chain';
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

const SYMBOLS = process.argv[2];
const MAX_NOTIONAL = process.argv[3] ?? (process.env.MAX_NOTIONAL_USDG ?? '1');

if (!SYMBOLS) {
  console.error('usage: TARGET=mainnet pnpm mandate:create <sym,sym,…> [maxNotionalUsdg]');
  process.exit(1);
}

const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const GUARD = deployment.contracts.PolicyGuard as Address;
const EXECUTOR = deployment.contracts.Executor as Address;

const owner = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(owner, t);

console.log(`\n  PolicyGuard ${GUARD}  (${deployment.name}, chain ${chain.id})`);
console.log(`  executor    ${EXECUTOR}`);
console.log(`  owner/agent ${owner.address}\n`);

const index = await addressBySymbol();
const assets: Address[] = [];
for (const symbol of SYMBOLS.split(',').map((s) => s.trim()).filter(Boolean)) {
  const address = index.get(symbol);
  if (!address) {
    console.error(`  unknown symbol ${symbol} — it is not in XSTOCKS\n`);
    process.exit(1);
  }
  const token = await loadToken(address);
  console.log(`  allow  ${token.symbol.padEnd(8)} ${address}`);
  assets.push(address);
}

if (assets.length === 0) {
  console.error('\n  no assets given\n');
  process.exit(1);
}

const policy = {
  maxWeightBps: 4000,
  minCashBufferBps: 500,
  maxSlippageBps: 50,
  maxDeviationBps: 100,
  maxGapRisk: 60,
  maxNotionalPerTrade: parseUnits(MAX_NOTIONAL, USDG.decimals),
  maxFillsPerEpoch: 12,
  epochDuration: 86_400,
  // Off: the portfolio check costs a balance read per allowed asset on every
  // fill, and the per-trade caps already bound the damage.
  enforceWeights: false,
  minRebalanceInterval: 0,
} as const;

console.log(
  `\n  blast radius  ${MAX_NOTIONAL} ${USDG.symbol} per trade, ` +
    `${policy.maxFillsPerEpoch} fills per 24h`,
);
console.log(`  guard limits  ≤${policy.maxSlippageBps}bp slippage, ≤${policy.maxDeviationBps}bp off fair value, gap ≤${policy.maxGapRisk}`);

const hash = await wallet.writeContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'createMandate',
  args: [owner.address, EXECUTOR, policy, assets],
});
const receipt = await waitForReceipt(wallet, hash);
console.log(`\n  tx        ${hash}  (${receipt.status}, gas ${receipt.gasUsed})`);

// Found by scanning downwards for one this key owns rather than trusting
// `nextMandateId - 1`: that assumption is what made `pnpm execute` pick a closed
// mandate on the wrong executor. And the read is polled, because a confirmed
// write is not immediately readable on this chain (D18).
const mandateId = await waitUntil(
  async () => {
    const next = await wallet.readContract({
      address: GUARD,
      abi: POLICY_GUARD_ABI,
      functionName: 'nextMandateId',
    });
    for (let id = next - 1n; id > 0n && id > next - 6n; id--) {
      const m = await wallet.readContract({
        address: GUARD,
        abi: POLICY_GUARD_ABI,
        functionName: 'getMandate',
        args: [id],
      });
      if (
        m.active &&
        m.owner.toLowerCase() === owner.address.toLowerCase() &&
        m.executor.toLowerCase() === EXECUTOR.toLowerCase()
      ) {
        return id;
      }
    }
    return 0n;
  },
  (id) => id > 0n,
  { attempts: 30, delayMs: 500, what: 'the new mandate' },
);

const allowed = await wallet.readContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'allowedAssets',
  args: [mandateId],
});

console.log(`\n  mandate #${mandateId} created, allowing ${allowed.length} assets`);
console.log(`  max/trade ${formatUnits(policy.maxNotionalPerTrade, USDG.decimals)} ${USDG.symbol}`);
console.log(`\n  It has NO exit triggers yet. Until it does, nothing will ever tell it to`);
console.log(`  leave a position — it is bounded on size and price and nothing else:`);
console.log(`    TARGET=${t} pnpm mandate:edit ${mandateId} trigger add capacityUsdg lt 1000`);
console.log(`    TARGET=${t} pnpm mandate:show ${mandateId}\n`);
