/**
 * The issuer's own view of an xStock, read from Backed Finance.
 *
 * This is where every published price comes from. It answers "what does the
 * issuer say `wAAPLx` is worth?" rather than "what is Apple worth?" — and for a
 * system that trades the wrapper, the second question was only ever a proxy for
 * the first. The proxy is gone: `src/marketdata.ts` was deleted in D63.
 *
 * ## Why this exists at all
 *
 * The Yahoo endpoint is undocumented, unlicensed, and unaskable: there is no
 * terms page to accept, so there is no permission to point at. That is survivable
 * for a demo and not survivable for a product that publishes derived values to a
 * public chain. Backed is not automatically better — see the licence note below —
 * but it is one email away from being explicit, and the data is *about their own
 * product*, which keeps us clear of exchange redistribution entirely. See D62.
 *
 * ## What the issuer gives that Yahoo cannot
 *
 * - **A two-sided quote for the token**, not the underlying listing.
 * - **The issuer's own spread per session** — 10bps while the market is open,
 *   rising to 50bps when it is shut. That is the uncertainty the oracle models
 *   as gap risk, published by the party actually taking the other side.
 * - **The corporate-action multiplier.** A dividend does not pay xStock holders
 *   cash; it makes each token a claim on slightly more stock. `AAPLx` sits at
 *   1.00327 today. Nothing in this repo knew that number existed, so 33bps of
 *   dividend has been absorbed as "basis" by `pnpm reconcile`. Non-payers read
 *   exactly 1.0 (TSLAx, GLDx) and payers do not (AAPLx, SPYx), which is the
 *   consistency check that makes the field believable.
 * - **The wrapper address, from the issuer.** `wrapperAddressV2` on the X Layer
 *   deployment is the `w…x` token our `ASSETS` already hold, so a mapping can be
 *   read rather than guessed.
 *
 * ## What it does NOT give, and must never be pretended to give
 *
 * - **No timestamp.** The quote arrives as a bare number. `observedAt` below is
 *   stamped by *us*, on receipt, and is therefore a weaker fact than a print
 *   time from an exchange would be. It says when we asked, not when the issuer
 *   priced. Anything that treats the two as equivalent is wrong.
 * - **No history.** One price, now. There is no series to regress a beta from,
 *   which is why `pnpm sample` writes the issuer's marks to `observations/` and
 *   `pnpm measure` derives the gap σ from that store instead (D63).
 *
 * ## Licence
 *
 * Public, no key, rate limit published in the response headers (1000/window).
 * The docs describe the API as being for "integrators such as exchanges,
 * protocols, and developers". That is a statement of intent, **not a licence** —
 * no explicit redistribution grant has been found.
 *
 * An earlier version of this note said the output "must not be published on
 * chain". It is published on chain: D62 made this the reference for every fair
 * value, on the owner's explicit decision after the position was put to them.
 * Leaving the old sentence would have been a rule the code openly breaks, which
 * is worse than an honest open risk. This is the open risk: **the terms are
 * unconfirmed, and confirming them is one email to Backed.**
 */
import type { Address } from 'viem';
import { serial } from './chain';

const CATALOGUE = 'https://api.backed.fi/api/v2/public/assets';
const QUOTES = 'https://api.xstocks.fi/api/v1';

/** The chain we care about, spelled the way the issuer spells it. */
const NETWORK = 'XLayer';

/** `pageSize` is capped at 100 by the API, and 683 assets is seven round trips. */
const PAGE_SIZE = 100;

/**
 * `quotes/assets` prices in **minor units**; `price-data` prices in dollars.
 *
 * Nothing in the response says so, and the first run of `pnpm reconcile` against
 * this module reported every issuer quote as 100× the reference — which is the
 * useful kind of wrong, because it is impossible to miss. Derived rather than
 * assumed, across two assets three orders of magnitude apart so that a constant
 * factor can be told from a per-asset one:
 *
 *     AAPLx    price-data   305.00      quote mid  30499.51    ×100.0
 *     BANKCx   price-data     0.6647    quote mid     66.297   × 99.7
 *
 * `quoteScaleCheck` below re-measures it at runtime rather than trusting this
 * constant, because a silent unit change on someone else's API is exactly the
 * class of failure this repo keeps writing tests for. See D5, and D62.
 */
export const QUOTE_MINOR_UNITS = 100;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`issuer ${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ catalogue

export interface IssuerAsset {
  /** the issuer's symbol — `AAPLx`, without the `w` our on-chain token carries */
  symbol: string;
  /** the listing it is a claim on — `AAPL` */
  underlying: string;
  isin: string;
  /** the xStock token on X Layer */
  token: Address;
  /** the wrapper on X Layer — this is what `ASSETS` holds, when it exists */
  wrapper: Address | null;
  /** `MarketHours` or `TwentyFourFive` — the issuer's, not the exchange's */
  tradingHoursMode: string;
  halted: boolean;
  /** which session the issuer considers itself in right now */
  period: string | null;
}

let cataloguePromise: Promise<IssuerAsset[]> | null = null;

/**
 * Every xStock the issuer has deployed to X Layer.
 *
 * There are far more of these than this repo has ever priced: the universe in
 * `ASSETS` is the set with a *pool*, which is a much smaller and more useful
 * question than the set with a token. Both numbers are worth knowing and they
 * are not the same number.
 */
export function issuerCatalogue(): Promise<IssuerAsset[]> {
  if (cataloguePromise) return cataloguePromise;
  cataloguePromise = (async () => {
    const out: IssuerAsset[] = [];
    // The catalogue pages from zero and reports `hasNextPage`; the quote API
    // pages from one. They are different services and the off-by-one is real.
    for (let page = 0; page < 50; page++) {
      const j = await getJson<{
        page: { hasNextPage: boolean };
        nodes: any[];
      }>(`${CATALOGUE}?page=${page}`);
      for (const n of j.nodes ?? []) {
        const d = (n.deployments ?? []).find((x: any) => x.network === NETWORK);
        if (!d?.address) continue;
        out.push({
          symbol: n.symbol,
          underlying: n.underlyingSymbol,
          isin: n.isin,
          token: d.address.toLowerCase() as Address,
          wrapper: (d.wrapperAddressV2 ?? d.wrapperAddress ?? null)?.toLowerCase() ?? null,
          tradingHoursMode: n.trading?.tradingHoursMode ?? 'unknown',
          halted: Boolean(n.isTradingHalted || n.trading?.isTradingHalted),
          period: n.trading?.currentPeriod ?? null,
        });
      }
      if (!j.page?.hasNextPage) break;
    }
    return out;
  })();
  return cataloguePromise;
}

/**
 * Our on-chain symbol → the issuer's, by **address**.
 *
 * The mechanical strip (`wAAPLx` → `AAPLx`) is right for every asset checked so
 * far, and it is still a guess. Matching on the wrapper address the issuer
 * publishes is evidence. Where both are available the address wins, for the same
 * reason `pnpm reconcile` exists: a naming convention is a claim, not a proof.
 */
export async function issuerFor(
  onchainSymbol: string,
  address?: Address,
): Promise<IssuerAsset | null> {
  const catalogue = await issuerCatalogue();
  if (address) {
    const a = address.toLowerCase();
    const byAddress = catalogue.find((x) => x.wrapper === a || x.token === a);
    if (byAddress) return byAddress;
  }
  const guess = /^w(.+)$/.exec(onchainSymbol)?.[1] ?? onchainSymbol;
  return catalogue.find((x) => x.symbol === guess) ?? null;
}

// --------------------------------------------------------------------- quotes

export type IssuerPeriod = 'market' | 'extended' | 'overnight' | 'closed';

export interface IssuerQuote {
  symbol: string;
  bid: number;
  ask: number;
  /** the midpoint — what a fair value would be built from */
  mid: number;
  /** the issuer's own spread for the session it is currently in */
  spreadBps: number;
  period: IssuerPeriod;
  canQuote: boolean;
  halted: boolean;
  /** how long the issuer says its own quote stays good for */
  validForSeconds: number;
  /**
   * When *we* received it. The issuer sends no timestamp, so this is a weaker
   * fact than a print time and is named to keep that visible.
   */
  observedAt: number;
}

let bookPromise: Promise<Map<string, IssuerQuote>> | null = null;

/** Every quotable asset, in seven requests rather than 683. */
export function issuerBook(): Promise<Map<string, IssuerQuote>> {
  if (bookPromise) return bookPromise;
  bookPromise = (async () => {
    const book = new Map<string, IssuerQuote>();
    for (let page = 1; page < 50; page++) {
      const j = await getJson<{ page: { hasNextPage: boolean }; assets: any[] }>(
        `${QUOTES}/quotes/assets?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      const observedAt = Math.floor(Date.now() / 1000);
      for (const a of j.assets ?? []) {
        const period = (a.limitsPerPeriod?.currentPeriod ?? 'closed') as IssuerPeriod;
        const bid = Number(a.bid) / QUOTE_MINOR_UNITS;
        const ask = Number(a.ask) / QUOTE_MINOR_UNITS;
        book.set(a.symbol, {
          symbol: a.symbol,
          bid,
          ask,
          mid: (bid + ask) / 2,
          spreadBps: Number(a.limitsPerPeriod?.[period]?.spreadBasisPoints ?? NaN),
          period,
          canQuote: Boolean(a.canQuote),
          halted: Boolean(a.isTradingHalted),
          validForSeconds: Number(a.quoteValiditySeconds ?? 0),
          observedAt,
        });
      }
      if (!j.page?.hasNextPage) break;
    }
    return book;
  })();
  return bookPromise;
}

/**
 * The single-number endpoint, kept separate from the book on purpose.
 *
 * `price-data` returns `{"quote": 305.07}` — one price, no side, no spread, no
 * time. It is the simplest thing the issuer publishes and the least informative;
 * `issuerBook` should be preferred everywhere. This exists so the two can be
 * compared, because a mid that disagrees with the published quote is worth
 * knowing about before either is trusted.
 */
export async function issuerPrice(symbol: string): Promise<number | null> {
  try {
    const j = await getJson<{ quote: number }>(
      `${CATALOGUE}/${encodeURIComponent(symbol)}/price-data`,
    );
    return Number.isFinite(j.quote) ? j.quote : null;
  } catch {
    return null;
  }
}

/**
 * Re-derive the unit scale instead of trusting `QUOTE_MINOR_UNITS`.
 *
 * Two endpoints publishing the same price in different units is a trap that
 * costs one wrong constant and produces values that are catastrophically,
 * silently wrong — a 100× fair value would sail past every proportional check
 * in the guard because every proportional check compares ratios. So the scale is
 * measured against the dollar-denominated endpoint each run, and the caller
 * decides what to do when the ratio is not what it was.
 */
export async function quoteScaleCheck(
  symbol: string,
): Promise<{ mid: number; priceData: number; ratio: number } | null> {
  const [book, priceData] = [await issuerBook(), await issuerPrice(symbol)];
  const q = book.get(symbol);
  if (!q || priceData == null || !(priceData > 0)) return null;
  // `mid` has already been scaled, so a correct scale reads ~1.0 here.
  return { mid: q.mid, priceData, ratio: q.mid / priceData };
}

// ----------------------------------------------------------------- multiplier

export interface Multiplier {
  /** shares per token today — 1.0 for anything that has never paid a dividend */
  current: number;
  /** a scheduled change, or null when none is pending */
  next: number | null;
  activatesAt: number | null;
  reason: string | null;
}

/**
 * The corporate-action multiplier for one token.
 *
 * This is the field that makes the wrapper stop being one share. A dividend is
 * paid to the custodian and reinvested into the position rather than distributed,
 * so the token's claim grows. Comparing an on-chain price against an unadjusted
 * reference therefore measures the dividend history as if it were basis — which
 * is exactly what this repo has been doing, unknowingly, since D38.
 *
 * **The direction is not assumed here.** Whether fair value should multiply or
 * divide by this number is an empirical question, and `pnpm reconcile` answers
 * it by measuring both against the chain. Recording the number is this
 * function's job; deciding what it means is not.
 */
export async function multiplierFor(symbol: string): Promise<Multiplier | null> {
  try {
    const j = await getJson<{
      currentMultiplier: number;
      newMultiplier: number;
      activationDateTime: number | string;
      reason: string | null;
    }>(`${QUOTES}/token/${encodeURIComponent(symbol)}/multiplier?network=${NETWORK}`);
    const next = Number(j.newMultiplier);
    return {
      current: Number(j.currentMultiplier),
      // The API uses 0 rather than null for "nothing pending".
      next: next > 0 ? next : null,
      activatesAt: j.activationDateTime ? new Date(j.activationDateTime).getTime() / 1000 : null,
      reason: j.reason ?? null,
    };
  } catch {
    return null;
  }
}

/** Multipliers for many tokens, one request at a time — the rate limit is shared. */
export function multipliersFor(symbols: readonly string[]): Promise<(Multiplier | null)[]> {
  return serial(symbols, (s) => multiplierFor(s));
}
