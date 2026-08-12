'use client';

import { useEffect, useRef, useState } from 'react';
import { CHAINS, useWallet, type DiscoveredWallet } from './useWallet';

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Connect, pick a chain, and see which address is about to sign.
 *
 * Kept in the header because the one question a user has before pressing any
 * button on this page is "who am I, and on what chain" — and because the answer
 * has to stay visible while they read a verdict further down.
 */
export function Wallet() {
  const {
    wallets,
    connected,
    address,
    chainId,
    option,
    connecting,
    error,
    connect,
    disconnect,
    switchChain,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = async (wallet: DiscoveredWallet) => {
    setOpen(false);
    await connect(wallet);
  };

  return (
    <div className="relative flex flex-col items-end gap-1.5" ref={box}>
      {connected && address ? (
        <>
          <div className="flex items-center gap-1.5">
            {/* The chain is a control, not a label: a user on the wrong network
                should be able to fix it here rather than hunt in the wallet. */}
            {CHAINS.map(({ chain }) => {
              const active = chainId === chain.id;
              return (
                <button
                  key={chain.id}
                  onClick={() => !active && switchChain(chain)}
                  disabled={active}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap transition-colors ${
                    active
                      ? 'border-signal-deep bg-signal/6 text-signal'
                      : 'border-line bg-raised text-faint hover:text-ink'
                  }`}
                >
                  {chain.id === 196 ? 'mainnet' : 'testnet'} {chain.id}
                </button>
              );
            })}
            <button
              onClick={disconnect}
              title={address}
              className="rounded-full border border-line bg-raised px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-dim hover:text-refuse"
            >
              {short(address)}
            </button>
          </div>

          {/* A wallet parked on some other network is the failure mode that
              silently sends a transaction to whatever lives at our address
              there. Say so instead of leaving the button live. */}
          {!option && (
            <span className="rounded-full border border-caution/40 bg-caution/6 px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-caution">
              chain {chainId} has no deployment — switch to X Layer
            </span>
          )}
        </>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={connecting}
          className="rounded-full border border-signal-deep bg-signal/6 px-3 py-0.5 font-mono text-[11px] whitespace-nowrap text-signal hover:bg-signal/12 disabled:opacity-50"
        >
          {connecting ? 'connecting…' : 'connect wallet'}
        </button>
      )}

      {open && !connected && (
        <div className="absolute top-7 right-0 z-20 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
          {wallets.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] leading-relaxed text-dim">
              No browser wallet announced itself. Install the OKX Wallet extension, then
              reload — this page discovers wallets over EIP-6963 and has no WalletConnect
              fallback.
            </p>
          ) : (
            wallets.map((w) => (
              <button
                key={w.uuid}
                onClick={() => choose(w)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-raised"
              >
                {/* EIP-6963 mandates a data URI, so this loads no third party. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" className="h-5 w-5 rounded" />
                {w.name}
              </button>
            ))
          )}
        </div>
      )}

      {error && (
        <span className="max-w-[34ch] text-right font-mono text-[11px] text-refuse">{error}</span>
      )}
    </div>
  );
}
