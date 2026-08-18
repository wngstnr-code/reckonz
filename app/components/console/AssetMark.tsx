'use client';

import { useState } from 'react';

/**
 * The company's logo, and the ticker when there is none.
 *
 * Served from `public/xstock-logos/`, named by our own symbol, rather than from
 * the issuer's metadata CDN. That was the first implementation and the issuer
 * answered 502 for an hour the same afternoon — a courtesy asset must not be
 * able to have an outage. Local files also mean no third-party request per
 * card, and a name that cannot drift.
 *
 * The source walks `svg` then `png` then gives up on the ticker. All thirty are
 * `.svg` today, so the second step never runs — it is kept for the thirty-first
 * asset, which will be listed before anyone draws it, and for a file dropped in
 * as a PNG. A missing logo must never look like a missing asset.
 *
 * Both views use this. A logo in the grid and a bare ticker in the table would
 * read as two different products.
 *
 * **The frame is square and deliberately has no radius.** Every file here is a
 * full-bleed 256x256 canvas carrying the xStock mark internally: a `clipPath`
 * that notches the corners into an X. `rounded-full` was masking that back into
 * a disc and deleting the shape it existed to show, and even a small radius
 * would shave the points off it. So the frame stays out of the artwork's way.
 *
 * All thirty now carry it the same way. The last five were rasters holding the
 * notch in their own alpha channel; they are SVG now, so the outline lives in
 * one kind of place across the directory and nothing in a stylesheet decides
 * it.
 *
 * **Nothing paints a background behind the mark.** `bg-raised` was there as a
 * placeholder while an image loads, and it is the reason these read as square
 * tiles: the notches are transparent by design, so a fill behind them shows
 * straight through and puts back the square the mark exists to cut away. The
 * ticker fallback keeps a fill, because there it *is* the mark, and takes the
 * outline from CSS since it has no file to carry one.
 */
const XSTOCK_MARK =
  'polygon(0% 0%, 33.6691% 0%, 50% 16.3311%, 66.3312% 0%, 100% 0%, 100% 33.6689%, ' +
  '83.6691% 50%, 100% 66.3316%, 100% 100%, 66.3312% 100%, 50% 83.6688%, 33.6691% 100%, ' +
  '0% 100%, 0% 66.3312%, 16.3313% 50%, 0% 33.6685%)';

/**
 * Which extension to try, in order.
 *
 * There was a `PNG_FIRST` set here naming the five assets that had no SVG, so
 * they would not each spend a 404 probing for one. It was right when it was
 * written and it inverted the moment those five were converted: the list then
 * named exactly the five files that no longer existed, and every page load
 * opened with five 404s and five broken marks. A hint keyed by filename cannot
 * survive the files being renamed, so it is gone rather than corrected — the
 * walk costs nothing while every asset is an `.svg`, and it is self-correcting
 * for whatever the thirty-first turns out to be.
 */
const SOURCES = ['svg', 'png'] as const;

export function AssetMark({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const [attempt, setAttempt] = useState(0);
  const sources = SOURCES;

  if (attempt >= sources.length) {
    // The ticker takes the mark's outline too, so a listing with no artwork is
    // still recognisably one of these rather than a stray box in the grid.
    return (
      <span
        className="flex shrink-0 items-center justify-center bg-raised font-mono text-faint"
        style={{ height: size, width: size, fontSize: size * 0.35, clipPath: XSTOCK_MARK }}
      >
        {symbol.replace(/^w/, '').slice(0, 2)}
      </span>
    );
  }

  const format = sources[attempt];

  return (
    // Not `next/image`: these are already small, already local, and already the
    // right size on the page. An optimiser in front of them buys nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={`/xstock-logos/${symbol}.${format}`}
      alt=""
      loading="lazy"
      onError={() => setAttempt((n) => n + 1)}
      className="shrink-0 object-contain"
      style={{ height: size, width: size }}
    />
  );
}
