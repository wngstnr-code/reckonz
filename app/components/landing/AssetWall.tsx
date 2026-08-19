'use client';

import { useEffect, useRef } from 'react';

/**
 * The thirty listings, moving, and getting out of the pointer's way.
 *
 * This replaced an extruded WebGL mark, and the reason is worth keeping: that
 * canvas cost four hundred lines and a render loop to say *we have a logo*.
 * This says *thirty real securities are tokenised on this chain and we price
 * every one of them* — which is the claim the rest of the page then has to
 * live up to.
 *
 * **The symbols are handed in, never listed here.** They come from the board
 * the page already loaded, so the wall cannot show a thirty-first asset that
 * the console does not price, or miss one it does. A hard-coded list here would
 * be a second source for a fact `src/board.ts` already owns.
 *
 * **Three rows, alternating direction.** All three running the same way reads
 * as one sheet sliding off the screen; opposed rows read as depth, and the eye
 * keeps finding new marks at the seam between them.
 *
 * ## The proximity effect
 *
 * The mark nearest the pointer shrinks to 30%, its neighbours to 50%, theirs to
 * 70%, and everything past that stays full size. The pointer opens a well in
 * the wall rather than lighting one tile in it.
 *
 * Two things make that harder than it sounds, and both shaped the
 * implementation.
 *
 * **The gaps have to stay equal.** Shrinking a mark leaves a hole where the
 * rest of it was, and a row of even gaps with three ragged ones in the middle
 * looks like a rendering fault rather than an effect. So every tile also
 * carries a horizontal shift: each one moves *toward* the pointer by exactly
 * the width its neighbours between here and there gave up. The row closes
 * around the well and its rhythm never breaks.
 *
 * **It has to work while the wall is running.** That rules out changing widths:
 * a width is layout, layout changes the track's own width, and the marquee
 * loops by translating exactly `-50%` *of that width* — so a wall that resized
 * its tiles would drift off its own seam every time the pointer moved. Scale
 * and translate are transforms. They compose with the animation instead of
 * fighting it, and nothing about the track's geometry changes at all.
 *
 * ## The wall stops under the pointer
 *
 * At rest the three rows travel, and the middle one runs against the other two,
 * which is what gives the wall depth. Under the pointer that becomes a
 * liability: the well is one shape spanning three rows, and rows sliding
 * underneath it — in two directions — drag their parts of that shape through
 * the cursor at cross purposes. What should read as one object reads as three
 * strips arguing.
 *
 * So the wall comes to a stop while it is being read. The well then holds still
 * where the pointer put it, and the only thing moving is the thing the visitor
 * is doing.
 *
 * It **decelerates** rather than stopping: the rows' own `Animation` objects
 * have their `playbackRate` eased to zero, not paused. A marquee that halts in
 * one frame is the jolt this was meant to remove, relocated to the moment of
 * arrival.
 *
 * ## Why each row is repeated four times
 *
 * Two copies is all the loop needs — the animation travels half the track, so
 * the second copy lands where the first began. It is not all the *effect*
 * needs. Closing the gaps pulls every tile toward the pointer, so the row's two
 * ends draw inward by about a tile and a half, and a track that ends near the
 * frame's edge opens a bare strip there. Four copies put the ends far outside
 * the frame in both directions, and the extra tiles cost nothing: they are the
 * same thirty files the browser has already fetched.
 *
 * The track also starts one tile to the left of the frame, so the moment each
 * cycle when its leading edge would sit flush with the frame's is covered too.
 *
 * ## Why the positions are computed rather than measured
 * ## Why the positions are computed rather than measured
 *
 * The honest version reads every tile's box each frame, which is sixty
 * `getBoundingClientRect` calls against elements that are mid-animation —
 * sixty forced layout flushes, sixty times a second.
 *
 * It is not necessary. A row is a known number of identical tiles at a known
 * pitch, so the only unknown is where the track currently starts, and that is
 * one read per row. Three reads a frame, then arithmetic.
 */

/** Ten a row. Thirty divides evenly, and an uneven wall reads as a bug. */
function rowsOf(symbols: string[]): string[][] {
  const per = Math.ceil(symbols.length / 3);
  return [symbols.slice(0, per), symbols.slice(per, per * 2), symbols.slice(per * 2)];
}

/** Seconds for one full pass. Deliberately not equal: three tracks sharing a
 *  period re-align every cycle, and the moment they line up the wall stops
 *  reading as three independent things. */
const DURATIONS = [52, 61, 46];

/**
 * The well, by ring.
 *
 * Read as a curve rather than as four steps. The stated shape is a step
 * function — nearest 0.3, then 0.5, then 0.7, then 1 — and a step function is
 * visible as popping: a mark crossing a boundary jumps a fifth of its size in
 * one frame. Interpolating between these points hits every stated value at the
 * ring it belongs to and passes through the sizes in between on the way.
 */
const RINGS = [0.3, 0.5, 0.7, 1];

function shrinkAt(ring: number): number {
  if (ring >= RINGS.length - 1) return 1;
  const low = Math.floor(ring);
  const t = ring - low;
  return RINGS[low] + (RINGS[low + 1] - RINGS[low]) * t;
}

/** How fast a tile moves toward the size it should be. Per frame, not per
 *  second: the wall is only ever animated at frame rate, and a time-corrected
 *  ease here buys nothing but a division. */
const EASE = 0.18;

/** How fast a row slows to a stop and picks up again. Slower than the tiles
 *  resize, deliberately: a whole row halting is the larger movement of the two,
 *  and the larger movement is the one that has to look deliberate. */
const TURN = 0.055;

export function AssetWall({ symbols }: { symbols: string[] }) {
  const rows = rowsOf(symbols);
  const wallRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const tracks = Array.from(wall.querySelectorAll<HTMLElement>('[data-track]'));
    if (!tracks.length) return;

    const faces = tracks.map((track) =>
      Array.from(track.querySelectorAll<HTMLElement>('[data-tile]')),
    );

    /* Layout geometry, read once rather than every frame.
     *
     * `offsetLeft` and `offsetWidth` are layout values: a `transform` does not
     * touch them, so the marquee can run and the tiles can scale without any of
     * these numbers changing. The only thing that moves is where the track
     * starts, and that is one `getBoundingClientRect` per row.
     *
     * Recomputed on resize, because the tile size is a `clamp` on the viewport
     * and every number here is derived from it. */
    let offsets: number[][] = [];
    let sizes: number[] = [];

    const measure = () => {
      offsets = faces.map((row) => row.map((tile) => tile.offsetLeft));
      sizes = faces.map((row) => row[0]?.offsetWidth ?? 1);
    };
    measure();

    /* The row's own animation, so its direction can be changed without touching
       its keyframes. Empty until the animation starts, which is why it is read
       lazily rather than captured here. */
    const animationOf = (track: HTMLElement) => track.getAnimations()[0] ?? null;

    /* One rate per row, eased between travelling and stopped. */
    const rate = tracks.map(() => 1);

    // Eased state, one entry per tile, so a pointer that jumps does not teleport
    // the wall with it.
    const shrink = faces.map((row) => row.map(() => 1));
    const shift = faces.map((row) => row.map(() => 0));

    let pointerX = 0;
    let pointerY = 0;
    let inside = false;
    let frame = 0;

    const draw = () => {
      let settled = true;

      tracks.forEach((track, r) => {
        const row = faces[r];
        if (!row.length) return;

        const wanted = inside ? 0 : 1;
        if (Math.abs(wanted - rate[r]) > 0.002) {
          rate[r] += (wanted - rate[r]) * TURN;
          settled = false;

          const animation = animationOf(track);
          if (animation) {
            /* Assigning `playbackRate` holds `currentTime` and moves
               `startTime` under it, so the row never jumps — it only changes
               how fast it is going from exactly where it stands. At zero it is
               stationary rather than paused, which matters because a paused
               animation would have to be resumed and this one simply
               accelerates again. */
            animation.playbackRate = rate[r];
          }
        }

        const box = track.getBoundingClientRect();
        const size = sizes[r] || 1;
        const pitch = row.length > 1 ? offsets[r][1] - offsets[r][0] : size;
        const centreY = box.top + box.height / 2;

        // Chebyshev rather than Euclidean, because the wall is a grid of cells
        // and the effect is a square ring around one of them, not a circle.
        const verticalRing = inside ? Math.abs(pointerY - centreY) / size : Infinity;

        // Pass one: how big each tile wants to be.
        const target: number[] = [];
        for (let i = 0; i < row.length; i++) {
          const centreX = box.left + offsets[r][i] + size / 2;
          const horizontalRing = inside ? Math.abs(pointerX - centreX) / pitch : Infinity;
          target.push(shrinkAt(Math.max(horizontalRing, verticalRing)));
        }

        for (let i = 0; i < row.length; i++) {
          shrink[r][i] += (target[i] - shrink[r][i]) * EASE;
          if (Math.abs(target[i] - shrink[r][i]) > 0.001) settled = false;
        }

        // Pass two: close the gaps the shrinking opened.
        //
        // Each tile moves toward the pointer by the width every tile between it
        // and the pointer gave up. Walking outward from the smallest tile in
        // both directions accumulates exactly that, and because both sides move
        // inward the row stays put as a whole rather than sliding.
        let focus = 0;
        for (let i = 1; i < row.length; i++) {
          if (shrink[r][i] < shrink[r][focus]) focus = i;
        }

        const targetShift: number[] = new Array(row.length).fill(0);
        let given = 0;
        for (let i = focus + 1; i < row.length; i++) {
          given += (1 - shrink[r][i - 1]) * size;
          targetShift[i] = -given;
        }
        given = 0;
        for (let i = focus - 1; i >= 0; i--) {
          given += (1 - shrink[r][i + 1]) * size;
          targetShift[i] = given;
        }

        for (let i = 0; i < row.length; i++) {
          shift[r][i] += (targetShift[i] - shift[r][i]) * EASE;
          const tile = row[i];
          tile.style.setProperty('--shrink', shrink[r][i].toFixed(4));
          tile.style.setProperty('--shift', `${shift[r][i].toFixed(2)}px`);
        }
      });

      // Kept running while the pointer is inside even once the sizes have
      // settled: the tiles are travelling under a still pointer, so the ring a
      // tile is in changes without the pointer moving at all.
      if (inside || !settled) {
        frame = requestAnimationFrame(draw);
      } else {
        frame = 0;
      }
    };

    const resizes = new ResizeObserver(measure);
    resizes.observe(wall);

    const onMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      inside = true;
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const onLeave = () => {
      inside = false;
      if (!frame) frame = requestAnimationFrame(draw);
    };

    wall.addEventListener('pointermove', onMove);
    wall.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      resizes.disconnect();
      wall.removeEventListener('pointermove', onMove);
      wall.removeEventListener('pointerleave', onLeave);
    };
  }, [symbols]);

  return (
    <div
      ref={wallRef}
      className="flex h-full flex-col justify-center gap-[clamp(0.75rem,1.6vw,1.5rem)] overflow-hidden"
    >
      {rows.map((row, index) => (
        <div key={index} className="relative flex overflow-hidden">
          {/* The row twice, end to end. The animation travels exactly half the
              track, so the second copy is standing where the first was and the
              seam never arrives. */}
          <div
            data-track
            className="wall-track -ml-[calc(clamp(5.5rem,9.5vw,10rem)+clamp(0.75rem,1.6vw,1.5rem))] flex shrink-0 gap-[clamp(0.75rem,1.6vw,1.5rem)] pr-[clamp(0.75rem,1.6vw,1.5rem)]"
            style={
              {
                '--wall-name': index % 2 === 0 ? 'wall-left' : 'wall-right',
                '--wall-duration': `${DURATIONS[index]}s`,
              } as React.CSSProperties
            }
          >
            {[...row, ...row, ...row, ...row].map((symbol, i) => (
              <Tile key={`${symbol}-${i}`} symbol={symbol} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ symbol }: { symbol: string }) {
  return (
    <span
      data-tile
      className="wall-tile flex shrink-0 items-center justify-center"
      style={{
        width: 'clamp(5.5rem, 9.5vw, 10rem)',
        height: 'clamp(5.5rem, 9.5vw, 10rem)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/xstock-logos/${symbol}.svg`}
        alt={symbol}
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
