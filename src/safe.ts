/**
 * Safe 2-of-3 as the oracle's admin.
 *
 * `FairValueOracle` has two powers with completely different shapes, and only
 * one of them can be put behind a multisig:
 *
 *   - **admin** — `setPublisher`, `setMaxAge`, `setAdmin`. Rare, deliberate,
 *     human. A multisig fits perfectly.
 *   - **publisher** — `publish()`, every fifteen minutes, by a machine. A
 *     multisig cannot protect this. Gate it behind human co-signing and the
 *     oracle stops working; automate the co-signers and the keys sit on the
 *     same box, which is a multisig in name only.
 *
 * So this closes the admin half and is not claimed to close more. The publisher
 * half is bounded in the contract instead. Both are needed; neither is the other.
 *
 * **No Safe SDK, no transaction service, no web UI.** None of those are proven
 * to support X Layer, and D35 is what happens when an external dependency is
 * assumed to work because it exists. Everything here is direct calls against
 * the singleton, using the pre-validated signature scheme: each owner records
 * approval on-chain with `approveHash`, and `execTransaction` is handed
 * `r = owner, s = 0, v = 1`. Slightly more gas, no off-chain infrastructure,
 * and it works with any wallet that can send a transaction.
 */
import {
  encodeFunctionData,
  encodePacked,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { SAFE_ABI, SAFE_PROXY_FACTORY_ABI } from './abi';
import { SAFE } from './chain';
import { waitUntil, type Wallet } from './wallet';

/** Safe's `Operation` enum. Only CALL is used — DELEGATECALL from a treasury
 *  contract is an arbitrary-code hole and nothing here needs it. */
const CALL = 0;

export interface SafeTx {
  to: Address;
  value: bigint;
  data: Hex;
}

/**
 * Deploy a Safe.
 *
 * `saltNonce` makes the address deterministic for a given owner set, so a
 * repeated run does not silently produce a second Safe — it reverts on the
 * factory instead, which is the failure we want.
 */
export async function deploySafe(
  wallet: Wallet,
  owners: Address[],
  threshold: number,
  saltNonce: bigint,
): Promise<Address> {
  if (owners.length === 0) throw new Error('a Safe with no owners cannot be recovered');
  if (threshold < 1 || threshold > owners.length) {
    throw new Error(`threshold ${threshold} is not reachable with ${owners.length} owners`);
  }
  const seen = new Set(owners.map((o) => o.toLowerCase()));
  if (seen.size !== owners.length) {
    // Two identical owners make a 2-of-3 satisfiable by one key. That is the
    // exact failure this contract is meant to prevent, and it is silent.
    throw new Error('duplicate owner — the threshold would not mean what it says');
  }

  const initializer = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: 'setup',
    args: [
      owners,
      BigInt(threshold),
      '0x0000000000000000000000000000000000000000', // no setup delegatecall
      '0x',
      SAFE.fallbackHandler,
      '0x0000000000000000000000000000000000000000', // no payment token
      0n,
      '0x0000000000000000000000000000000000000000',
    ],
  });

  // Simulate first so the proxy address comes from the return value rather than
  // from parsing a log — one less thing to get subtly wrong.
  const { result, request } = await wallet.simulateContract({
    address: SAFE.proxyFactory,
    abi: SAFE_PROXY_FACTORY_ABI,
    functionName: 'createProxyWithNonce',
    args: [SAFE.singletonL2, initializer, saltNonce],
  });
  const hash = await wallet.writeContract(request);
  await wallet.waitForTransactionReceipt({ hash });
  const proxy = getAddress(result);

  // A confirmed receipt is not enough: the public RPC load-balances, so the
  // next read can land on a node that has not seen the block and reports no
  // code at an address that definitely has some. See D18. Polling for the
  // bytecode also double-checks the address the simulation predicted.
  await waitUntil(
    () => wallet.getCode({ address: proxy }),
    (code) => code != null && code !== '0x',
    { what: `code at the new Safe ${proxy}` },
  );
  return proxy;
}

/** The hash owners approve. Asked of the Safe itself, so the domain separator
 *  and struct encoding cannot drift from the deployed version. */
export function safeTxHash(wallet: Wallet, safe: Address, tx: SafeTx, nonce: bigint) {
  return wallet.readContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'getTransactionHash',
    args: [tx.to, tx.value, tx.data, CALL, 0n, 0n, 0n, ZERO, ZERO, nonce],
  });
}

const ZERO = '0x0000000000000000000000000000000000000000' as const;

/** Record this wallet's approval of a Safe transaction hash, on-chain. */
export async function approveHash(wallet: Wallet, safe: Address, hash: Hex) {
  const tx = await wallet.writeContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'approveHash',
    args: [hash],
  });
  await wallet.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/**
 * Pack pre-validated signatures for a set of approving owners.
 *
 * Safe iterates the signature blob and checks each recovered owner is **strictly
 * greater** than the last, which is how it rejects the same owner counted twice.
 * Sorting here is therefore not cosmetic: unsorted owners revert with GS026 and
 * the reason is not obvious from the error.
 */
export function prevalidatedSignatures(owners: Address[]): Hex {
  const sorted = [...owners].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
  );
  let out: Hex = '0x';
  for (const o of sorted) {
    const sig = encodePacked(
      ['uint256', 'uint256', 'uint8'],
      [BigInt(o), 0n, 1],
    );
    out = (out + sig.slice(2)) as Hex;
  }
  return out;
}

/** Execute a Safe transaction that already has enough on-chain approvals. */
export async function execTransaction(
  wallet: Wallet,
  safe: Address,
  tx: SafeTx,
  approvers: Address[],
) {
  const hash = await wallet.writeContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'execTransaction',
    args: [
      tx.to,
      tx.value,
      tx.data,
      CALL,
      0n,
      0n,
      0n,
      ZERO,
      ZERO,
      prevalidatedSignatures(approvers),
    ],
  });
  const receipt = await wallet.waitForTransactionReceipt({ hash });
  // execTransaction returns false on inner failure rather than reverting, and a
  // successful receipt for a Safe transaction that did nothing is the most
  // misleading result this file can produce.
  if (receipt.status !== 'success') throw new Error(`Safe execTransaction reverted: ${hash}`);
  return hash;
}

export async function safeState(wallet: Wallet, safe: Address) {
  const [owners, threshold, nonce] = await Promise.all([
    wallet.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getOwners' }),
    wallet.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getThreshold' }),
    wallet.readContract({ address: safe, abi: SAFE_ABI, functionName: 'nonce' }),
  ]);
  return { owners: owners as readonly Address[], threshold, nonce };
}
