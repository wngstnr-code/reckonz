/**
 * Which chain a write goes to, decided in one place.
 *
 * Every on-chain script used to import `xLayerTestnet` directly. That is fine
 * until the day it isn't: run one against mainnet and it writes to testnet,
 * confirms, and prints success. `TARGET=mainnet` is the only switch, and it is
 * read here so no script can disagree with another.
 */
import { createWalletClient, http, publicActions, type Address, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer, xLayerTestnet } from './chain';
import { MAINNET, TESTNET, type Deployment } from './deployments';

export type Target = 'mainnet' | 'testnet';

export function target(): Target {
  const t = (process.env.TARGET ?? 'testnet').toLowerCase();
  if (t !== 'mainnet' && t !== 'testnet') {
    throw new Error(`TARGET must be "mainnet" or "testnet", got "${t}"`);
  }
  return t;
}

export function chainFor(t: Target = target()): Chain {
  return t === 'mainnet' ? xLayer : xLayerTestnet;
}

/**
 * The recorded deployment for a target. Mainnet is deliberately allowed to be
 * absent: a script that needs it should fail here, loudly, rather than fall
 * back to testnet addresses on a mainnet chain.
 */
export function deploymentFor(t: Target = target()): Deployment {
  const d = t === 'mainnet' ? MAINNET : TESTNET;
  if (!d) {
    throw new Error(
      'No mainnet deployment recorded. Deploy first, then fill in MAINNET in src/deployments.ts.',
    );
  }
  return d;
}

/** A private key from the environment, as an account. */
export function accountFrom(...envNames: string[]) {
  for (const name of envNames) {
    const raw = process.env[name];
    if (raw) return privateKeyToAccount(raw as `0x${string}`);
  }
  throw new Error(`set one of: ${envNames.join(', ')}`);
}

export function walletFor(account: ReturnType<typeof accountFrom>, t: Target = target()) {
  return createWalletClient({
    account,
    chain: chainFor(t),
    transport: http(undefined, { retryCount: 6, retryDelay: 400, timeout: 30_000 }),
  }).extend(publicActions);
}

export type Wallet = ReturnType<typeof walletFor>;

/**
 * Poll until a read reflects a write.
 *
 * A confirmed receipt is not enough on X Layer: the public RPC load-balances,
 * and the gas estimation for a dependent transaction can land on a node that
 * has not seen the previous one — which reads zeroes, not an error, and reverts
 * for reasons that make no sense. See D18.
 */
export async function waitUntil<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  { attempts = 30, delayMs = 2000, what = 'state' } = {},
): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`${what} never became visible after ${attempts} attempts`);
}

/** Uniswap V3 path: tokenIn | fee (3 bytes, big-endian) | tokenOut. */
export function encodePath(tokenIn: Address, fee: number, tokenOut: Address): `0x${string}` {
  const feeHex = fee.toString(16).padStart(6, '0');
  return `0x${tokenIn.slice(2)}${feeHex}${tokenOut.slice(2)}`.toLowerCase() as `0x${string}`;
}
