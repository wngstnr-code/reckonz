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
  THESIS_REGISTRY_ABI,
} from './abi';
import { ADDR, USDG } from './chain';
import { bestQuote, loadVenues } from './planner';
import { addressBySymbol, loadToken } from './pool';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitUntil,
  walletFor,
  waitForReceipt,} from './wallet';

const SYMBOL_OR_ADDRESS = process.argv[2];
const AMOUNT_USDG = process.argv[3] ?? '1';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
/** How far below the simulated output the router may fill before it reverts. */
const SLIPPAGE_TOLERANCE_BPS = Number(process.env.SLIPPAGE_TOLERANCE_BPS ?? 100);
const MANDATE_ID = process.env.MANDATE_ID ? BigInt(process.env.MANDATE_ID) : null;

if (!SYMBOL_OR_ADDRESS) {
  console.error('usage: TARGET=mainnet pnpm execute <symbol|address> [usdgAmount]');
  process.exit(1);
}

// Symbols resolve against the chain, not a literal. The eight-entry map that
// used to live here was the last copy of the universe in a script, and it went
// stale the way copies do: `pnpm execute wTSLAx` failed with "invalid address"
// on an asset that has traded on X Layer all along.
let asset: Address;
if (SYMBOL_OR_ADDRESS.startsWith('0x')) {
  asset = SYMBOL_OR_ADDRESS as Address;
} else {
  const index = await addressBySymbol();
  const found = index.get(SYMBOL_OR_ADDRESS);
  if (!found) {
    throw new Error(
      `no xStock called ${SYMBOL_OR_ADDRESS} on this chain — known: ${[...index.keys()].join(', ')}`,
    );
  }
  asset = found;
}

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

// A simulation that ran past its prefetched tick window stopped early and
// priced only the input it managed to consume, so `minAmountOut` derived from
// it would be far too low — slippage protection that protects nothing. D34 was
// the same mistake in `capacity()`; refuse the quote rather than ship it.
if (quoted.result.exhaustedWindow) {
  throw new Error(
    `the quote for ${AMOUNT_USDG} USDG ran past the prefetched tick window, so it is a lower ` +
      `bound rather than a price. Execute a smaller size.`,
  );
}

/**
 * The thesis this fill expresses, if any.
 *
 * A fill with a zero hash is not a lie, it is just an untethered trade — the
 * receipt records what happened without claiming a reason. A fill *with* a hash
 * is a claim that reasoning published earlier produced this trade, and that
 * claim is checkable: `ThesisRegistry.publishedAt < receipt.timestamp`.
 */
const THESIS_HASH = (process.env.THESIS_HASH ?? ZERO_HASH) as `0x${string}`;

const minAmountOut =
  (quoted.result.amountOut * BigInt(10_000 - SLIPPAGE_TOLERANCE_BPS)) / 10_000n;

console.log(
  `\n  quote     ${AMOUNT_USDG} ${USDG.symbol} -> ${quoted.out.toFixed(6)} ${token.symbol}` +
    `  @ ${quoted.effectivePrice.toFixed(4)}  (fee tier ${feeTier}, impact ${(quoted.impactBps / 100).toFixed(2)}%)`,
);
console.log(`  min out   ${formatUnits(minAmountOut, token.decimals)} ${token.symbol}`);
// The executor derives the pool from (cash, asset, fee); we quoted against a
// pool found through the factory. They must be the same pool or the fill happens
// somewhere the quote never looked. Asking the contract is a free read, and it
// is the check that would have caught D35 before it cost a transaction.
const derivedPool = await ownerWallet.readContract({
  address: EXECUTOR,
  abi: EXECUTOR_ABI,
  functionName: 'poolFor',
  args: [cash, asset, feeTier],
});
if (derivedPool.toLowerCase() !== quoted.venue.pool.address.toLowerCase()) {
  throw new Error(
    `the executor would swap in ${derivedPool} but this quote came from ` +
      `${quoted.venue.pool.address}. Refusing to execute against a pool we did not price.`,
  );
}

console.log(
  `  fee tier  ${feeTier} (${feeTier / 10_000}%) -> pool ${derivedPool}, matches the quote`,
);

// The receipt will carry this hash forever, so check now that it resolves to a
// published thesis. A hash that is not in the registry would produce a receipt
// pointing at reasoning nobody can read — worse than an untethered fill, because
// it looks like evidence.
if (THESIS_HASH !== ZERO_HASH) {
  const REGISTRY = deployment.contracts.ThesisRegistry as Address | undefined;
  if (!REGISTRY) throw new Error('THESIS_HASH set but no ThesisRegistry deployed on this chain');

  const [thesisId, exists] = await ownerWallet.readContract({
    address: REGISTRY,
    abi: THESIS_REGISTRY_ABI,
    functionName: 'idOf',
    args: [THESIS_HASH],
  });
  if (!exists) {
    throw new Error(
      `thesis ${THESIS_HASH} is not published on ${deployment.name}. ` +
        `Run \`pnpm thesis:publish\` first — a receipt must not point at reasoning nobody can read.`,
    );
  }
  const thesis = await ownerWallet.readContract({
    address: REGISTRY,
    abi: THESIS_REGISTRY_ABI,
    functionName: 'get',
    args: [thesisId],
  });
  console.log(
    `\n  thesis    #${thesisId} by ${thesis.author}` +
      `\n            published ${new Date(Number(thesis.publishedAt) * 1000).toISOString()} — before this fill`,
  );
} else {
  console.log(`\n  thesis    none (THESIS_HASH unset — this fill claims no reasoning)`);
}

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
  await waitForReceipt(ownerWallet, hash);
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
    THESIS_HASH,
    ZERO_HASH, // evidenceHash — the bundle is not pinned yet
    '',
  ],
});
const receipt = await waitForReceipt(agentWallet, hash);
console.log(`  tx        ${hash}  (${receipt.status}, gas ${receipt.gasUsed})`);

// The balance has to be polled, not read once. A confirmed receipt does not
// mean the next read lands on a node that has seen the block, and this one
// silently returned the pre-trade balance — so a fill that moved 0.0015091
// wTSLAx printed `received 0`. The trade was fine; the evidence was wrong,
// which is the worse of the two. See D18.
const after = await waitUntil(
  () =>
    ownerWallet.readContract({
      address: asset,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner.address],
    }),
  (b) => b > before,
  { attempts: 30, delayMs: 500, what: `the ${token.symbol} the fill bought` },
);

console.log(
  `\n  received  ${formatUnits(after - before, token.decimals)} ${token.symbol}` +
    `  (into the user's own wallet — the executor never held it)\n`,
);
