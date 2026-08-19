'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Address, Hex } from 'viem';
import { THESIS_REGISTRY_ABI } from '@/src/abi';
import { thesisHash, type Thesis } from '@/src/thesis';
import { FOLLOW_EVENT, OPEN_WALLET_EVENT, type FollowRequest } from '../../follow';
import { stashHandoff } from '../../handoff';
import { useWallet } from '../../useWallet';
import { awaitReceipt } from '../../awaitReceipt';

/**
 * Put the compiled thesis on chain, before anything is traded against it.
 *
 * This is the half of the loop `/receipts` is built on and the console had no
 * button for: theses reached the registry only through `pnpm thesis:publish`,
 * so the claim that reasoning is published before the outcome depended on
 * somebody remembering to run a script.
 *
 * **The hash is of the compiled object, not the words.** `thesisHash` is the
 * same function the CLI uses and the same one `ReceiptRegistry` fills are
 * stamped with, so a fill can be matched to this claim later. Two people typing
 * the same prose get different hashes if the model mapped them differently, and
 * the same hash if it did not -- which is the property the registry needs, since
 * what gets executed is the mapping and not the sentence.
 *
 * **A thesis can be claimed once.** `idOf` is checked before spending gas: the
 * useful half of that answer is *who* claimed it, which the revert would also
 * carry but only after paying to find out.
 *
 * The CID is empty on purpose. There is nowhere to pin yet, and publishing a CID
 * that resolves to nothing is worse than publishing none: the hash is what binds.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'taken'; id: bigint; author: string }
  | { kind: 'signing' }
  | { kind: 'mining'; hash: Hex }
  | { kind: 'done'; id: bigint; hash: Hex }
  | { kind: 'failed'; message: string };

export function PublishThesis({
  thesis,
  basket,
}: {
  thesis: Thesis;
  /** The compiled legs, resolved to addresses. Empty when nothing mapped. */
  basket: { asset: Address; symbol: string }[];
}) {
  const { address, option, walletClient, publicClient } = useWallet();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const hash = thesisHash(thesis);
  const registry = option?.deployment.contracts.ThesisRegistry as Address | undefined;
  const explorer = option?.deployment.explorer;

  // Re-checked whenever the hash or the chain changes, so recompiling a
  // different thesis cannot leave a stale "already published" on screen.
  const check = useCallback(async () => {
    if (!publicClient || !registry) return;
    setPhase({ kind: 'checking' });
    try {
      const [id, exists] = await publicClient.readContract({
        address: registry,
        abi: THESIS_REGISTRY_ABI,
        functionName: 'idOf',
        args: [hash],
      });
      if (!exists) return setPhase({ kind: 'idle' });
      const prior = await publicClient.readContract({
        address: registry,
        abi: THESIS_REGISTRY_ABI,
        functionName: 'get',
        args: [id],
      });
      setPhase({ kind: 'taken', id, author: prior.author });
    } catch {
      // A read that failed is not a free hash. Staying idle would offer a
      // publish that may revert; saying nothing is the honest state.
      setPhase({ kind: 'idle' });
    }
  }, [publicClient, registry, hash]);

  useEffect(() => {
    void check();
  }, [check]);

  async function publish() {
    if (!walletClient || !publicClient || !registry || !address || !option) return;
    setPhase({ kind: 'signing' });
    try {
      const tx = await walletClient.writeContract({
        address: registry,
        abi: THESIS_REGISTRY_ABI,
        functionName: 'publish',
        args: [hash, ''],
        account: address,
        chain: option.chain,
      });
      setPhase({ kind: 'mining', hash: tx });
      await awaitReceipt(publicClient, tx);

      const [id] = await publicClient.readContract({
        address: registry,
        abi: THESIS_REGISTRY_ABI,
        functionName: 'idOf',
        args: [hash],
      });
      setPhase({ kind: 'done', id, hash: tx });
    } catch (e) {
      setPhase({
        kind: 'failed',
        message: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message,
      });
    }
  }

  /**
   * Arm a fill with this thesis, and go where fills happen.
   *
   * The link that was missing. `Follow this basket` lives on a receipt's detail
   * page, and a thesis published a minute ago has no receipts -- so the newest
   * claim on the registry was the one thing nobody could act on. Worse, the
   * basket `/receipts` shows is derived from settled fills (D50), so a fresh
   * thesis has an empty one there and adding a button would not have helped.
   * The compiled legs are only known here, on the run that produced them.
   *
   * Offered only once an id exists. A fill stamping a hash no registry entry
   * holds is exactly what `/receipts` counts as an orphaned hash and says should
   * always be zero.
   */
  const go = (id: bigint) => {
    const follow: FollowRequest = {
      thesisId: Number(id),
      contentHash: hash,
      assets: basket.map((b) => b.asset),
      symbols: basket.map((b) => b.symbol),
    };
    window.dispatchEvent(new CustomEvent(FOLLOW_EVENT, { detail: follow }));
    stashHandoff({ kind: 'follow', payload: follow });
    router.push('/trade');
  };

  return (
    <>
      <p className="font-mono text-micro tracking-normal break-all text-faint normal-case">
        {hash}
      </p>
      <p className="mt-2 max-w-[68ch] text-meta leading-relaxed text-dim">
        The hash covers the compiled basket, not the sentence. Every fill that claims this thesis
        carries it, which is what lets a receipt be matched back to the reasoning.
      </p>

      {!address ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_EVENT))}
          className="mt-4 rounded-xl bg-ink px-5 py-3 text-data font-semibold whitespace-nowrap text-ground transition-opacity duration-200 hover:opacity-90"
        >
          Connect wallet to publish
        </button>
      ) : !registry ? (
        <p className="mt-4 max-w-[62ch] text-meta leading-relaxed text-caution">
          This wallet is on a chain with no registry. Switch to X&nbsp;Layer using the control in
          the header.
        </p>
      ) : phase.kind === 'taken' ? (
        <div className="mt-4">
          <p className="max-w-[68ch] text-data leading-relaxed text-dim">
            Already published as thesis #{phase.id.toString()}. A claim can only be made once, and
            this one was made by{' '}
            <span className="font-mono text-meta [overflow-wrap:anywhere]">{phase.author}</span>.
          </p>
          <TakeToTrade id={phase.id} onGo={go} basket={basket} />
        </div>
      ) : phase.kind === 'done' ? (
        <div className="mt-4">
          <div className="rounded-xl bg-frame px-4 py-3.5">
            <p className="text-meta text-cta-ink">
              Published as thesis{' '}
              <span className="font-mono font-semibold">#{phase.id.toString()}</span>. Any fill you
              place from now on can carry this hash, and the timestamps prove which came first.
            </p>
            {explorer && (
              <a
                href={`${explorer}/tx/${phase.hash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 block font-mono text-meta break-all text-cta-3 hover:text-cta-ink"
              >
                {phase.hash}
              </a>
            )}
          </div>
          <TakeToTrade id={phase.id} onGo={go} basket={basket} />
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={phase.kind === 'signing' || phase.kind === 'mining' || phase.kind === 'checking'}
            onClick={publish}
            className="mt-4 rounded-xl bg-ink px-5 py-3 text-data font-semibold whitespace-nowrap text-ground transition-opacity duration-200 hover:opacity-90 disabled:opacity-30"
          >
            {phase.kind === 'checking'
              ? 'checking the registry…'
              : phase.kind === 'signing'
                ? 'confirm in your wallet…'
                : phase.kind === 'mining'
                  ? 'publishing…'
                  : 'Publish this thesis'}
          </button>

          {phase.kind === 'failed' && (
            <p className="mt-3 max-w-[68ch] font-mono text-meta leading-relaxed break-words text-refuse">
              {phase.message}
            </p>
          )}
        </>
      )}
    </>
  );
}

/** The step after publishing: take the claim to the page that can act on it. */
function TakeToTrade({
  id,
  onGo,
  basket,
}: {
  id: bigint;
  onGo: (id: bigint) => void;
  basket: { asset: Address; symbol: string }[];
}) {
  if (basket.length === 0) {
    return (
      <p className="mt-3 max-w-[68ch] text-meta leading-relaxed text-caution">
        Nothing in this thesis mapped onto an asset that trades here, so there is no fill to arm.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => onGo(id)}
        className="rounded-xl bg-ink px-5 py-3 text-data font-semibold whitespace-nowrap text-ground transition-opacity duration-200 hover:opacity-90"
      >
        Take it to the trade page
      </button>
      <p className="mt-3 max-w-[68ch] text-meta leading-relaxed text-dim">
        Loads {basket.map((b) => b.symbol).join(', ')} and arms the fill with this hash, so the
        receipt can be matched back to the claim. Your mandate still has to allow the asset, and you
        still size it yourself.
      </p>
    </div>
  );
}
