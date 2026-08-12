'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
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
 *
 * ## The connection lives in a module, not in the hook
 *
 * It used to live in `useState` inside the hook, which meant every component
 * calling `useWallet()` got its **own** connection — and only the header ever
 * called `connect()`. The address rendered there while `Mandate`,
 * `MandateManage` and `Fill` each sat on `address === null` and asked the user
 * to connect a wallet that was already connected. Every wallet-dependent panel
 * on the page was unreachable, from the day wallet connect shipped until the
 * first time anyone pointed a real extension at it (D65).
 *
 * So the state is a module-level store and the hook subscribes to it. One
 * connection, one set of provider listeners, every panel reading the same
 * thing. A context provider would also have worked and would have meant a
 * client boundary around a server-rendered page; this keeps the hook's shape
 * and changes nothing at any call site.
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

// ------------------------------------------------------------- the store

type Snapshot = Omit<WalletState, 'option'>;

let snapshot: Snapshot = {
  wallets: [],
  connected: null,
  address: null,
  chainId: null,
  connecting: false,
  error: null,
};

const listeners = new Set<() => void>();

/** Replaces the snapshot object, because `useSyncExternalStore` compares by identity. */
function set(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

let discovering = false;

/**
 * Which wallet this browser last connected, by `rdns`.
 *
 * Only the identifier is stored, never an address: the wallet is the authority
 * on which account is selected, and a remembered address would go stale the
 * first time the user switches account in the extension.
 */
const REMEMBERED = 'reckonz:wallet';

function remember(rdns: string | null) {
  try {
    if (rdns) localStorage.setItem(REMEMBERED, rdns);
    else localStorage.removeItem(REMEMBERED);
  } catch {
    /* private mode, or storage disabled — reconnecting by hand still works */
  }
}

/**
 * Restore a connection the user already granted, without prompting.
 *
 * `eth_accounts` returns what has already been authorised and shows no dialog —
 * unlike `eth_requestAccounts`, which asks. So a page refresh picks the session
 * back up silently, and a wallet that was never connected here stays untouched.
 * Without this every reload dropped the connection and every panel below the
 * header went back to asking for one.
 */
async function reconnect(wallet: DiscoveredWallet) {
  if (snapshot.connected) return;
  try {
    if (localStorage.getItem(REMEMBERED) !== wallet.rdns) return;
    const accounts = (await wallet.provider.request({ method: 'eth_accounts' })) as Address[];
    if (accounts.length === 0 || snapshot.connected) return;

    const id = (await wallet.provider.request({ method: 'eth_chainId' })) as string;
    bind(wallet);
    set({ connected: wallet, address: accounts[0] ?? null, chainId: Number(id) });
  } catch {
    /* the wallet declined to answer; the user can connect by hand */
  }
}

/**
 * EIP-6963 discovery, run once for the page.
 *
 * The announcement is a broadcast, so we subscribe *before* asking — a wallet
 * that announced between the two would otherwise be missed.
 */
function discover() {
  if (discovering || typeof window === 'undefined') return;
  discovering = true;

  window.addEventListener('eip6963:announceProvider', (event) => {
    const { info, provider } = (event as AnnounceEvent).detail;
    if (snapshot.wallets.some((w) => w.uuid === info.uuid)) return;
    const wallet = { ...info, provider };
    set({ wallets: [...snapshot.wallets, wallet] });
    void reconnect(wallet);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/** Account and chain changes come from the wallet, not from us. */
let bound: { provider: EIP1193Provider; accounts: (a: unknown) => void; chain: (c: unknown) => void } | null =
  null;

function unbind() {
  if (!bound) return;
  bound.provider.removeListener('accountsChanged', bound.accounts);
  bound.provider.removeListener('chainChanged', bound.chain);
  bound = null;
}

function bind(wallet: DiscoveredWallet) {
  unbind();
  const accounts = (list: unknown) => {
    const next = (list as Address[])[0] ?? null;
    // Without this the page keeps rendering an address the user already
    // switched away from — and would ask that address to sign.
    set({ address: next, ...(next ? {} : { connected: null }) });
  };
  const chain = (id: unknown) => set({ chainId: Number(id) });

  wallet.provider.on('accountsChanged', accounts);
  wallet.provider.on('chainChanged', chain);
  bound = { provider: wallet.provider, accounts, chain };
}

function subscribe(listener: () => void) {
  discover();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;

async function connect(wallet: DiscoveredWallet) {
  set({ connecting: true, error: null });
  try {
    const accounts = (await wallet.provider.request({
      method: 'eth_requestAccounts',
    })) as Address[];
    const id = (await wallet.provider.request({ method: 'eth_chainId' })) as string;

    bind(wallet);
    remember(wallet.rdns);
    set({ connected: wallet, address: accounts[0] ?? null, chainId: Number(id) });
  } catch (e) {
    set({ error: readableError(e) });
  } finally {
    set({ connecting: false });
  }
}

/** Forgets the wallet here only. A dapp cannot revoke its own permission. */
function disconnect() {
  unbind();
  // Also stop reconnecting to it on the next load: "disconnect" that undoes
  // itself on refresh is not a disconnect.
  remember(null);
  set({ connected: null, address: null, chainId: null, error: null });
}

async function switchChain(target: Chain) {
  const provider = snapshot.connected?.provider;
  if (!provider) return;
  set({ error: null });

  const hex = `0x${target.id.toString(16)}`;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }],
    });
  } catch (e) {
    // 4902: the wallet has never heard of this chain. X Layer testnet is not in
    // any wallet's default list, so this is the normal path, not the
    // exceptional one — offer to add it rather than reporting a failure.
    if ((e as { code?: number })?.code !== 4902) {
      set({ error: readableError(e) });
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
            blockExplorerUrls: [chainOptionFor(target.id)?.deployment.explorer].filter(Boolean),
          },
        ],
      } as Parameters<EIP1193Provider['request']>[0]);
    } catch (addError) {
      set({ error: readableError(addError) });
    }
  }
}

// -------------------------------------------------------------- the hook

export function useWallet() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  /**
   * The client to sign with, or null when there is nothing safe to sign.
   *
   * Deliberately null on an unrecognised chain: a `writeContract` against an
   * address from `src/deployments.ts` while the wallet sits on some other
   * network is a transaction sent to whatever happens to live at that address
   * there. Refusing to hand out a client is cheaper than checking at every
   * call site.
   */
  const option = useMemo(() => chainOptionFor(state.chainId), [state.chainId]);

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!state.connected || !state.address || !option) return null;
    return createWalletClient({
      account: state.address,
      chain: option.chain,
      transport: custom(state.connected.provider),
    });
  }, [state.connected, state.address, option]);

  /**
   * Reads go through the same injected provider, not through a second RPC
   * config. Two benefits: there is exactly one place that decides which chain
   * we are talking to — the wallet — so a read can never answer for a chain the
   * write did not go to; and `src/chain.ts` stays the only file holding an RPC
   * URL, which is the convention the rest of the repo follows.
   */
  const publicClient = useMemo<PublicClient | null>(() => {
    if (!state.connected || !option) return null;
    return createPublicClient({
      chain: option.chain,
      transport: custom(state.connected.provider),
    });
  }, [state.connected, option]);

  return {
    ...state,
    option,
    // Stable identities: these are module functions, and wrapping them keeps
    // the hook's return shape identical to what every call site already uses.
    connect: useCallback(connect, []),
    disconnect: useCallback(disconnect, []),
    switchChain: useCallback(switchChain, []),
    walletClient,
    publicClient,
  };
}
