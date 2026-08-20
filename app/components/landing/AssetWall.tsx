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
 * ## Why each row is repeated three times
 *
 * Two copies is all the loop needs — the animation travels half the track, so
 * the second copy lands where the first began. It is not all the *effect*
 * needs. Closing the gaps pulls every tile toward the pointer, so the row's two
 * ends draw inward by about a tile and a half, and a track that ends near the
 * frame's edge opens a bare strip there. A third copy puts the ends far outside
 * the frame in both directions.
 *
 * It was four while rows were eight symbols long. Ten to a row buys the same
 * track from fewer repeats, which is thirty fewer elements in the document for
 * the same wall.
 *
 * The track also starts one tile to the left of the frame, so the moment each
 * cycle when its leading edge would sit flush with the frame's is covered too.
 *
 * **What that buys, in pixels, now that a tile is sized from the card's
 * height rather than from `9.5vw`.** A track must be at least twice the frame
 * wide or the seam it loops on arrives on screen. Measured at 1669x942: the
 * two short rows are 4,752px, so the wall covers a frame up to **2,376px**
 * wide. Past that the tiles would have to be repeated a fifth time. It is
 * stated rather than guarded because the guard would be a client-side
 * measurement, and this is a server-rendered list.
 *
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

/**
 * How many rows the wall is cut into.
 *
 * It was three, and three left the card short: the rows are sized from the
 * card's height now, so the row count is what decides how big a mark is. Four
 * puts a mark at about 149px in a 669px card where three put it at 160px and
 * left 141px of ground bare underneath.
 *
 * **It does not go up much further, and the reason is arithmetic.** A row has
 * to be at least twice the frame wide or its own seam arrives on screen, so
 * the tiles it needs is `2 x frameWidth / pitch` — and pitch falls as rows
 * rise. Tiles in the wall therefore grow with the *square* of this number. Six
 * rows would be a lighter wall to look at and more than twice the DOM.
 */
const ROWS = 3;

/** How many times a row is laid end to end. See the note on repeats below. */
const COPIES = 3;

/**
 * Ten to a row, cut rather than rotated, so the wall shows all thirty listings
 * and shows each of them once.
 *
 * A rotation was tried while the wall was four rows deep: thirty does not
 * divide into four, and 8/8/7/7 put a repeat inside a single screenful, so
 * overlapping ten-symbol windows were the way to keep ten distinct marks in
 * every row. Three rows need none of that. Thirty divides, the slices are
 * disjoint, and no mark appears twice anywhere in the wall.
 */
function rowsOf(symbols: string[]): string[][] {
  const per = Math.ceil(symbols.length / ROWS);
  return Array.from({ length: ROWS }, (_, r) =>
    symbols.slice(r * per, (r + 1) * per),
  );
}

/**
 * One period for every row, because every row is the same width.
 *
 * The three tracks hold the same number of tiles at the same pitch, so an
 * equal duration is an equal **speed** — which is the thing being asked for.
 * Unequal durations would have been unequal speeds, and the eye reads a wall
 * whose rows travel at different rates as three separate objects rather than
 * one surface.
 */
const DURATION = 54;

/**
 * Where each row starts in that shared cycle, as a negative delay.
 *
 * Speed is shared; phase is not. Rows 1 and 3 run the same direction at the
 * same rate, so starting them together would march them in lockstep, and the
 * seam where each track's last copy meets its first would arrive on both at
 * the same instant. A third and two thirds of a cycle apart costs nothing and
 * means no two rows are ever doing the same thing at the same time.
 */
const PHASES = [0, -18, -36];

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

/** How far the eased rate has to drift from the one the animation is actually
 *  running at before it is worth telling the animation. A twelfth of full speed
 *  is imperceptible as a step and turns a 110-commit ramp into about a dozen. */
const RATE_STEP = 0.08;

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

    const boxes: (DOMRect | null)[] = tracks.map(() => null);
    const forgetBoxes = () => boxes.fill(null);

    const measure = () => {
      offsets = faces.map((row) => row.map((tile) => tile.offsetLeft));
      sizes = faces.map((row) => row[0]?.offsetWidth ?? 1);
      forgetBoxes();
    };
    measure();

    /* The row's own animation, so its direction can be changed without touching
       its keyframes. Empty until the animation starts, which is why it is read
       lazily rather than captured here. */
    /* `getAnimations()` builds a fresh array and walks the element's timeline
       every call, and this used to be called once per row per frame — 180 of
       them a second for a set of three objects that are created once by the
       stylesheet and never replaced. Cached on first sight, and still looked up
       lazily because at mount the CSS animation may not have started yet. */
    const animations: (Animation | null)[] = tracks.map(() => null);
    const animationOf = (track: HTMLElement, r: number) => {
      if (!animations[r]) animations[r] = track.getAnimations()[0] ?? null;
      return animations[r];
    };

    /* One rate per row, eased between travelling and stopped, plus what was
       last actually handed to the animation. */
    const rate = tracks.map(() => 1);
    const committed = tracks.map(() => 1);

    // Eased state, one entry per tile, so a pointer that jumps does not teleport
    // the wall with it.
    const shrink = faces.map((row) => row.map(() => 1));
    const shift = faces.map((row) => row.map(() => 0));

    /* What is currently on each tile, so a frame that would rewrite the same
       value can skip the DOM entirely. Seeded with the resting state, which is
       also what the stylesheet's defaults are. */
    const written = faces.map((row) => row.map(() => ({ shrink: 1, shift: 0 })));

    /* Scratch space for the two passes, allocated once rather than per row per
       frame. Six arrays a frame is nothing to a modern collector, and it is
       also nothing to keep instead — the sizes never change. */
    const target = faces.map((row) => new Array<number>(row.length).fill(1));
    const targetShift = faces.map((row) => new Array<number>(row.length).fill(0));

    let pointerX = 0;
    let pointerY = 0;
    let inside = false;
    let frame = 0;
    let onScreen = true;

    const draw = () => {
      let settled = true;

      tracks.forEach((track, r) => {
        const row = faces[r];
        if (!row.length) return;

        const wanted = inside ? 0 : 1;
        if (Math.abs(wanted - rate[r]) > 0.002) {
          rate[r] += (wanted - rate[r]) * TURN;
          settled = false;
        } else {
          rate[r] = wanted;
        }

        /* The rate reaches the row's animation in steps, not every frame.
         *
         * This is the lag on letting go of the wall. Easing at `TURN` takes
         * about 110 frames to get from stopped back to full speed, and the old
         * version pushed the new rate into the animation on every one of them.
         * A composited animation re-synchronises with the main thread each time
         * its rate is written, so the whole ramp was spent committing the three
         * tracks over and over while they were also being drawn.
         *
         * The eased number is still computed every frame — the ramp's shape is
         * unchanged — but only a materially different one is handed over, which
         * is around a dozen commits instead of 110. `updatePlaybackRate` is the
         * method meant for this: it applies the change at the animation's next
         * opportunity rather than snapping `startTime` under it, so the row
         * changes speed without ever jumping position. The endpoint is always
         * committed exactly, so the row cannot settle at 0.97 of its speed. */
        const animation = animationOf(track, r);
        if (
          animation &&
          (Math.abs(rate[r] - committed[r]) > RATE_STEP || (rate[r] === wanted && committed[r] !== wanted))
        ) {
          committed[r] = rate[r];
          animation.updatePlaybackRate(rate[r]);
        }

        /* Geometry is only read when the pointer is here to need it.
         *
         * Every ring below is `Infinity` when it is not, so the whole pass
         * resolves to "full size, no shift" without knowing where anything is.
         * Reading the box anyway meant a forced layout per row per frame for
         * the entire 1.8s ride home, to compute distances from a pointer that
         * had left. While the pointer *is* here the box is only re-read while
         * the track is still moving: a stopped track has the box it had last
         * frame. */
        let box: DOMRect | null = null;
        const size = sizes[r] || 1;
        const pitch = row.length > 1 ? offsets[r][1] - offsets[r][0] : size;
        let verticalRing = Infinity;

        if (inside) {
          if (rate[r] > 0.002 || !boxes[r]) boxes[r] = track.getBoundingClientRect();
          box = boxes[r]!;
          // Chebyshev rather than Euclidean, because the wall is a grid of cells
          // and the effect is a square ring around one of them, not a circle.
          verticalRing = Math.abs(pointerY - (box.top + box.height / 2)) / size;
        }

        // Pass one: how big each tile wants to be.
        const want = target[r];
        for (let i = 0; i < row.length; i++) {
          const horizontalRing = box
            ? Math.abs(pointerX - (box.left + offsets[r][i] + size / 2)) / pitch
            : Infinity;
          want[i] = shrinkAt(Math.max(horizontalRing, verticalRing));
        }

        for (let i = 0; i < row.length; i++) {
          shrink[r][i] += (want[i] - shrink[r][i]) * EASE;
          if (Math.abs(want[i] - shrink[r][i]) > 0.001) settled = false;
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

        const wantShift = targetShift[r];
        wantShift.fill(0);
        let given = 0;
        for (let i = focus + 1; i < row.length; i++) {
          given += (1 - shrink[r][i - 1]) * size;
          wantShift[i] = -given;
        }
        given = 0;
        for (let i = focus - 1; i >= 0; i--) {
          given += (1 - shrink[r][i + 1]) * size;
          wantShift[i] = given;
        }

        /* Writes, not arithmetic, are what this loop costs. A wall of 120
           tiles was setting two custom properties on every one of them every
           frame — 240 style mutations, of which at most a dozen differed from
           the frame before, because the well only ever touches the tiles near
           the pointer. The rest were the browser being asked to re-read a
           value it already had.
           
           So each tile keeps its last written value and is written only when
           the new one would actually look different: a thousandth of a scale
           step, or a twentieth of a pixel. At rest that is zero writes a
           frame, and under a moving pointer it is the handful of tiles inside
           the well. */
        for (let i = 0; i < row.length; i++) {
          shift[r][i] += (wantShift[i] - shift[r][i]) * EASE;
          const tile = row[i];

          const nextShrink = Math.round(shrink[r][i] * 1e4) / 1e4;
          if (nextShrink !== written[r][i].shrink) {
            written[r][i].shrink = nextShrink;
            tile.style.setProperty('--shrink', String(nextShrink));
          }

          const nextShift = Math.round(shift[r][i] * 20) / 20;
          if (nextShift !== written[r][i].shift) {
            written[r][i].shift = nextShift;
            tile.style.setProperty('--shift', `${nextShift}px`);
          }
        }
      });

      // Kept running while the pointer is inside even once the sizes have
      // settled: the tiles are travelling under a still pointer, so the ring a
      // tile is in changes without the pointer moving at all.
      if (!inside && settled) {
        /* The promise is withdrawn *here*, not when the pointer left.
         *
         * Leaving is the moment the tiles have the furthest to travel: the well
         * is at its deepest and every tile in it now eases back to full size,
         * which is some forty frames of movement. Dropping `will-change` at
         * `pointerleave` destroyed the layers at the start of exactly that, so
         * the whole way home was re-rastered inside a 4,700px-wide track.
         * Measured over the 49 frames after a leave: 33.3ms median and 34 of
         * them past 20ms, against 16.7ms and none once the promise is held to
         * here.
         *
         * **`settled`, not just the tiles being home.** The tiles stop moving
         * in about a third of the time the rows take to get back up to speed,
         * and releasing at that earlier point was tried and measured: the
         * layers went at frame 32 and six frames between 38 and 49 came in at
         * 33ms, because the track is still accelerating and has to re-raster
         * without them. Holding the promise for the whole 1.8s costs the
         * compositor some memory and produces no slow frames at all. */
        wall.classList.remove('wall-live');
      }

      if (onScreen && (inside || !settled)) {
        frame = requestAnimationFrame(draw);
      } else {
        frame = 0;
      }
    };

    /* `measure` reads `offsetLeft` on all ninety tiles, which is a forced
       layout, and a window being dragged fires this many times a second.
       Coalesced to one read per frame: the sizes cannot change more often than
       that anyway, and dropping the extras keeps a resize from being the one
       interaction that stutters. */
    let pendingMeasure = 0;
    const resizes = new ResizeObserver(() => {
      if (pendingMeasure) return;
      pendingMeasure = requestAnimationFrame(() => {
        pendingMeasure = 0;
        measure();
      });
    });
    resizes.observe(wall);

    /* Scrolled past, the wall costs nothing: the CSS animations pause and the
       loop is not scheduled. A marquee nobody can see is the clearest case of
       work worth not doing, and this page is a scroll from top to bottom.
       
       **A screen of warning either side, which is the `rootMargin`.** Without
       it the wall woke at the instant its first pixel arrived, and that is the
       most expensive frame it could have picked. Off screen the compositor
       discards the raster for these tracks — three layers about 6,800 x 200
       CSS px each, which at a 2x device ratio is some 5.5 megapixels of
       rastered marks apiece, every one of them carrying a blur. Resuming at the
       boundary means painting all of that in the same frames the page is
       already moving, which is the hitch felt scrolling back up into the hero.
       
       Waking a screen early moves that work to frames where nothing is
       demanding anything, and the only thing it costs is a marquee running for
       a second while nobody is looking at it. */
    const seen = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        wall.classList.toggle('wall-idle', !onScreen);

        if (onScreen) {
          if (!frame) frame = requestAnimationFrame(draw);
          return;
        }

        /* Leaving with a pointer still in the wall used to strand the
           promotion: the loop stops being scheduled off screen, and it is the
           loop that withdraws `wall-live`, so ninety tile layers were kept
           alive for a page nobody was looking at until the wall came back.
           The state is dropped on the way out instead, and the boxes with it,
           because they describe where the tracks were a scroll ago. */
        inside = false;
        wall.classList.remove('wall-live');
        forgetBoxes();
      },
      { threshold: 0, rootMargin: '100% 0px' },
    );
    seen.observe(wall);

    /* A scroll is not a reading of the wall.
     *
     * The pointer does not move during one, so `inside` stayed true and the
     * loop kept running — four `getBoundingClientRect` calls a frame, each a
     * forced layout, while the browser was already busy moving the page. And
     * the well it was maintaining was sliding across the wall on its own,
     * which is not an effect anybody asked for. Letting go of the pointer for
     * the duration hands those frames back. */
    /* Lenis drives the scroll position with `window.scrollTo` on every frame of
       a glide, so this fires around sixty times a second for the second or so
       after each wheel. It allocated a fresh array of nulls on every one of
       them; it clears the one it has now. */
    const onScroll = () => {
      forgetBoxes();
      if (!inside) return;
      inside = false;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const onMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (!inside) {
        inside = true;
        /* The tiles are about to move, so say so now — see `.wall-live` in
           `globals.css`. Withdrawn again on the way out, because a layer per
           tile is only worth keeping while something is using it. */
        wall.classList.add('wall-live');
      }
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
      if (pendingMeasure) cancelAnimationFrame(pendingMeasure);
      resizes.disconnect();
      seen.disconnect();
      window.removeEventListener('scroll', onScroll);
      wall.classList.remove('wall-live');
      wall.removeEventListener('pointermove', onMove);
      wall.removeEventListener('pointerleave', onLeave);
    };
    /* Keyed on the contents rather than the array.
     *
     * `symbols` is rebuilt by the parent on every render, so a dependency on
     * the array itself would tear this whole effect down and stand it back up
     * — disconnecting both observers, re-querying ninety tiles and forcing a
     * layout to measure them — every time anything above it re-rendered. The
     * page is static today and nothing does; that is a fact about the page, not
     * a property of this component. */
  }, [symbols.join(',')]);

  return (
    <div
      ref={wallRef}
      /* No `h-full` here, deliberately. The card takes its own height from
         `flex-1`, and a percentage height cannot resolve against that — which
         is the bug this whole change started from. The card is a flex row
         instead, so this box is stretched to its full height by the default
         `align-items: stretch`, with no percentage in the chain at all. */
      className="flex w-full flex-col gap-[clamp(0.75rem,1.6vw,1.5rem)] overflow-hidden"
    >
      {rows.map((row, index) => (
        /* `flex-1` is what fills the card: the rows divide its height between
           them rather than stacking to whatever the tiles happen to measure,
           so there is no ground left over at the bottom at any viewport.
           `container-type: size` then makes the row's own height addressable
           as `100cqh`, which is how the tile gets square and how the track
           knows a tile's width without anybody hard-coding one. */
        <div
          key={index}
          className="relative flex min-h-0 flex-1 overflow-hidden [container-type:size]"
        >
          {/* The row twice, end to end. The animation travels exactly half the
              track, so the second copy is standing where the first was and the
              seam never arrives. */}
          <div
            data-track
            className="wall-track -ml-[calc(100cqh+clamp(0.75rem,1.6vw,1.5rem))] flex shrink-0 gap-[clamp(0.75rem,1.6vw,1.5rem)] pr-[clamp(0.75rem,1.6vw,1.5rem)]"
            style={
              {
                '--wall-name': index % 2 === 0 ? 'wall-left' : 'wall-right',
                '--wall-duration': `${DURATION}s`,
                '--wall-delay': `${PHASES[index % PHASES.length]}s`,
              } as React.CSSProperties
            }
          >
            {Array.from({ length: COPIES }, () => row)
              .flat()
              .map((symbol, i) => (
                <Tile key={`${symbol}-${i}`} symbol={symbol} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A tile takes its height from the row and its width from being square.
 *
 * It used to be a `clamp` on the viewport width, which is why the wall could
 * not fill its card: the two numbers had no relationship, so three rows of a
 * width-derived size landed wherever they landed inside a height-derived box.
 * Stretching to the row and squaring off it means the wall is exactly as tall
 * as the card by construction, and the mark's size is a consequence of how
 * many rows there are rather than a second thing to keep in sync.
 */
function Tile({ symbol }: { symbol: string }) {
  return (
    <span
      data-tile
      className="wall-tile flex aspect-square shrink-0 items-center justify-center self-stretch"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/xstock-logos/${symbol}.svg`}
        alt={symbol}
        /* Eager, not lazy.
         *
         * `lazy` is right for a mark further down a page and wrong for this
         * one: the wall is the hero, it is on screen from the first paint, and
         * it never stops moving. Deferred tiles therefore begin loading at the
         * moment they travel into view, one at a time, forever — which is a
         * hitch arriving on no schedule anybody can predict. Measured on the
         * running page: ten of the ninety were still unloaded while the wall
         * was mid-cycle.
         *
         * It costs nothing to front-load. There are thirty distinct files and
         * each appears three times, so the browser fetches thirty small SVGs
         * and serves the other sixty from cache. */
        loading="eager"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
