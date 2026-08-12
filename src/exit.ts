/**
 * One real exit, end to end: size it, sign for exactly those units, ask the
 * guard, then sell the position back to USDG.
 *
 * The mirror of `execute.ts`, and it could not exist until `Executor.exit` did.
 * Until then the system could *detect* an exit condition and never act on one —
 * `ExitTriggers` evaluated it, `PolicyGuard.firedTriggers` reported it, and
 * every path that moved money bought.
 *
 *   TARGET=mainnet pnpm exit wSPYx 0.1      # sell ~$0.10 of wSPYx back to USDG
 *
 * Two things differ from the entry path, and both are the direction:
 *
 *  - The Permit2 authorisation is over the **asset**, not the settlement
 *    currency, so the owner must have approved Permit2 for that token.
 *  - Shortfall is measured *below* fair value. Selling badly means receiving
 *    less; the entry path's comparison would report zero for any sale under
 *    fair value. `Executor._exitShortfallBps` inverts it, and so does this.
 */
import { formatUnits, parseUnits, type Address } from 'viem';
import {
  ERC20_ABI,
  EXECUTOR_ABI,
  FAIR_VALUE_ORACLE_ABI,
  PERMIT2_ABI,
  POLICY_GUARD_ABI,
} from './abi';
import { ADDR, USDG } from './chain';
import { writeEvidence, type EvidenceBundle } from './evidence';
import { addressBySymbol, findAllPools, loadPool, loadToken, simulateExactInput } from './pool';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitForReceipt,
  waitUntil,
  walletFor,
} from './wallet';

const SYMBOL_OR_ADDRESS = process.argv[2];
const TARGET_USDG = process.argv[3] ?? '0.1';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
const SLIPPAGE_TOLERANCE_BPS = Number(process.env.SLIPPAGE_TOLERANCE_BPS ?? 100);
const MANDATE_ID = process.env.MANDATE_ID ? BigInt(process.env.MANDATE_ID) : null;
const THESIS_HASH = (process.env.THESIS_HASH ?? ZERO_HASH) as `0x${string}`;

if (!SYMBOL_OR_ADDRESS) {
  console.error('usage: TARGET=mainnet pnpm exit <symbol|address> [usdgTarget]');
  process.exit(1);
}

const t = target();
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
console.log(`  selling  ${token.symbol} for ~${TARGET_USDG} ${USDG.symbol}\n`);

// ------------------------------------------------- 1. size it from the pool

const held = await ownerWallet.readContract({
  address: asset,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [owner.address],
});
console.log(`  holding   ${formatUnits(held, token.decimals)} ${token.symbol}`);
if (held === 0n) {
  console.error(`\n  Nothing to sell. Buy some first with pnpm execute.\n`);
  process.exit(1);
}

// The oracle's fair value converts a dollar target into units. It is a guard,
// not a price — so it is used here only to *size* the trade, never to decide
// whether the fill was good. That judgement comes from what the pool paid.
// `peek` rather than `observation`: the latter reverts on stale, and a stale
// oracle is the single most likely reason an exit cannot proceed today (D51).
// Letting viem throw would answer a question the user is entitled to a sentence
// about with two hundred lines of stack trace.
const observation = await ownerWallet.readContract({
  address: ORACLE,
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'peek',
  args: [asset],
});

if (observation.updatedAt === 0n) {
  console.error(`\n  The oracle has never published a value for ${token.symbol}.\n`);
  process.exit(1);
}
if (!observation.hasValue || observation.fairValueE8 === 0n) {
  console.error(`\n  The oracle has no publishable value for ${token.symbol}. Refusing to size a`);
  console.error(`  trade against a number it will not stand behind.\n`);
  process.exit(1);
}

const maxAge = await ownerWallet.readContract({
  address: ORACLE,
  abi: FAIR_VALUE_ORACLE_ABI,
  functionName: 'maxAge',
});
const ageSeconds = BigInt(Math.floor(Date.now() / 1000)) - observation.updatedAt;

// A warning, not a refusal — and the difference is the whole of D56. A guard
// built before it rejects a stale exit with STALE; a guard built after it lets
// the position out. Deciding here which of those is deployed would be this
// script guessing at the chain's rules, so it says what it sees and lets
// `dryRun` below give the authoritative answer.
//
// The sizing above still used this value, because a stale estimate is the only
// estimate there is. What protects the fill is `minAmountOutUsdg`, derived from
// the pool simulation rather than from the oracle.
if (ageSeconds > maxAge) {
  console.log(
    `\n  ⚠ the oracle's ${token.symbol} value is ${(Number(ageSeconds) / 60).toFixed(0)} min old,` +
      ` past its ${Number(maxAge) / 60} min maxAge.`,
  );
  console.log(`    Sizing used it anyway — it is the only estimate available — so the real`);
  console.log(`    protection on this fill is the min-out floor, not the oracle.`);
  console.log(`    Publishing first would be better:  TARGET=mainnet pnpm oracle:publish`);
}

const targetUsdg = parseUnits(TARGET_USDG, USDG.decimals);
// units = usd / price, at chain precision throughout
const units =
  (targetUsdg * 10n ** BigInt(token.decimals) * 100n) / observation.fairValueE8;

if (units === 0n) {
  console.error(`\n  ${TARGET_USDG} ${USDG.symbol} rounds to zero units of ${token.symbol}.\n`);
  process.exit(1);
}
if (units > held) {
  console.error(
    `\n  Would need ${formatUnits(units, token.decimals)} ${token.symbol} and only` +
      ` ${formatUnits(held, token.decimals)} is held.\n`,
  );
  process.exit(1);
}

// --------------------------------------------- 2. simulate every fee tier

const candidates = await findAllPools(asset, cash);
if (candidates.length === 0) {
  console.error(`\n  No ${token.symbol}/${USDG.symbol} pool on this chain.\n`);
  process.exit(1);
}

let best: { fee: number; out: bigint } | null = null;
for (const candidate of candidates) {
  const pool = await loadPool(candidate.address);
  // Selling the asset: it is the input. `zeroForOne` is true when the input
  // token sorts first, which is exactly how `V3Swapper` derives it.
  const zeroForOne = pool.token0.address.toLowerCase() === asset.toLowerCase();
  const result = simulateExactInput(pool, units, zeroForOne);
  const out = result.amountOut < 0n ? -result.amountOut : result.amountOut;
  console.log(
    `  fee ${String(candidate.fee).padStart(5)}  ->  ${formatUnits(out, USDG.decimals)} ${USDG.symbol}`,
  );
  if (out > 0n && (best === null || out > best.out)) best = { fee: candidate.fee, out };
}

if (!best) {
  console.error(`\n  No pool could absorb the sale.\n`);
  process.exit(1);
}

const minAmountOut = (best.out * BigInt(10_000 - SLIPPAGE_TOLERANCE_BPS)) / 10_000n;
// Settlement currency paid per whole asset unit, 8dp — the same arithmetic as
// `Executor._priceE8`, so the guard sees the number the contract will compute.
const executionPriceE8 =
  (best.out * 10n ** BigInt(token.decimals) * 100_000_000n) /
  (units * 10n ** BigInt(USDG.decimals));

// Inverted against the entry path, deliberately. See the header.
const shortfallBps =
  executionPriceE8 >= observation.fairValueE8
    ? 0
    : Number(
        ((observation.fairValueE8 - executionPriceE8) * 10_000n) / observation.fairValueE8,
      );

console.log(
  `\n  selling   ${formatUnits(units, token.decimals)} ${token.symbol}` +
    ` -> ${formatUnits(best.out, USDG.decimals)} ${USDG.symbol} at fee ${best.fee}`,
);
console.log(`  price     ${formatUnits(executionPriceE8, 8)} ${USDG.symbol} per ${token.symbol}`);
console.log(`  fair      ${formatUnits(observation.fairValueE8, 8)}`);
console.log(`  shortfall ${shortfallBps} bps below fair value`);

// ------------------------------------------------------------ 3. the guard

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
      // Same three conditions as `execute.ts`: owned, active, and pointing at
      // the executor this build targets. Any one of them missing means the
      // mandate cannot be used, however recent it is.
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

console.log(`\n  mandate   #${mandateId}`);

const [ok, reason, offending] = await ownerWallet.readContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'dryRun',
  args: [
    mandateId,
    [
      {
        asset,
        isExit: true,
        amountInUsdg: best.out,
        amountOut: units,
        executionPriceE8,
        slippageBps: shortfallBps,
        fairValueE8: 0n,
        gapRisk: 0,
      },
    ],
  ],
});

if (!ok) {
  const decoded = Buffer.from(reason.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');
  console.error(`\n  guard would REJECT: ${decoded}  ${offending}`);
  console.error('  Refusing to spend gas on a transaction the guard will revert.\n');
  process.exit(1);
}
console.log(`  dryRun    ALLOW`);

// ------------------------------- 3b. the evidence this decision rests on

// The exit's bundle records the one thing that matters most on the way out:
// how old the oracle's view was when the decision was taken. Since D56 a stale
// value no longer blocks an exit, so the age is no longer implied by the fill
// having happened — it has to be written down (D57).
const bundle: EvidenceBundle = {
  kind: 'exit',
  chainId: chain.id,
  decidedAt: Math.floor(Date.now() / 1000),
  mandateId: mandateId.toString(),
  executor: EXECUTOR,
  guard: GUARD,
  thesisHash: THESIS_HASH,
  legs: [
    {
      asset,
      symbol: token.symbol,
      amountIn: units.toString(),
      minAmountOut: minAmountOut.toString(),
      feeTier: best.fee,
      simulatedOut: best.out.toString(),
      impactBps: null,
    },
  ],
  observations: [
    {
      asset,
      fairValueE8: observation.fairValueE8.toString(),
      confidenceBps: Number(observation.confidenceBps),
      gapRisk: Number(observation.gapRisk),
      capacityUsdg: observation.capacityUsdg.toString(),
      updatedAt: Number(observation.updatedAt),
      ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - Number(observation.updatedAt)),
      hasValue: observation.hasValue,
    },
  ],
  dryRun: { ok, reason: 'ALLOW', offendingAsset: null },
};

const EVIDENCE_HASH = await writeEvidence(bundle);
console.log(`  evidence  ${EVIDENCE_HASH}`);

// --------------------------------- 4. Permit2, over the asset being sold

const allowance = await ownerWallet.readContract({
  address: asset,
  abi: ERC20_ABI,
  functionName: 'allowance',
  args: [owner.address, ADDR.permit2],
});
if (allowance < units) {
  console.log(`\n  approving Permit2 to move ${token.symbol}…`);
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
    (a) => a >= units,
    { what: 'Permit2 allowance' },
  );
  console.log(`  approved`);
}

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
    permitted: [{ token: asset, amount: units }],
    spender: EXECUTOR,
    nonce,
    deadline,
  },
});

console.log(
  `\n  permit    ${formatUnits(units, token.decimals)} ${token.symbol} max, nonce ${nonce}` +
    `\n            over the asset, not the cash — spender is the executor and nothing else`,
);

// -------------------------------------------------------------- 5. exit

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
    [{ asset, amountIn: units, minAmountOutUsdg: minAmountOut, fee: best.fee }],
    { permitted: [{ token: asset, amount: units }], nonce, deadline },
    signature,
    THESIS_HASH,
    EVIDENCE_HASH,
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
