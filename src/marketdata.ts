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
  /**
   * The currency the venue actually quotes in, when this series has been
   * converted. Present only on converted series — a USD price that used to be
   * KRW must never be indistinguishable from one that was always USD.
   */
  nativeCurrency?: string;
  /** Units of `nativeCurrency` per USD used to convert `last`. */
  fxRate?: number;
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

// ----------------------------------------------------------------- currency

/**
 * Yahoo quotes a currency pair `C=X` as **units of C per USD** — `KRW=X` is
 * ~1418, `EUR=X` is ~0.87. So a price in C becomes USD by dividing, never
 * multiplying, and getting that backwards produces a number that is wrong by
 * six orders of magnitude in one direction and looks plausible in the other.
 */
const fxCache = new Map<string, Promise<{ intra: Series; day: Series }>>();

export function fxSeries(currency: string) {
  let p = fxCache.get(currency);
  if (!p) {
    p = (async () => ({
      intra: await intraday(`${currency}=X`),
      day: await daily(`${currency}=X`),
    }))();
    fxCache.set(currency, p);
  }
  return p;
}

const div = (b: Bar, rate: number): Bar => ({
  t: b.t,
  close: b.close / rate,
  // One rate for both ends of a bar, so an intraday move stays an equity move.
  open: b.open == null ? undefined : b.open / rate,
});

/** Intraday: FX trades continuously, so the rate in force at the bar is right. */
function convertIntraday(bars: Bar[], rates: Bar[]): Bar[] {
  const out: Bar[] = [];
  let i = 0;
  let rate: number | null = null;
  for (const b of bars) {
    while (i < rates.length && rates[i]!.t <= b.t) rate = rates[i++]!.close;
    if (rate == null || !(rate > 0)) continue;
    out.push(div(b, rate));
  }
  return out;
}

/**
 * Daily: matched by calendar date, **not** by timestamp.
 *
 * A daily FX bar is stamped at the 23:00 UTC **end** of its own session — its
 * close matches the intraday rate at that timestamp, not 24h later, which is
 * checkable and was checked. A Seoul equity bar for the same trading day is
 * stamped 00:00 UTC. So a timestamp walk, which takes the last bar at or before
 * 00:00, picks the FX session *before* the equity session: an off-by-one that
 * injects a day of unrelated currency movement into every return.
 *
 * Matching on the date label pairs the Seoul session of day D with the FX
 * session ending 23:00 on day D — the one that contains it. That is the same
 * rule `alignedReturns` already uses, and it is what "the same trading day"
 * means here.
 *
 * Dates with no FX print carry the last known rate forward rather than dropping
 * the bar, so the gap statistics keep seeing a continuous series.
 */
function convertDaily(bars: Bar[], rates: Bar[]): Bar[] {
  const byDay = new Map<string, number>();
  for (const r of rates) {
    if (r.close > 0) byDay.set(new Date(r.t * 1000).toISOString().slice(0, 10), r.close);
  }
  const out: Bar[] = [];
  let rate: number | null = null;
  for (const b of bars) {
    rate = byDay.get(new Date(b.t * 1000).toISOString().slice(0, 10)) ?? rate;
    if (rate == null) continue;
    out.push(div(b, rate));
  }
  return out;
}

/**
 * Re-express a foreign-quoted series in USD.
 *
 * The two legs are converted differently on purpose. **History** is converted
 * at each bar's own contemporaneous rate, so the returns that feed the beta fit
 * and the gap statistics are true USD returns rather than KRW returns wearing a
 * dollar sign. The **last print** is converted at the rate right now, because
 * that is what is true: when Seoul is shut the equity leg is stale and the FX
 * leg is not. A Seoul close marked at the current rate is the honest USD anchor,
 * and it means only the equity component has to be carried forward.
 *
 * The resulting gap statistic includes day-over-day FX moves, which slightly
 * overstates the jump — FX trades through the night rather than gapping. That
 * error widens the band, which is the safe direction for a guard, so it is left
 * in rather than modelled away.
 */
export async function toUsd(series: Series): Promise<Series | null> {
  if (series.currency === 'USD') return series;

  let fx;
  try {
    fx = await fxSeries(series.currency);
  } catch {
    return null;
  }
  if (!(fx.intra.last > 0)) return null;

  // Daily bars need a daily rate and date matching; intraday bars need an
  // intraday rate and a timestamp walk. Picking by bar spacing keeps `toUsd`
  // usable on either without a second argument.
  const spacing =
    series.bars.length > 1 ? series.bars[1]!.t - series.bars[0]!.t : 86_400;
  const isDaily = spacing >= 3_600;

  return {
    ...series,
    currency: 'USD',
    nativeCurrency: series.currency,
    fxRate: fx.intra.last,
    last: series.last / fx.intra.last,
    bars: isDaily
      ? convertDaily(series.bars, fx.day.bars)
      : convertIntraday(series.bars, fx.intra.bars),
  };
}

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
