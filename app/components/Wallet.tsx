'use client';

import { useEffect, useRef, useState } from 'react';
import { OPEN_WALLET_EVENT } from './follow';
import { CHAINS, useWallet, WC_ICON, type DiscoveredWallet } from './useWallet';

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
    connecting,
    error,
    connect,
    connectWalletConnect,
    walletConnectConfigured,
    disconnect,
    switchChain,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The trade card's connect button. See `OPEN_WALLET_EVENT`.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_WALLET_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WALLET_EVENT, onOpen);
  }, []);

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

  const pair = async () => {
    setOpen(false);
    await connectWalletConnect();
  };

  return (
    <div className="relative flex flex-col items-end gap-1.5" ref={box}>
      {connected && address ? (
        <>
          {/* The connected shape mirrors the connect button exactly — same
              height, same radius, same type — except the gradient is a one
              pixel ring instead of a fill, and the middle is the page. Two
              states of one control should not look like two controls.
              `cta-mesh` on the inner span both draws the ring and inherits the
              drift and the hover behaviour the connect button already has.

              The icon is the wallet that is actually connected, read from the
              EIP-6963 announcement rather than picked from a list we maintain.
              A hard-coded logo is a logo that is wrong for everyone using the
              other wallet. */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={`Account ${address}`}
              className={`group ${BOX} transition-transform duration-200 active:scale-[0.98]`}
            >
              <span className="cta-mesh block h-full w-full rounded-[14px] p-0.5">
                <span className={`${FACE} gap-2 rounded-[12px] bg-ground px-3 text-[13px] text-ink`}>
                  {/* EIP-6963 mandates a data URI, so this loads no third party. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={connected.icon} alt="" className="h-4 w-4 shrink-0 rounded" />
                  {short(address)}
                </span>
              </span>
            </button>

            {/* Outside the frame, and nothing but the mark. Anything that is
                not X Layer mainnet counts, testnet included: a wallet parked
                elsewhere is the failure mode that silently sends a transaction
                to whatever happens to live at our address over there, and the
                test chain is not exempt from that just because we deployed to
                it. The fix is one click away inside the menu, which is why
                this does not need a sentence attached. */}
            {chainId !== MAINNET_ID && (
              <AlertMark
                className="h-[18px] w-[18px] shrink-0 text-refuse"
                title="Wrong network. Open the menu to switch to X Layer."
              />
            )}
          </div>
        </>
      ) : (
        // The one loud control in the console, by the design owner's decision
        // (FE, 2026-08-17). It was chrome weight earlier that same day for the
        // opposite reason — the board, the run and the receipts all read
        // without a wallet, so the loudest thing on the page was the action the
        // first-time visitor least needs. Recorded rather than quietly
        // reversed, because the argument against it is still true and whoever
        // reads this next should see both halves.
        //
        // Four tints of one hue, never a second accent: the `cta-*` tokens are
        // greens either side of `signal`, and they exist because `signal-deep`
        // inverts between themes. `text-ground` is the label, which resolves to
        // white on light and black on dark, so it stays legible across the
        // whole surface in both.
        //
        // `cta-mesh` (globals.css) is the surface and it drifts on its own.
        // Hover pauses that drift and lifts the exposure; both live in the
        // stylesheet, because four layered gradients and a four-track keyframe
        // do not belong in a `className`.
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={connecting}
          className={`group relative ${BOX} transition-transform duration-200 active:scale-[0.98] disabled:opacity-60`}
        >
          {/* 14px: a box with rounded corners rather than a pill, and the same
              radius the connected state uses. `BOX` holds both states to one
              size, so the header does not resize the moment a wallet connects
              and adds its icon. */}
          <span
            className={`cta-mesh cta-label ${FACE} rounded-[14px] px-5 text-[15px] text-[var(--color-cta-ink)]`}
          >
            {connecting ? 'connecting…' : 'connect wallet'}
          </span>
        </button>
      )}

      {open && !connected && (
        <div className="overlay absolute top-[calc(100%+0.5rem)] right-0 z-40 w-60 rounded-xl p-1.5">
          {wallets.map((w) => (
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
          ))}

          {/* The phone path (D83). Listed last: someone with an extension
              installed should take the extension, and someone without one is
              here precisely because there is nothing above this line. */}
          {walletConnectConfigured ? (
            <button
              onClick={pair}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-raised"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={WC_ICON} alt="" className="h-5 w-5 rounded" />
              WalletConnect
            </button>
          ) : (
            wallets.length === 0 && (
              <p className="px-2.5 py-2 text-[12px] leading-relaxed text-dim">
                No browser wallet announced itself, and WalletConnect is not configured on this
                deployment, so there is no way to connect from here. Install the OKX Wallet
                extension and reload.
              </p>
            )
          )}
        </div>
      )}

      {/* The account menu.
       *
       * Two rows, no headings. Switching network is rare and disconnecting is
       * rarer, so neither earns permanent space in a header — but both have to
       * stay reachable, and a warning that cannot be acted on is just an
       * accusation.
       *
       * One network, not two. The hackathon this is built for requires X Layer
       * mainnet, so the test chain is not an option a user should be offered:
       * whatever they are on, the only useful move is back here. The dot says
       * whether they already are. */}
      {open && connected && address && (
        <div className="overlay absolute top-[calc(100%+0.5rem)] right-0 z-40 w-52 rounded-xl p-1.5">
          <button
            onClick={() => {
              setOpen(false);
              const target = CHAINS.find((c) => c.chain.id === MAINNET_ID);
              if (target && chainId !== MAINNET_ID) void switchChain(target.chain);
            }}
            className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-raised"
          >
            X Layer
          </button>

          <button
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-refuse transition-colors duration-200 hover:bg-refuse/8"
          >
            Disconnect
          </button>
        </div>
      )}

      {error && (
        <span className="max-w-[34ch] text-right font-mono text-[11px] text-refuse">{error}</span>
      )}
    </div>
  );
}

/** X Layer mainnet. Named because `CHAINS[0]` is the *test* chain, and code
 *  that assumes otherwise sends people to the wrong network politely. */
const MAINNET_ID = 196;

/**
 * The box both states of this control live in, and the face that fills it.
 *
 * Height and width are pinned on the **button**, not on the face, and that is
 * the whole point. The connected state wraps its face in a 2px gradient ring,
 * so identical padding on the two faces still produced a button 4px larger in
 * each direction — enough to read as a bigger control, and easy to mistake for
 * a bigger typeface. Fixing the outer box makes the ring cost nothing.
 *
 * The box is sized to the connect button, which is the one that has to look
 * right to a first-time visitor. The connected state fits itself into it
 * instead: smaller type and a smaller icon, because an address plus a logo is
 * simply more to carry than two words, and growing the box to suit it would
 * make the header resize the moment a wallet arrives.
 *
 * Centred rather than left-aligned for the same reason: two labels of
 * different lengths in a fixed box only read as one control if they share an
 * axis.
 */
const BOX = 'h-[38px] min-w-[152px] rounded-[14px]';
const FACE = 'flex h-full w-full items-center justify-center whitespace-nowrap font-semibold';

function AlertMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" role="img">
      {title && <title>{title}</title>}
      <path d="M12 2.5c.53 0 1.02.28 1.29.74l9.5 16.25c.27.47.27 1.04 0 1.5-.27.47-.77.76-1.3.76H2.51c-.53 0-1.03-.29-1.3-.76a1.5 1.5 0 0 1 0-1.5l9.5-16.25c.27-.46.76-.74 1.29-.74Zm0 5.25a1.1 1.1 0 0 0-1.1 1.16l.3 5.2a.8.8 0 0 0 1.6 0l.3-5.2A1.1 1.1 0 0 0 12 7.75Zm0 8.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z" />
    </svg>
  );
}
