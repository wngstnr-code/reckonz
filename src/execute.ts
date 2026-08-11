/**
 * One real fill, end to end: quote it, sign for exactly that amount, ask the
 * guard whether it would allow it, then execute.
 *
 * This is the piece that was missing. Everything else in the repo could reason
 * about a trade; nothing could place one — there was no Permit2 signature and
 * no V3 path anywhere in the codebase, so `Executor` had never been called
 * outside a unit test.
 *
 *   TARGET=mainnet pnpm execute wMUx 25        # 25 USDG into wMUx
 *
 * The owner signs the Permit2 authorisation; the agent sends the transaction.
 * They may be the same key (OWNER_KEY / AGENT_KEY, both defaulting to
 * PRIVATE_KEY), and the split exists because on a real deployment they are not.
 *
 * Note this only does anything real on mainnet: the Universal Router has no
 * code on X Layer testnet and no xStock pools exist there.
 */
import {
  formatUnits,
  parseUnits,
  type Address,
} from 'viem';
import {
  ERC20_ABI,
  EXECUTOR_ABI,
  FAIR_VALUE_ORACLE_ABI,
  PERMIT2_ABI,
  POLICY_GUARD_ABI,
  RECEIPT_REGISTRY_ABI,
} from './abi';
import { ADDR, USDG } from './chain';
import { bestQuote, loadVenues } from './planner';
import { loadToken } from './pool';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitUntil,
  walletFor,
} from './wallet';

const SYMBOL_OR_ADDRESS = process.argv[2];
const AMOUNT_USDG = process.argv[3] ?? '25';
/** How far below the simulated output the router may fill before it reverts. */
const SLIPPAGE_TOLERANCE_BPS = Number(process.env.SLIPPAGE_TOLERANCE_BPS ?? 100);
const MANDATE_ID = process.env.MANDATE_ID ? BigInt(process.env.MANDATE_ID) : null;

if (!SYMBOL_OR_ADDRESS) {
  console.error('usage: TARGET=mainnet pnpm execute <symbol|address> [usdgAmount]');
  process.exit(1);
}

const XSTOCKS: Record<string, Address> = {
  wSPYx: '0xe7e553cd128f0011777323a0b44a7b96ea1cb540',
  wNVDAx: '0xa8ddb5cd96b5222afe198316e9a57caa642850d5',
  wSPCXx: '0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072',
  wCRCLx: '0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8',
  wINTCx: '0x33aa35b0271fffe2048cc093ab7fe60931786719',
  wMUx: '0xe2047ee3bddb5c99ae428ab83df63f8730698e30',
  wSKHYx: '0x6215a58ed045d71f2561aaabe54f4c885c522998',
  wSNDKx: '0x75e82e2884ea10f72fca777449b73377f4646219',
};

const asset = (XSTOCKS[SYMBOL_OR_ADDRESS] ?? SYMBOL_OR_ADDRESS) as Address;

// ------------------------------------------------------------------- setup

const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);

const owner = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const agent = accountFrom('AGENT_KEY', 'PRIVATE_KEY');
const ownerWallet = walletFor(owner, t);
const agentWallet = walletFor(agent, t);

const EXECUTOR = deployment.contracts.Executor as Address;
const GUARD = deployment.contracts.PolicyGuard as Address;
const ORACLE = deployment.contracts.FairValueOracle as Address;

// The planner reads pool state through the mainnet client, because that is the
// only chain where xStock pools exist. On testnet that would price the trade
// against liquidity the target chain does not have, and the Universal Router
// has no code there anyway — so the quote would be fiction and the swap would
// revert. Refuse rather than print a number that means nothing.
if (t === 'testnet' && process.env.FORCE_TESTNET !== '1') {
  console.error(
    '\n  This script only means anything on mainnet: X Layer testnet has no xStock\n' +
      '  pools and no Universal Router code, and the quote below would be read from\n' +
      '  mainnet liquidity. Run with TARGET=mainnet, or FORCE_TESTNET=1 to override.\n',
  );
  process.exit(1);
}

console.log(`\n  Reckonz — one fill on ${deployment.name} (chain ${chain.id})\n`);
console.log(`  executor  ${EXECUTOR}`);
console.log(`  owner     ${owner.address}`);
console.log(`  agent     ${agent.address}`);

// The settlement currency is whatever the deployed executor was built with —
// asking the contract is the only answer that cannot drift.
const cash = await ownerWallet.readContract({
  address: EXECUTOR,
  abi: EXECUTOR_ABI,
  functionName: 'cash',
});
const cashDecimals = await ownerWallet.readContract({
  address: cash,
  abi: ERC20_ABI,
  functionName: 'decimals',
});
const amountIn = parseUnits(AMOUNT_USDG, cashDecimals);
console.log(`  cash      ${cash} (${cashDecimals} decimals)`);

// ------------------------------------------------------- 1. quote the leg

const venues = await loadVenues(asset);
if (venues.length === 0) throw new Error(`no USDG pool for ${SYMBOL_OR_ADDRESS} on ${t}`);

const quoted = bestQuote(venues, amountIn);
if (!quoted) throw new Error('no venue could quote this size');

const token = await loadToken(asset);
const feeTier = quoted.venue.pool.fee;

const minAmountOut =
  (quoted.result.amountOut * BigInt(10_000 - SLIPPAGE_TOLERANCE_BPS)) / 10_000n;

console.log(
  `\n  quote     ${AMOUNT_USDG} ${USDG.symbol} -> ${quoted.out.toFixed(6)} ${token.symbol}` +
    `  @ ${quoted.effectivePrice.toFixed(4)}  (fee tier ${feeTier}, impact ${(quoted.impactBps / 100).toFixed(2)}%)`,
);
console.log(`  min out   ${formatUnits(minAmountOut, token.decimals)} ${token.symbol}`);
console.log(`  fee tier  ${feeTier} (${feeTier / 10_000}%) — the executor derives the pool from it`);

// ------------------------------------------------------ 2. the mandate

const mandateId =
  MANDATE_ID ??
  (await (async () => {
    const next = await ownerWallet.readContract({
      address: GUARD,
      abi: POLICY_GUARD_ABI,
      functionName: 'nextMandateId',
    });
    if (next <= 1n) throw new Error('no mandate exists — run pnpm mandate first');
    return next - 1n;
  })());

const mandate = await ownerWallet.readContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'getMandate',
  args: [mandateId],
});

console.log(`\n  mandate   #${mandateId}  owner ${mandate.owner}  agent ${mandate.agent}`);
if (mandate.executor.toLowerCase() !== EXECUTOR.toLowerCase()) {
  throw new Error(`mandate #${mandateId} points at executor ${mandate.executor}, not ${EXECUTOR}`);
}
if (mandate.owner.toLowerCase() !== owner.address.toLowerCase()) {
  throw new Error(`mandate #${mandateId} is owned by ${mandate.owner}, not the signing key`);
}
if (mandate.agent.toLowerCase() !== agent.address.toLowerCase()) {
  throw new Error(`mandate #${mandateId} expects agent ${mandate.agent}, not ${agent.address}`);
}

// ------------------------------------------- 3. predict the fill, then ask

const observation = await ownerWallet.readContract({
  address: ORACLE,
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'peek',
  args: [asset],
});

// Mirrors Executor._priceE8 exactly: settlement paid per whole asset unit, 8dp.
const executionPriceE8 =
  (amountIn * 10n ** BigInt(token.decimals) * 100_000_000n) /
  (quoted.result.amountOut * 10n ** BigInt(cashDecimals));

// Mirrors Executor._shortfallBps: measured against the oracle, not the quote.
const slippageBps =
  observation.hasValue && observation.fairValueE8 > 0n && executionPriceE8 > observation.fairValueE8
    ? Number(
        ((executionPriceE8 - observation.fairValueE8) * 10_000n) / observation.fairValueE8,
      )
    : 0;

console.log(
  `  oracle    fv ${(Number(observation.fairValueE8) / 1e8).toFixed(4)}` +
    `  gap ${observation.gapRisk}  ${observation.hasValue ? 'published' : 'WITHHELD'}` +
    `  age ${Math.max(0, Math.floor(Date.now() / 1000) - Number(observation.updatedAt))}s`,
);
console.log(
  `  predicted price ${(Number(executionPriceE8) / 1e8).toFixed(4)}, shortfall ${slippageBps}bp`,
);

const predictedFill = {
  asset,
  isExit: false,
  amountInUsdg: amountIn,
  amountOut: quoted.result.amountOut,
  executionPriceE8,
  slippageBps,
  fairValueE8: 0n,
  gapRisk: 0,
};

const [ok, reason, offending] = await ownerWallet.readContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'dryRun',
  args: [mandateId, [predictedFill]],
});

if (!ok) {
  const decoded = Buffer.from(reason.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');
  console.error(`\n  guard would REJECT: ${decoded}  ${offending}\n`);
  console.error('  Refusing to spend gas on a transaction the guard will revert.\n');
  process.exit(1);
}
console.log(`  dryRun    ALLOW`);

// --------------------------------------------- 4. Permit2, scoped to this fill

// Permit2 pulls through the ERC20 allowance the owner grants it once. Without
// this the signature is valid and the transfer still fails.
const allowance = await ownerWallet.readContract({
  address: cash,
  abi: ERC20_ABI,
  functionName: 'allowance',
  args: [owner.address, ADDR.permit2],
});
if (allowance < amountIn) {
  console.log(`\n  approving Permit2 to move ${USDG.symbol}…`);
  const hash = await ownerWallet.writeContract({
    address: cash,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ADDR.permit2, (1n << 160n) - 1n],
  });
  await ownerWallet.waitForTransactionReceipt({ hash });
  await waitUntil(
    () =>
      ownerWallet.readContract({
        address: cash,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner.address, ADDR.permit2],
      }),
    (a) => a >= amountIn,
    { what: 'Permit2 allowance' },
  );
  console.log(`  approved`);
}

/**
 * Permit2 signature-transfer nonces are unordered: any unused bit in the
 * owner's bitmap will do. Scanning for one is what makes a re-run safe — a
 * reused nonce reverts, and reusing one accidentally is the easy mistake.
 */
async function unusedNonce(): Promise<bigint> {
  for (let word = 0n; word < 16n; word++) {
    const bitmap = await ownerWallet.readContract({
      address: ADDR.permit2,
      abi: PERMIT2_ABI,
      functionName: 'nonceBitmap',
      args: [owner.address, word],
    });
    for (let bit = 0n; bit < 256n; bit++) {
      if ((bitmap >> bit) % 2n === 0n) return word * 256n + bit;
    }
  }
  throw new Error('no unused Permit2 nonce found in the first 16 words');
}

const nonce = await unusedNonce();
const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

// The signed struct carries `spender`; the struct passed as calldata does not.
// Permit2 reconstructs it from msg.sender, which is why only the executor named
// here can ever use this signature.
const signature = await ownerWallet.signTypedData({
  account: owner,
  domain: { name: 'Permit2', chainId: chain.id, verifyingContract: ADDR.permit2 },
  types: {
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    PermitBatchTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions[]' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'PermitBatchTransferFrom',
  message: {
    permitted: [{ token: cash, amount: amountIn }],
    spender: EXECUTOR,
    nonce,
    deadline,
  },
});

console.log(
  `\n  permit    ${AMOUNT_USDG} ${USDG.symbol} max, nonce ${nonce}, expires in 20 min` +
    `\n            spender is the executor and nothing else`,
);

// ------------------------------------------------------------ 5. execute

const before = await ownerWallet.readContract({
  address: asset,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [owner.address],
});

console.log(`\n  executing…`);
const hash = await agentWallet.writeContract({
  address: EXECUTOR,
  abi: EXECUTOR_ABI,
  functionName: 'execute',
  args: [
    mandateId,
    [{ asset, amountInUsdg: amountIn, minAmountOut, fee: feeTier }],
    { permitted: [{ token: cash, amount: amountIn }], nonce, deadline },
    signature,
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    '',
  ],
});
const receipt = await agentWallet.waitForTransactionReceipt({ hash });
console.log(`  tx        ${hash}  (${receipt.status}, gas ${receipt.gasUsed})`);

const after = await ownerWallet.readContract({
  address: asset,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [owner.address],
});

console.log(
  `\n  received  ${formatUnits(after - before, token.decimals)} ${token.symbol}` +
    `  (into the user's own wallet — the executor never held it)\n`,
);
