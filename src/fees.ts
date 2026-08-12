/**
 * What the fee has actually earned, and how to get it out.
 *
 * `FeeCollector` has been taking 15 bps on every mainnet fill since 2026-08-11
 * and `withdraw` had no caller anywhere in the repo — the revenue story had no
 * final step (D52). This is that step.
 *
 *   TARGET=mainnet pnpm fees               # report only, writes nothing
 *   TARGET=mainnet pnpm fees withdraw      # sweep the balance to the treasury
 *
 * `withdraw` is callable by **anyone**, on purpose: the destination is fixed to
 * `treasury` in storage, so there is nothing to gain by front-running it. That
 * also means this script needs no admin key and no Safe signatures — which is
 * the difference between a payout that works and one that waits on two
 * signers.
 *
 * The one thing it will not do is guess a token. USDG is the settlement
 * currency and therefore the only thing fees are ever taken in; pass an address
 * explicitly to sweep anything else that has been sent here by mistake.
 */
import { erc20Abi, formatUnits, isAddress, type Address } from 'viem';
import { FEE_COLLECTOR_ABI } from './abi';
import { USDG } from './chain';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitForReceipt,
  waitUntil,
  walletFor,
} from './wallet';

const ARG = process.argv[2]?.toLowerCase();
const TOKEN_ARG = process.argv[3];

if (ARG !== undefined && ARG !== 'withdraw') {
  console.error('usage: TARGET=mainnet pnpm fees [withdraw] [tokenAddress]');
  process.exit(1);
}
if (TOKEN_ARG && !isAddress(TOKEN_ARG)) {
  console.error(`"${TOKEN_ARG}" is not an address`);
  process.exit(1);
}

const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const FEES = deployment.contracts.FeeCollector as Address | undefined;
if (!FEES) {
  console.error(`no FeeCollector recorded for ${deployment.name}`);
  process.exit(1);
}

const token = (TOKEN_ARG as Address | undefined) ?? (USDG.address as Address);

const caller = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(caller, t);

console.log(`\n  FeeCollector ${FEES}  (${deployment.name}, chain ${chain.id})\n`);

const [feeBps, maxFeeBps, treasury, admin, symbol, decimals, balance] = await Promise.all([
  wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'feeBps' }),
  wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'MAX_FEE_BPS' }),
  wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'treasury' }),
  wallet.readContract({ address: FEES, abi: FEE_COLLECTOR_ABI, functionName: 'admin' }),
  wallet.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
  wallet.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  wallet.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [FEES] }),
]);

console.log(`  rate       ${feeBps} bps  (contract ceiling ${maxFeeBps}, a constant not a setting)`);
console.log(`  admin      ${admin}`);
console.log(`  treasury   ${treasury}`);
console.log(`  balance    ${formatUnits(balance, decimals)} ${symbol}`);

// A treasury with no code is an EOA: one key, no threshold, no recovery. Worth
// saying out loud every time, because the admin was moved to a 2-of-3 Safe in
// D42 and the payout address was left behind — and it is the payout address
// that decides where the money actually lands.
const treasuryCode = await wallet.getCode({ address: treasury });
if (!treasuryCode || treasuryCode === '0x') {
  console.log(
    `\n  ⚠ treasury is an EOA, not a contract. Admin is ${
      admin === treasury ? 'the same address' : 'a different address'
    }; if admin is a Safe and this is not,\n` +
      `    the control moved and the money did not. Changing it is setTreasury(), admin-only.`,
  );
}

if (balance === 0n) {
  console.log(`\n  Nothing to sweep.\n`);
  process.exit(0);
}

if (ARG !== 'withdraw') {
  console.log(`\n  Read-only. Pass "withdraw" to sweep this to the treasury.\n`);
  process.exit(0);
}

console.log(`\n  sweeping ${formatUnits(balance, decimals)} ${symbol} -> ${treasury}`);
console.log(`  (the destination is fixed in the contract; this call cannot redirect it)`);

const before = await wallet.readContract({
  address: token,
  abi: erc20Abi,
  functionName: 'balanceOf',
  args: [treasury],
});

const hash = await wallet.writeContract({
  address: FEES,
  abi: FEE_COLLECTOR_ABI,
  functionName: 'withdraw',
  args: [token],
});
const receipt = await waitForReceipt(wallet, hash);
console.log(`\n  tx        ${hash}  (${receipt.status}, gas ${receipt.gasUsed})`);

// Polled rather than read once — a confirmed write can outrun a readable block
// on this RPC, and reporting a sweep that appears not to have happened is worse
// than waiting for it (D18).
const after = await waitUntil(
  () =>
    wallet.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [treasury],
    }),
  (b) => b > before,
  { attempts: 30, delayMs: 500, what: 'the swept balance at the treasury' },
);

console.log(`  treasury  +${formatUnits(after - before, decimals)} ${symbol}`);
console.log(`  explorer  ${deployment.explorer}/tx/${hash}\n`);
