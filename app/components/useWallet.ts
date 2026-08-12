'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type Chain,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { xLayer, xLayerTestnet } from '@/src/chain';
import { MAINNET, TESTNET, type Deployment } from '@/src/deployments';

/**
 * Wallet connection over EIP-6963, with no wallet library.
 *
 * The obvious move was wagmi + a connect-kit. It buys a modal and a connector
 * registry, and costs a dependency tree plus a React-Query layer on a shared
 * `package.json` two people are pushing to. What this page actually needs —
 * discover the installed wallets, connect one, switch to X Layer, sign — is the
 * EIP-6963 announcement protocol plus viem's `custom()` transport, and viem is
 * already a dependency because every module in `src/` uses it.
 *
 * The consequence worth stating: **no WalletConnect**, so no phone-scans-a-QR
 * path. Only browser extensions are discoverable. Judges use a laptop with the
 * OKX extension installed, which is the case this is built for.
 *
 * No key, no signature and no RPC call from this hook ever reaches our server.
 * The transport is the injected provider; the page only ever holds an address.
 */

/** One wallet the browser announced, in EIP-6963's shape. */
export interface DiscoveredWallet {
  /** Stable per wallet, per page load. */
  uuid: string;
  name: string;
  /** Data URI — EIP-6963 requires it, so no external image request. */
  icon: string;
  rdns: string;
  provider: EIP1193Provider;
}

export interface ChainOption {
  chain: Chain;
  deployment: Deployment;
}

/**
 * Testnet first: it is the chain a stranger can safely press buttons on, and
 * `MAINNET` may be null in a deployment that has not been filled in yet.
 */
export const CHAINS: ChainOption[] = [
  { chain: xLayerTestnet, deployment: TESTNET },
  ...(MAINNET ? [{ chain: xLayer, deployment: MAINNET }] : []),
];

export function chainOptionFor(chainId: number | null): ChainOption | null {
  return CHAINS.find((c) => c.chain.id === chainId) ?? null;
}

interface AnnounceEvent extends CustomEvent {
  detail: {
    info: { uuid: string; name: string; icon: string; rdns: string };
    provider: EIP1193Provider;
  };
}

export interface WalletState {
  wallets: DiscoveredWallet[];
  connected: DiscoveredWallet | null;
  address: Address | null;
  chainId: number | null;
  /** Null when connected to a chain this app has no deployment for. */
  option: ChainOption | null;
  connecting: boolean;
  error: string | null;
}

/**
 * A wallet rejection is not a failure worth a red banner — the user declined,
 * which is the wallet working. Anything else is reported verbatim.
 */
function readableError(e: unknown): string | null {
  const code = (e as { code?: number })?.code;
  if (code === 4001) return null;
  const message = (e as { message?: string })?.message;
  return message ?? String(e);
}

export function useWallet() {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [connected, setConnected] = useState<DiscoveredWallet | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discovery. The announcement is a broadcast, so we subscribe *before* asking
  // — a wallet that announced between the two would otherwise be missed.
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as AnnounceEvent).detail;
      setWallets((prev) =>
        prev.some((w) => w.uuid === info.uuid) ? prev : [...prev, { ...info, provider }],
      );
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  // Account and chain changes come from the wallet, not from us. Without these
  // the page keeps rendering an address the user already switched away from.
  useEffect(() => {
    const provider = connected?.provider;
    if (!provider) return;

    const onAccounts = (accounts: unknown) => {
      const next = (accounts as Address[])[0] ?? null;
      setAddress(next);
      if (!next) setConnected(null);
    };
    const onChain = (id: unknown) => setChainId(Number(id));

    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    return () => {
      provider.removeListener('accountsChanged', onAccounts);
      provider.removeListener('chainChanged', onChain);
    };
  }, [connected]);

  const connect = useCallback(async (wallet: DiscoveredWallet) => {
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await wallet.provider.request({
        method: 'eth_requestAccounts',
      })) as Address[];
      const id = (await wallet.provider.request({ method: 'eth_chainId' })) as string;

      setConnected(wallet);
      setAddress(accounts[0] ?? null);
      setChainId(Number(id));
    } catch (e) {
      setError(readableError(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  /** Forgets the wallet here only. A dapp cannot revoke its own permission. */
  const disconnect = useCallback(() => {
    setConnected(null);
    setAddress(null);
    setChainId(null);
    setError(null);
  }, []);

  const switchChain = useCallback(
    async (target: Chain) => {
      const provider = connected?.provider;
      if (!provider) return;
      setError(null);

      const hex = `0x${target.id.toString(16)}`;
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hex }],
        });
      } catch (e) {
        // 4902: the wallet has never heard of this chain. X Layer testnet is
        // not in any wallet's default list, so this is the normal path, not the
        // exceptional one — offer to add it rather than reporting a failure.
        if ((e as { code?: number })?.code !== 4902) {
          setError(readableError(e));
          return;
        }
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: hex,
                chainName: target.name,
                nativeCurrency: target.nativeCurrency,
                rpcUrls: [...target.rpcUrls.default.http],
                blockExplorerUrls: [chainOptionFor(target.id)?.deployment.explorer].filter(
                  Boolean,
                ),
              },
            ],
          } as Parameters<EIP1193Provider['request']>[0]);
        } catch (addError) {
          setError(readableError(addError));
        }
      }
    },
    [connected],
  );

  /**
   * The client to sign with, or null when there is nothing safe to sign.
   *
   * Deliberately null on an unrecognised chain: a `writeContract` against an
   * address from `src/deployments.ts` while the wallet sits on some other
   * network is a transaction sent to whatever happens to live at that address
   * there. Refusing to hand out a client is cheaper than checking at every
   * call site.
   */
  const option = useMemo(() => chainOptionFor(chainId), [chainId]);

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!connected || !address || !option) return null;
    return createWalletClient({
      account: address,
      chain: option.chain,
      transport: custom(connected.provider),
    });
  }, [connected, address, option]);

  /**
   * Reads go through the same injected provider, not through a second RPC
   * config. Two benefits: there is exactly one place that decides which chain
   * we are talking to — the wallet — so a read can never answer for a chain the
   * write did not go to; and `src/chain.ts` stays the only file holding an RPC
   * URL, which is the convention the rest of the repo follows.
   */
  const publicClient = useMemo<PublicClient | null>(() => {
    if (!connected || !option) return null;
    return createPublicClient({
      chain: option.chain,
      transport: custom(connected.provider),
    });
  }, [connected, option]);

  const state: WalletState = {
    wallets,
    connected,
    address,
    chainId,
    option,
    connecting,
    error,
  };

  return { ...state, connect, disconnect, switchChain, walletClient, publicClient };
}
