/**
 * Off-chain market data: the reference market for each tokenised equity, and
 * the 24/7 instruments used to carry its last official print forward.
 *
 * Everything here is a free public endpoint. Swapping in a paid feed later is a
 * matter of replacing these two functions — the fair-value model does not care.
 */

const UA = { 'User-Agent': 'Mozilla/5.0 (fair-value-oracle)' };

export interface Bar {
  /** seconds */
  t: number;
  close: number;
  /** session open — only populated on daily bars, used for gap statistics */
  open?: number;
}

export interface Series {
  symbol: string;
  exchange: string;
  timezone: string;
  currency: string;
  /** most recent price the venue has printed */
  last: number;
  /** epoch seconds of the last *regular session* print */
  lastRegularPrintAt: number;
  bars: Bar[];
  session: {
    preStart: number;
    regularStart: number;
    regularEnd: number;
    postEnd: number;
  } | null;
}

async function yahooChart(
  symbol: string,
  interval: string,
  range: string,
): Promise<Series> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}`;

  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`yahoo ${symbol}: HTTP ${res.status}`);
  const json = (await res.json()) as any;
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(`yahoo ${symbol}: no result`);

  const meta = r.meta;
  const ts: number[] = r.timestamp ?? [];
  const quote = r.indicators?.quote?.[0] ?? {};
  const closes: (number | null)[] = quote.close ?? [];
  const opens: (number | null)[] = quote.open ?? [];

  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const o = opens[i];
    bars.push({
      t: ts[i]!,
      close: c,
      open: o != null && Number.isFinite(o) ? o : undefined,
    });
  }

  const p = meta.currentTradingPeriod;
  return {
    symbol: meta.symbol ?? symbol,
    exchange: meta.fullExchangeName ?? 'unknown',
    timezone: meta.exchangeTimezoneName ?? 'UTC',
    currency: meta.currency ?? 'USD',
    last: meta.regularMarketPrice,
    lastRegularPrintAt: meta.regularMarketTime,
    bars,
    session: p
      ? {
          preStart: p.pre?.start ?? p.regular.start,
          regularStart: p.regular.start,
          regularEnd: p.regular.end,
          postEnd: p.post?.end ?? p.regular.end,
        }
      : null,
  };
}

/** Intraday series — used for "what has moved since the equity last printed". */
export const intraday = (symbol: string) => yahooChart(symbol, '1m', '5d');

/** Daily series — used to estimate betas. */
export const daily = (symbol: string) => yahooChart(symbol, '1d', '1y');

/** Price of a signal series at or immediately before a timestamp. */
export function priceAt(series: Series, at: number): number | null {
  let best: number | null = null;
  for (const b of series.bars) {
    if (b.t <= at) best = b.close;
    else break;
  }
  return best;
}

/** Daily close keyed by YYYY-MM-DD, so cross-timezone markets can be aligned. */
export function byDate(series: Series): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of series.bars) {
    out.set(new Date(b.t * 1000).toISOString().slice(0, 10), b.close);
  }
  return out;
}

export interface GapStats {
  /** stdev of log(open / prior close) for ordinary overnight gaps */
  overnightSd: number;
  nOvernight: number;
  /** same, but for gaps spanning a weekend or holiday */
  longSd: number;
  nLong: number;
}

/**
 * Empirical distribution of the exact quantity the oracle is predicting: the
 * jump from one session's close to the next session's open. Splitting weekend
 * gaps from overnight gaps means the band widens on a Monday because the data
 * says it should, not because of a fudge factor.
 */
export function gapStats(series: Series): GapStats {
  const overnight: number[] = [];
  const long: number[] = [];

  for (let i = 1; i < series.bars.length; i++) {
    const prev = series.bars[i - 1]!;
    const cur = series.bars[i]!;
    if (!cur.open || !(prev.close > 0) || !(cur.open > 0)) continue;
    const g = Math.log(cur.open / prev.close);
    const hours = (cur.t - prev.t) / 3600;
    (hours > 48 ? long : overnight).push(g);
  }

  const sd = (xs: number[]): number => {
    if (xs.length < 5) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(
      xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1),
    );
  };

  return {
    overnightSd: sd(overnight),
    nOvernight: overnight.length,
    longSd: sd(long),
    nLong: long.length,
  };
}

/** Log returns of consecutive aligned observations. */
export function alignedReturns(
  a: Map<string, number>,
  b: Map<string, number>,
): { ra: number[]; rb: number[] } {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort();
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const a0 = a.get(dates[i - 1]!)!;
    const a1 = a.get(dates[i]!)!;
    const b0 = b.get(dates[i - 1]!)!;
    const b1 = b.get(dates[i]!)!;
    if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) {
      ra.push(Math.log(a1 / a0));
      rb.push(Math.log(b1 / b0));
    }
  }
  return { ra, rb };
}
