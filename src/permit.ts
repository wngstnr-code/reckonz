/**
 * The Permit2 authorisation, extracted so a browser can produce one.
 *
 * `src/execute.ts` has done this since the first mainnet fill, but as a Node
 * script holding a private key. The browser can create and govern a mandate
 * (D52, D54) and has never placed a fill, because the one thing it could not do
 * was produce this signature. This module is that gap, and nothing else: it is
 * deliberately not an execute helper, because the parts either side — quoting
 * against live pool state, and the guard's `dryRun` — already work and already
 * have one implementation each.
 *
 * ## Browser-safe, and that is a constraint not a nicety
 *
 * No `node:` import, no `process.env`, no client construction. It takes a
 * `PublicClient` for the one read it needs and is otherwise pure. Same rule as
 * `src/abi.ts`, `src/deployments.ts` and `src/chain.ts` — see CLAUDE.md.
 *
 * ## Why this shape is the security story
 *
 * The signature names `spender`, and Permit2 reconstructs that field from
 * `msg.sender` when the transfer executes. Only the executor named at signing
 * time can ever use it. It is scoped to one token, capped at one amount, and
 * expires — 20 minutes by default, which is long enough for a user to read a
 * wallet prompt and short enough that an abandoned signature is worthless.
 *
 * This is what makes "the AI never holds a key that can move funds" true rather
 * than aspirational: an agent key with no fresh signature moves nothing, and
 * the signature can only ever come from the owner's own wallet.
 */
import type { Address, Hex, PublicClient, TypedDataDomain } from 'viem';
import { PERMIT2_ABI } from './abi';
import { ADDR } from './chain';

/** 20 minutes. Long enough to read a prompt, short enough to be worthless if abandoned. */
export const PERMIT_TTL_SEC = 20 * 60;

export interface PermitRequest {
  /** the token being pulled — USDG on the way in, the xStock on the way out */
  token: Address;
  /** maximum units the executor may pull, at the token's own decimals */
  amount: bigint;
  /** the only contract that will ever be able to use this signature */
  spender: Address;
  owner: Address;
  chainId: number;
}

export interface PermitPayload {
  /** hand straight to `walletClient.signTypedData` */
  typedData: {
    domain: TypedDataDomain;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: 'PermitBatchTransferFrom';
    message: {
      permitted: { token: Address; amount: bigint }[];
      spender: Address;
      nonce: bigint;
      deadline: bigint;
    };
  };
  /** the struct the executor takes as calldata — note it carries no `spender` */
  permit: {
    permitted: { token: Address; amount: bigint }[];
    nonce: bigint;
    deadline: bigint;
  };
  nonce: bigint;
  deadline: bigint;
}

/**
 * The first unused Permit2 nonce for this owner.
 *
 * Permit2 nonces are a bitmap rather than a counter, so they are unordered and
 * a used one is simply a set bit. Scanning the first sixteen words covers 4,096
 * signatures, which is far past anything this system will produce; running out
 * throws rather than wrapping, because silently reusing a nonce would produce a
 * signature that reverts at the worst possible moment.
 */
export async function unusedNonce(
  client: PublicClient,
  owner: Address,
  words = 16n,
): Promise<bigint> {
  for (let word = 0n; word < words; word++) {
    const bitmap = await client.readContract({
      address: ADDR.permit2 as Address,
      abi: PERMIT2_ABI,
      functionName: 'nonceBitmap',
      args: [owner, word],
    });
    for (let bit = 0n; bit < 256n; bit++) {
      if ((bitmap >> bit) % 2n === 0n) return word * 256n + bit;
    }
  }
  throw new Error(`no unused Permit2 nonce in the first ${words} words`);
}

/**
 * Build the typed data to sign, and the struct to send alongside it.
 *
 * Returned as two objects on purpose. They are *not* the same shape: the signed
 * struct carries `spender` and the calldata struct does not, because Permit2
 * fills that field from `msg.sender`. Handing callers one object and hoping
 * they drop the right field is how a signature ends up authorising the wrong
 * contract.
 */
export async function buildPermit(
  client: PublicClient,
  req: PermitRequest,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<PermitPayload> {
  const nonce = await unusedNonce(client, req.owner);
  const deadline = BigInt(nowSec + PERMIT_TTL_SEC);
  const permitted = [{ token: req.token, amount: req.amount }];

  return {
    typedData: {
      domain: {
        name: 'Permit2',
        chainId: req.chainId,
        verifyingContract: ADDR.permit2 as Address,
      },
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
      message: { permitted, spender: req.spender, nonce, deadline },
    },
    permit: { permitted, nonce, deadline },
    nonce,
    deadline,
  };
}

/**
 * What a user should be told before they sign, in the words that matter.
 *
 * A wallet prompt for typed data is unreadable to almost everyone. The UI has
 * to say what is actually being authorised, and the four facts that bound it
 * are the four this returns. Kept here rather than in a component so the copy
 * cannot drift from the struct it describes.
 */
export function describePermit(
  req: PermitRequest,
  /**
   * Unix seconds the authorisation dies at. Taken as a value rather than as a
   * `PermitPayload` because the UI has to show this *before* the permit exists:
   * the nonce read and the typed data are built when the user commits, and
   * telling them what they are about to sign afterwards is telling them late.
   */
  deadline: bigint,
  symbol: string,
  decimals: number,
): string[] {
  const amount = Number(req.amount) / 10 ** decimals;
  const minutes = Math.round((Number(deadline) - Math.floor(Date.now() / 1000)) / 60);
  return [
    `at most ${amount} ${symbol}, and not a unit more`,
    `only ${req.spender} can use it, no other contract, ever`,
    `expires in ~${minutes} minutes, after which it is worthless`,
    'it is a permission to pull once, not a standing allowance',
  ];
}
