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
import { xLayer, xLayerTestnet, XLAYER_RPCS, XLAYER_TESTNET_RPCS } from '@/src/chain';
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
 * **WalletConnect was added on 2026-08-14 (D83)** as a second connector rather
 * than a rewrite, and the reason it fits in a few dozen lines is the shape
 * above: everything downstream — `bind`, `connect`, `switchChain`, viem's
 * `custom()` — speaks EIP-1193 and nothing else, and a WalletConnect provider is
 * EIP-1193. So it joins the same store as one more `DiscoveredWallet`, and no
 * panel, client or call site changed.
 *
 * Until then only browser extensions were reachable, which meant anyone opening
 * this page on a phone could read it and do nothing else.
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

/**
 * WalletConnect's identifier in the same namespace as EIP-6963's `rdns`.
 *
 * Not a real reverse-DNS name and deliberately not disguised as one: it is the
 * key `remember()` writes, and a reader finding `walletconnect` in localStorage
 * should not go looking for an extension that announced it.
 */
export const WALLETCONNECT_RDNS = 'walletconnect';

/**
 * Needs a project id from WalletConnect Cloud, and there is no way around it —
 * the relay refuses unauthenticated pairings. `NEXT_PUBLIC_` because the browser
 * is what connects; it is a public identifier, not a secret, and it appears in
 * every WalletConnect dapp's bundle.
 */
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';

export const walletConnectConfigured = () => WC_PROJECT_ID.length > 0;

/** Inline, so the wallet list still makes no third-party image request. */
export const WC_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#3b99fc"/><path d="M9 13.2a9.9 9.9 0 0 1 14 0l.5.5a.5.5 0 0 1 0 .7l-1.6 1.6a.26.26 0 0 1-.36 0l-.7-.68a6.9 6.9 0 0 0-9.68 0l-.74.73a.26.26 0 0 1-.36 0l-1.6-1.6a.5.5 0 0 1 0-.7Zm17.3 2.3 1.43 1.4a.5.5 0 0 1 0 .71l-6.44 6.3a.52.52 0 0 1-.72 0l-4.57-4.47a.13.13 0 0 0-.18 0l-4.57 4.47a.52.52 0 0 1-.72 0l-6.44-6.3a.5.5 0 0 1 0-.71l1.43-1.4a.52.52 0 0 1 .72 0l4.57 4.47a.13.13 0 0 0 .18 0l4.57-4.47a.52.52 0 0 1 .72 0l4.57 4.47a.13.13 0 0 0 .18 0l4.57-4.47a.52.52 0 0 1 .72 0Z" fill="#fff"/></svg>`,
  );

/**
 * One provider per page, created on demand.
 *
 * `init` opens a relay connection and restores any existing session, so calling
 * it twice would mean two sessions and two sets of listeners for one user. The
 * import is dynamic because the package is large and most visitors have an
 * extension and will never pair — an unconditional import would put the whole
 * relay client in the first byte every judge downloads.
 */
let wcProvider: Promise<DiscoveredWallet> | null = null;

/**
 * `init` can hang rather than reject, so everything that waits on it needs a
 * deadline.
 *
 * Found by clicking the button with a deliberately wrong project id: the relay
 * answered `WebSocket connection closed abnormally with code: 3000 (Project not
 * found)` as an **unhandled exception**, outside the promise being awaited. The
 * header sat on `connecting…` indefinitely, with no error, no way back, and
 * nothing in the UI to suggest anything had gone wrong. A wrong project id, an
 * offline relay or a captive network all land there.
 *
 * Twenty seconds is generous for a relay handshake and short enough that a user
 * has not yet decided the page is broken. It applies to `init` only — `enable()`
 * waits for a human to unlock a phone and scan, which is not something to put a
 * clock on.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function walletConnect(): Promise<DiscoveredWallet> {
  // The cache is cleared on failure below. Without that, one failed attempt
  // would poison every later one: `??=` would keep handing back the same
  // rejected — or worse, forever-pending — promise, and the button would stay
  // dead even after the project id was fixed.
  wcProvider ??= (async () => {
    const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
    const provider = await withDeadline(
      EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        // **Optional, never required.** A required namespace makes a wallet that
        // has never heard of X Layer refuse the pairing outright — which is most
        // of them. Optional lets it connect and then say no to the chain, which
        // is a state this page already handles: `option` is null and every panel
        // asks the user to switch.
        optionalChains: [xLayer.id, xLayerTestnet.id],
        rpcMap: {
          [xLayer.id]: XLAYER_RPCS[0],
          [xLayerTestnet.id]: XLAYER_TESTNET_RPCS[0],
        },
        showQrModal: true,
        metadata: {
          name: 'Reckonz',
          description: 'Non-custodial execution and risk tooling for tokenised equities on X Layer',
          url: typeof window === 'undefined' ? 'https://reckonz.xyz' : window.location.origin,
          icons: ['https://reckonz.xyz/logo-reckonz.png'],
        },
      }),
      20_000,
      'WalletConnect could not reach its relay — check the project id, or the network',
    );

    return {
      uuid: WALLETCONNECT_RDNS,
      name: 'WalletConnect',
      icon: WC_ICON,
      rdns: WALLETCONNECT_RDNS,
      provider: provider as unknown as EIP1193Provider,
    };
  })().catch((e) => {
    wcProvider = null;
    throw e;
  });
  return wcProvider;
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
  void reconnectWalletConnect();
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

/**
 * Pair with a phone. The QR modal is WalletConnect's own.
 *
 * `enable()` is its `eth_requestAccounts`: it opens the modal, waits for the
 * scan, and resolves with the accounts. A user who closes the modal rejects,
 * which arrives as the same 4001 an extension sends and is therefore not an
 * error worth a red banner.
 */
async function connectWalletConnect() {
  if (!walletConnectConfigured()) {
    set({ error: 'WalletConnect is not configured on this deployment' });
    return;
  }
  set({ connecting: true, error: null });
  try {
    const wallet = await walletConnect();
    const accounts = (await (
      wallet.provider as unknown as { enable: () => Promise<string[]> }
    ).enable()) as Address[];
    const id = (await wallet.provider.request({ method: 'eth_chainId' })) as string;

    bind(wallet);
    remember(WALLETCONNECT_RDNS);
    set({ connected: wallet, address: accounts[0] ?? null, chainId: Number(id) });
  } catch (e) {
    set({ error: readableError(e) });
  } finally {
    set({ connecting: false });
  }
}

/**
 * Restore a WalletConnect session, if the last connection was one.
 *
 * `init` alone rehydrates the session from storage, so a page reload picks the
 * phone back up with no modal and no scan — the same silence `reconnect()` gives
 * an extension. Only attempted when this browser last paired that way; calling
 * it otherwise would open a relay connection for a user who never asked.
 */
async function reconnectWalletConnect() {
  if (!walletConnectConfigured() || snapshot.connected) return;
  try {
    if (localStorage.getItem(REMEMBERED) !== WALLETCONNECT_RDNS) return;
    const wallet = await walletConnect();
    const session = (wallet.provider as unknown as { session?: unknown }).session;
    if (!session || snapshot.connected) return;

    const accounts = (await wallet.provider.request({ method: 'eth_accounts' })) as Address[];
    if (accounts.length === 0) return;
    const id = (await wallet.provider.request({ method: 'eth_chainId' })) as string;

    bind(wallet);
    set({ connected: wallet, address: accounts[0] ?? null, chainId: Number(id) });
  } catch {
    /* no session to restore; the button is still there */
  }
}

/** Forgets the wallet here only. A dapp cannot revoke its own permission. */
function disconnect() {
  // …except over WalletConnect, where it can and must: the session lives on the
  // relay and in the phone's wallet, so forgetting it here alone would leave a
  // pairing the user believes they ended. This is the one connector where
  // disconnect is a real operation rather than a local one.
  const wc = snapshot.connected?.rdns === WALLETCONNECT_RDNS ? snapshot.connected : null;
  if (wc) {
    void (wc.provider as unknown as { disconnect: () => Promise<void> })
      .disconnect()
      .catch(() => {
        /* already gone, or the relay is unreachable — the local state still clears */
      });
    // The provider cannot be reused after disconnecting: a fresh pairing needs a
    // fresh instance, and keeping this one would hand the next `connect()` a
    // dead session.
    wcProvider = null;
  }
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
    connectWalletConnect: useCallback(connectWalletConnect, []),
    walletConnectConfigured: walletConnectConfigured(),
    disconnect: useCallback(disconnect, []),
    switchChain: useCallback(switchChain, []),
    walletClient,
    publicClient,
  };
}
