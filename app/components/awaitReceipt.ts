import type { Hex, PublicClient, TransactionReceipt } from 'viem';

/**
 * Wait for a receipt by asking for it, rather than by waiting to be told.
 *
 * `publicClient.waitForTransactionReceipt` hung indefinitely against the OKX
 * extension's injected provider on X Layer: the first browser fill was mined in
 * block 67767995 and confirmed on chain while the page still said `mining…`
 * (D65). Whatever the wallet does or does not support behind the transport, the
 * page cannot depend on it — a successful trade that never finishes rendering
 * reads as a failed one, and a user who retries a fill they already made is the
 * expensive version of that mistake.
 *
 * So this polls `eth_getTransactionReceipt` on a bounded loop. A miss is not a
 * failure: viem throws when the transaction is still pending, and on this chain
 * a read can also land on a node that has not seen the block yet (D18). Both
 * mean *ask again*, which is the same discipline `waitUntil` enforces in
 * `src/wallet.ts` for the CLI.
 *
 * It gives up loudly rather than silently: after the budget it throws with the
 * hash, because "we stopped looking" and "it failed" are different sentences
 * and only one of them is true.
 */
export async function awaitReceipt(
  client: PublicClient,
  hash: Hex,
  { attempts = 90, delayMs = 1000 }: { attempts?: number; delayMs?: number } = {},
): Promise<TransactionReceipt> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch {
      /* pending, or an unsynced node — both mean ask again */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `the transaction was sent but no receipt became readable in ${Math.round(
      (attempts * delayMs) / 1000,
    )}s. It may still have succeeded: check ${hash} on the explorer before sending another.`,
  );
}
