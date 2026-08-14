/**
 * Unit tests for the issuer client (src/issuer.ts).
 *
 * No network: `globalThis.fetch` is replaced with a hand-written stub for the
 * duration of the file and restored at the end.
 *
 * ORDER MATTERS. `issuerCatalogue` and `issuerBook` each hold a module-level
 * cache keyed off `Date.now()`, with no reset hook exported — the only way to
 * exercise "fresh call" vs "cache hit" vs "cache expired" is to control the
 * clock and run the three phases for each cache in that exact sequence, in
 * one continuous timeline. Do not reorder these tests or insert an unrelated
 * catalogue/book call between them: it will consume the cache state the next
 * assertion depends on.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  issuerCatalogue,
  issuerFor,
  issuerBook,
  multiplierFor,
  multipliersFor,
} from './issuer';

const CATALOGUE_URL = 'https://api.backed.fi/api/v2/public/assets';
const QUOTES_URL = 'https://api.xstocks.fi/api/v1';
const CATALOGUE_TTL_MS = 60 * 60_000;
const BOOK_TTL_MS = 30_000;

// ------------------------------------------------------------------- fixtures

let now = 1_700_000_000_000;
const originalDateNow = Date.now;
Date.now = () => now;

const originalFetch = globalThis.fetch;
let fetchImpl: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
globalThis.fetch = ((url: any) => fetchImpl(String(url))) as typeof fetch;

after(() => {
  Date.now = originalDateNow;
  globalThis.fetch = originalFetch;
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

function catalogueNode(overrides: Partial<{ symbol: string; underlyingSymbol: string; isin: string; network: string; address: string; wrapperAddressV2: string | null }> = {}) {
  const network = overrides.network ?? 'XLayer';
  return {
    symbol: overrides.symbol ?? 'AAPLx',
    underlyingSymbol: overrides.underlyingSymbol ?? 'AAPL',
    isin: overrides.isin ?? 'US0000000000',
    trading: { tradingHoursMode: 'MarketHours', currentPeriod: 'market' },
    isTradingHalted: false,
    deployments: [
      {
        network,
        address: overrides.address ?? '0x0000000000000000000000000000000000dead',
        wrapperAddressV2:
          'wrapperAddressV2' in overrides ? overrides.wrapperAddressV2 : '0x0000000000000000000000000000000000beef',
      },
    ],
  };
}

// ---------------------------------------------------------- issuerCatalogue: error

test('issuerCatalogue throws with the URL and status on a non-2xx response', async () => {
  let calls = 0;
  fetchImpl = async (url) => {
    calls += 1;
    assert.equal(url, `${CATALOGUE_URL}?page=0`);
    return fail(503);
  };

  await assert.rejects(issuerCatalogue(), (err: Error) => {
    assert.match(err.message, /503/);
    assert.match(err.message, new RegExp(CATALOGUE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return true;
  });
  assert.equal(calls, 1);

  // Move past the TTL so the rejected promise above is not what the next
  // phase's "fresh call" test reuses — the cache holds a failed fetch for the
  // same TTL as a successful one.
  now += CATALOGUE_TTL_MS + 1;
});

// ------------------------------------------------------- issuerCatalogue: TTL cache

test('issuerCatalogue fetches and parses pages, keeping only deployments on X Layer', async () => {
  let calls = 0;
  fetchImpl = async (url) => {
    calls += 1;
    if (url === `${CATALOGUE_URL}?page=0`) {
      return ok({
        page: { hasNextPage: true },
        nodes: [
          catalogueNode({ symbol: 'AAPLx' }),
          // Not on X Layer — must be dropped entirely, not just unmapped.
          catalogueNode({ symbol: 'OTHERx', network: 'Ethereum' }),
        ],
      });
    }
    if (url === `${CATALOGUE_URL}?page=1`) {
      return ok({ page: { hasNextPage: false }, nodes: [catalogueNode({ symbol: 'TSLAx', wrapperAddressV2: null })] });
    }
    throw new Error(`unexpected catalogue url: ${url}`);
  };

  const catalogue = await issuerCatalogue();
  assert.equal(calls, 2, 'must page until hasNextPage is false');
  assert.deepEqual(
    catalogue.map((a) => a.symbol),
    ['AAPLx', 'TSLAx'],
    'the off-X-Layer node must not appear at all',
  );
  assert.equal(catalogue[0]!.wrapper, '0x0000000000000000000000000000000000beef');
  assert.equal(catalogue[1]!.wrapper, null, 'a missing wrapperAddressV2 must not be guessed');
});

test('issuerCatalogue does not refetch within CATALOGUE_TTL_MS', async () => {
  let calls = 0;
  fetchImpl = async () => {
    calls += 1;
    throw new Error('must not be called — the cache should still be warm');
  };

  now += 1_000; // well inside the one-hour TTL
  const catalogue = await issuerCatalogue();
  assert.equal(calls, 0);
  assert.equal(catalogue.length, 2, 'the cached result from the previous fetch, unchanged');
});

test('issuerCatalogue refetches after CATALOGUE_TTL_MS elapses', async () => {
  let calls = 0;
  fetchImpl = async (url) => {
    calls += 1;
    if (url === `${CATALOGUE_URL}?page=0`) {
      return ok({ page: { hasNextPage: false }, nodes: [catalogueNode({ symbol: 'MSFTx' })] });
    }
    throw new Error(`unexpected catalogue url: ${url}`);
  };

  now += CATALOGUE_TTL_MS + 1;
  const catalogue = await issuerCatalogue();
  assert.equal(calls, 1);
  assert.deepEqual(
    catalogue.map((a) => a.symbol),
    ['MSFTx'],
    'a stale catalogue (delisting, halt) must not survive past its TTL',
  );
});

// ------------------------------------------------------------------------ issuerFor

test('issuerFor matches by wrapper address before falling back to the w-prefix symbol guess', async () => {
  // Reuses the warm cache from the previous test (one node: MSFTx).
  const byAddress = await issuerFor('wMSFTx', '0x0000000000000000000000000000000000beef' as any);
  assert.equal(byAddress?.symbol, 'MSFTx');

  const byGuess = await issuerFor('wMSFTx');
  assert.equal(byGuess?.symbol, 'MSFTx', 'stripping the leading w is the fallback, not the primary path');

  const noMatch = await issuerFor('wNOPEx');
  assert.equal(noMatch, null, 'an unlisted symbol must resolve to null, never a guessed asset');
});

// --------------------------------------------------------------- issuerBook: error

test('issuerBook throws with the URL and status on a non-2xx response', async () => {
  fetchImpl = async (url) => {
    assert.equal(url, `${QUOTES_URL}/quotes/assets?page=1&pageSize=100`);
    return fail(500);
  };

  await assert.rejects(issuerBook(), (err: Error) => {
    assert.match(err.message, /500/);
    return true;
  });

  now += BOOK_TTL_MS + 1; // clear the failed cache before the next phase
});

// -------------------------------------------------------------- issuerBook: TTL cache

function quoteAsset(overrides: Partial<{ symbol: string; bid: number; ask: number; period: string; spreadBps: number }> = {}) {
  const period = overrides.period ?? 'market';
  return {
    symbol: overrides.symbol ?? 'AAPLx',
    bid: overrides.bid ?? 30_000,
    ask: overrides.ask ?? 30_100,
    limitsPerPeriod: {
      currentPeriod: period,
      [period]: { spreadBasisPoints: overrides.spreadBps ?? 10 },
    },
    canQuote: true,
    isTradingHalted: false,
    quoteValiditySeconds: 15,
  };
}

test('issuerBook fetches and parses pages, converting minor-unit bid/ask into a mid', async () => {
  let calls = 0;
  fetchImpl = async (url) => {
    calls += 1;
    if (url === `${QUOTES_URL}/quotes/assets?page=1&pageSize=100`) {
      return ok({ page: { hasNextPage: false }, assets: [quoteAsset({ symbol: 'AAPLx', bid: 30_000, ask: 30_100 })] });
    }
    throw new Error(`unexpected book url: ${url}`);
  };

  const book = await issuerBook();
  assert.equal(calls, 1);
  const q = book.get('AAPLx');
  assert.ok(q);
  // QUOTE_MINOR_UNITS = 100: 30000/100=300, 30100/100=301, mid=300.5.
  assert.equal(q!.mid, 300.5);
  assert.equal(q!.spreadBps, 10);
});

test('issuerBook does not refetch within BOOK_TTL_MS', async () => {
  let calls = 0;
  fetchImpl = async () => {
    calls += 1;
    throw new Error('must not be called — the cache should still be warm');
  };

  now += 1_000; // well inside the 30s TTL
  const book = await issuerBook();
  assert.equal(calls, 0);
  assert.equal(book.get('AAPLx')?.mid, 300.5);
});

test('issuerBook refetches after BOOK_TTL_MS elapses — an unbounded cache here would zero out every gap σ', async () => {
  // This is the regression the module's own comments describe: an
  // until-process-exit book cache fed the sampler identical rows forever,
  // making every close-to-open jump exactly zero and the derived σ zero —
  // the one value `computeFairValue` refuses to publish. BOOK_TTL_MS exists
  // to prevent that; this pins that it actually expires.
  let calls = 0;
  fetchImpl = async (url) => {
    calls += 1;
    if (url === `${QUOTES_URL}/quotes/assets?page=1&pageSize=100`) {
      return ok({ page: { hasNextPage: false }, assets: [quoteAsset({ symbol: 'AAPLx', bid: 40_000, ask: 40_200 })] });
    }
    throw new Error(`unexpected book url: ${url}`);
  };

  now += BOOK_TTL_MS + 1;
  const book = await issuerBook();
  assert.equal(calls, 1, 'a call past the TTL must reach fetch, not reuse the stale book');
  assert.equal(book.get('AAPLx')?.mid, 401, 'the refetched book must be the new quote, not the cached one');
});

// -------------------------------------------------------------------- multiplierFor

test('multiplierFor returns null for a symbol the issuer does not list, rather than guessing', async () => {
  fetchImpl = async () => fail(404);
  const result = await multiplierFor('NOPEx');
  assert.equal(result, null);
});

test('multiplierFor reports 0 as "nothing pending" rather than a scheduled multiplier of zero', async () => {
  fetchImpl = async () =>
    ok({ currentMultiplier: 1.00327, newMultiplier: 0, activationDateTime: null, reason: null });
  const result = await multiplierFor('AAPLx');
  assert.equal(result?.current, 1.00327);
  assert.equal(result?.next, null);
});

test('multipliersFor preserves order and reports null in place for the one the issuer does not list', async () => {
  fetchImpl = async (url) => {
    if (url.includes('/token/AAPLx/')) {
      return ok({ currentMultiplier: 1.00327, newMultiplier: 0, activationDateTime: null, reason: null });
    }
    if (url.includes('/token/GLDx/')) {
      return ok({ currentMultiplier: 1.0, newMultiplier: 0, activationDateTime: null, reason: null });
    }
    return fail(404); // NOPEx
  };

  const results = await multipliersFor(['AAPLx', 'NOPEx', 'GLDx']);
  assert.equal(results.length, 3);
  assert.equal(results[0]?.current, 1.00327);
  assert.equal(results[1], null);
  assert.equal(results[2]?.current, 1.0);
});
