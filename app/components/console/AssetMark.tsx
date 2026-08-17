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
 * The extensions are mixed, so the source walks `svg` then `png` then gives up
 * on the ticker. At most one 404 per PNG asset, cached by the browser after,
 * and no build step to keep a manifest honest. All thirty have a file today —
 * the ticker is there for the thirty-first, which will be listed before anyone
 * draws it, and a missing logo must never look like a missing asset.
 *
 * Both views use this. A logo in the grid and a bare ticker in the table would
 * read as two different products.
 *
 * **The frame is square and deliberately has no radius.** Every one of these
 * files is a full-bleed 256x256 canvas that carries its own shape: `wAAPLx`
 * clips itself to a notched X, the older ones fill the square and draw a disc
 * on top. `rounded-full` was cutting the first kind back into the second and
 * deleting the mark it was meant to show. Even a small radius would shave the
 * points off that X, so the frame stays out of the artwork's way and lets each
 * file decide what it is.
 */
const SOURCES = ['svg', 'png'] as const;

export function AssetMark({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const [attempt, setAttempt] = useState(0);

  if (attempt >= SOURCES.length) {
    return (
      <span
        className="flex shrink-0 items-center justify-center border border-line bg-raised font-mono text-faint"
        style={{ height: size, width: size, fontSize: size * 0.35 }}
      >
        {symbol.replace(/^w/, '').slice(0, 2)}
      </span>
    );
  }

  return (
    // Not `next/image`: these are already small, already local, and already the
    // right size on the page. An optimiser in front of them buys nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={`/xstock-logos/${symbol}.${SOURCES[attempt]}`}
      alt=""
      loading="lazy"
      onError={() => setAttempt((n) => n + 1)}
      className="shrink-0 bg-raised object-contain"
      style={{ height: size, width: size }}
    />
  );
}
