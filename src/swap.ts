/**
 * OKB → USDG, so a mainnet deployer can fund itself without leaving the repo.
 *
 * `pnpm execute` needs USDG in the owner's wallet, and there is no direct route:
 * both WOKB/USDG pools on X Layer hold about four dollars between them. The
 * liquidity is in WOKB/USDT0 (0.05%) and USDT0/USDG (0.01%), so this is one
 * multi-hop V3 swap through USDT0.
 *
 * It exists instead of a wallet UI because the swap has to land in the *deployer's*
 * own address — the one derived from PRIVATE_KEY. Swapping in a browser wallet
 * puts the USDG somewhere `Executor` will never look for it, and importing the
 * deploy key into a wallet app to fix that spreads a key that is also the admin
 * of every contract in the stack.
 *
 * The call pattern is `Executor._swap`'s, which is the one verified against the
 * live Universal Router: fund the router, then V3_SWAP_EXACT_IN with
 * `payerIsUser: false`. Native OKB is wrapped here rather than with the router's
 * WRAP_ETH command, so the only command byte involved is the one already proven
 * on mainnet, and `deposit()` is plain WETH9 confirmed present in WOKB's code.
 *
 *     TARGET=mainnet pnpm swap [okb]     # default: everything above the gas reserve
 */
import {
  encodeAbiParameters,
  formatEther,
  formatUnits,
  parseEther,
  type Address,
} from 'viem';
import { ERC20_ABI } from './abi';
import { ADDR, USDG, USDT0 } from './chain';
import { loadPool, simulateExactInput } from './pool';
import { accountFrom, chainFor, target, walletFor, waitUntil } from './wallet';

/** WETH9-style wrapper for the gas token. `deposit()`/`withdraw()` confirmed on-chain. */
const WOKB = '0xe538905cf8410324e03a5a23c1c177a474d59b2b' as Address;

const WOKB_ABI = [
  { type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' },
] as const;

const ROUTER_ABI = [
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

/** Universal Router command. Same constant `Executor.sol` uses. */
const V3_SWAP_EXACT_IN = '0x00';

/** Leave this much OKB behind for gas — ~30x the whole deploy-to-fill sequence. */
const GAS_RESERVE = parseEther('0.005');

/** Tolerated shortfall against the simulated output, in bps. */
const SLIPPAGE_BPS = 100n;

/**
 * `V3_SWAP_EXACT_IN`'s input tuple, encoded exactly as `Executor.sol` encodes it:
 * recipient, amountIn, amountOutMin, path, payerIsUser. `payerIsUser` is false
 * because the router has already been funded and pays itself.
 */
function encodeSwapInput(
  recipient: Address,
  amountIn: bigint,
  minOut: bigint,
  path: `0x${string}`,
): `0x${string}` {
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }],
    [recipient, amountIn, minOut, path, false],
  );
}

/** Uniswap V3 multi-hop path: token | fee | token | fee | token, fees big-endian over 3 bytes. */
function encodeMultiPath(hops: [Address, number, Address][]): `0x${string}` {
  let out = hops[0]![0].slice(2);
  for (const [, fee, tokenOut] of hops) {
    out += fee.toString(16).padStart(6, '0') + tokenOut.slice(2);
  }
  return `0x${out}`.toLowerCase() as `0x${string}`;
}

/**
 * Wait for a transaction, and do not let the wait itself fail the run.
 *
 * The public RPC load-balances, so `eth_getBlockByNumber` for a block we just
 * mined can land on a node that has not seen it and answer `block is out of
 * range` — which killed a run *after* its transaction had already succeeded.
 * The receipt is a convenience here; the state poll that follows every call is
 * the real confirmation, so a failed wait is reported and stepped over.
 */
async function settle(hash: `0x${string}`): Promise<bigint | null> {
  try {
    const receipt = await wallet.waitForTransactionReceipt({ hash, timeout: 120_000 });
    return receipt.gasUsed;
  } catch (e) {
    console.log(`  (receipt unavailable: ${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return null;
  }
}

const t = target();
const chain = chainFor(t);
const account = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(account, t);

if (t !== 'mainnet') {
  throw new Error(
    'swap is mainnet-only: the USDG and USDT0 pools it routes through exist on chain 196. ' +
      'Run with TARGET=mainnet.',
  );
}

console.log(`\n  OKB → USDG  (${chain.name}, chain ${chain.id})`);
console.log(`  wallet    ${account.address}`);

// ------------------------------------------------------------ 1. what to swap

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const requested = args.find((a) => !a.startsWith('--'));

const wokbOf = (who: Address) =>
  wallet.readContract({ address: WOKB, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });

const balance = await wallet.getBalance({ address: account.address });
const heldWokb = await wokbOf(account.address);
// WOKB already sitting with the router belongs to this leg too — an earlier run
// funded it and died before the swap landed.
const routerHeld = await wokbOf(ADDR.universalRouter);
const alreadyWrapped = heldWokb + routerHeld;
const amountIn = requested ? parseEther(requested) : balance + alreadyWrapped - GAS_RESERVE;

// Only the part that is not already wrapped comes out of the OKB balance.
// Charging the rest against the gas reserve again would refuse a swap that is
// already paid for.
const toWrap = amountIn > alreadyWrapped ? amountIn - alreadyWrapped : 0n;
const gasLeft = balance - toWrap;

console.log(
  `\n  balance   ${formatEther(balance)} OKB` +
    (heldWokb > 0n ? ` + ${formatEther(heldWokb)} WOKB held` : '') +
    (routerHeld > 0n ? ` + ${formatEther(routerHeld)} WOKB already with the router` : ''),
);
console.log(`  swapping  ${formatEther(amountIn)} OKB`);
console.log(`  reserve   ${formatEther(gasLeft)} OKB left for gas`);

if (amountIn <= 0n) {
  throw new Error(`nothing to swap: balance ${formatEther(balance)} OKB is at or below the reserve`);
}
if (toWrap > balance) {
  throw new Error(
    `need ${formatEther(toWrap)} OKB to wrap but only ${formatEther(balance)} is available`,
  );
}
if (gasLeft < GAS_RESERVE / 5n) {
  throw new Error(
    `that would leave ${formatEther(gasLeft)} OKB for gas, which is too thin to ` +
      `deploy and execute. Swap less.`,
  );
}

// ------------------------------------------------------- 2. simulate the route

// Quoting offline against live pool state, the same way the planner sizes a
// fill — so `minAmountOut` is a number we computed rather than a guess with a
// wide tolerance wrapped around it.
const okbUsdt = await loadPool('0xe3BE6A0137f1b0602Fc1a4841686f43B340a5082');
const usdtUsdg = await loadPool('0x0cBe0dBE1400e57f371a38BD3b9bC80F7C3676dA');

const hop1 = simulateExactInput(okbUsdt, amountIn, okbUsdt.token0.address === WOKB);
const hop2 = simulateExactInput(usdtUsdg, hop1.amountOut, usdtUsdg.token0.address === USDT0.address);

const expected = hop2.amountOut;
const minOut = (expected * (10_000n - SLIPPAGE_BPS)) / 10_000n;

console.log(`\n  route     WOKB -0.05%-> USD₮0 -0.01%-> USDG`);
console.log(`  hop 1     ${formatUnits(hop1.amountOut, USDT0.decimals)} USD₮0  (${hop1.priceImpactBps}bp)`);
console.log(`  hop 2     ${formatUnits(expected, USDG.decimals)} USDG  (${hop2.priceImpactBps}bp)`);
console.log(`  min out   ${formatUnits(minOut, USDG.decimals)} USDG  (${SLIPPAGE_BPS}bp tolerance)`);

if (hop1.exhaustedWindow || hop2.exhaustedWindow) {
  throw new Error(
    'the simulation ran past its prefetched tick window, so the quote is a lower bound. ' +
      'Swap a smaller amount.',
  );
}

if (dryRun) {
  console.log(`\n  --dry: quoted only, nothing sent. Drop the flag to execute.\n`);
  process.exit(0);
}

// ------------------------------------------------------------------ 3. wrap

if (toWrap === 0n) {
  // A previous run got this far. Wrapping again would spend OKB we no longer
  // have and, worse, silently double the position. Every step below is written
  // to be resumable for the same reason: on this RPC a run can die between a
  // confirmed transaction and a readable state, and the fix must never be
  // "start over".
  console.log(`\n  wrapped   ${formatEther(heldWokb)} WOKB already held, skipping wrap`);
} else {
  console.log(`\n  wrapping  ${formatEther(toWrap)} OKB…`);
  const wrapHash = await wallet.writeContract({
    address: WOKB,
    abi: WOKB_ABI,
    functionName: 'deposit',
    value: toWrap,
  });
  await settle(wrapHash);
  await waitUntil(() => wokbOf(account.address), (b) => b >= amountIn, { what: 'WOKB balance' });
  console.log(`  wrapped   ${wrapHash}`);
}

// -------------------------------------------------- 4. fund the router, swap

// The router spends from its own balance, exactly as Executor does. Anything it
// keeps would be money that silently did not become USDG, so the balance is
// checked after the swap rather than assumed.
const routerBefore = routerHeld;

if (routerBefore >= amountIn) {
  // Also resumable: the router is already holding this leg's WOKB from an
  // interrupted run, so sending more would strand it there.
  console.log(`  router    already funded with ${formatEther(routerBefore)} WOKB`);
} else {
  const fundHash = await wallet.writeContract({
    address: WOKB,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [ADDR.universalRouter, amountIn - routerBefore],
  });
  await settle(fundHash);
  await waitUntil(() => wokbOf(ADDR.universalRouter), (b) => b >= amountIn, {
    what: 'router funding',
  });
}

const path = encodeMultiPath([
  [WOKB, 500, USDT0.address],
  [USDT0.address, 100, USDG.address],
]);

const before = await wallet.readContract({
  address: USDG.address,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [account.address],
});

console.log(`  swapping…`);
const swapHash = await wallet.writeContract({
  address: ADDR.universalRouter,
  abi: ROUTER_ABI,
  functionName: 'execute',
  args: [
    V3_SWAP_EXACT_IN,
    [
      encodeSwapInput(account.address, amountIn, minOut, path),
    ],
    BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
  ],
});
const gasUsed = await settle(swapHash);
console.log(`  tx        ${swapHash}${gasUsed === null ? '' : `  (gas ${gasUsed})`}`);

// ------------------------------------------------------------------ 5. report

const after = await waitUntil(
  () =>
    wallet.readContract({
      address: USDG.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }),
  (b) => b > before,
  { what: 'USDG balance' },
);

const routerAfter = await wokbOf(ADDR.universalRouter);

console.log(`\n  received  ${formatUnits(after - before, USDG.decimals)} USDG`);
console.log(`  balance   ${formatUnits(after, USDG.decimals)} USDG`);
console.log(`  gas left  ${formatEther(await wallet.getBalance({ address: account.address }))} OKB`);

// The router was funded with exactly this leg's input and should end at zero.
// Anything it kept is money that silently did not become USDG — the same check
// Executor makes in Solidity, for the same reason.
if (routerAfter > 0n) {
  console.log(
    `\n  WARNING: the router kept ${formatEther(routerAfter)} WOKB. ` +
      `That is your money that did not become USDG.`,
  );
}
console.log();
