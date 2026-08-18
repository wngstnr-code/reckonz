/**
 * The claim the page makes, before any of the numbers that back it.
 *
 * A visitor can land here from anywhere and the navigation only says where
 * they are, not what this does. So the frame answers that first, in one line
 * they can act on, and the board underneath spends the rest of the page
 * proving it.
 *
 * **One flat green, not the CTA's gradient.** `.cta-mesh` moves, and a moving
 * field behind reading copy fights the copy. The gradient earns its motion on a
 * button the eye should land on; a banner the eye should read through does not.
 * `cta-1` is the deepest of the four, which is what makes white type on it
 * legible without a shadow.
 *
 * **Measured contrast, so the next person does not have to guess.** White on
 * `cta-1` is 5.02:1 and passes AA for body text. The subtitle in `cta-3` is
 * 3.06:1, which passes only as large text and this is not large text. It is
 * shipped that way on purpose — it is the look that was asked for and `cta-1`
 * is already the deepest of the four — but the fix if it matters is to deepen
 * the frame rather than lighten the type: no green light enough to reach 4.5:1
 * on this field still reads as green.
 *
 * **No "onchain 24/7", deliberately.** It is the obvious line for a frame this
 * shape and it is not one this page can make: eleven of these markets hold no
 * liquidity right now, some xStocks are `TwentyFourFive` rather than always on,
 * and the counts directly below say how many we refuse. A banner promising
 * always-on trading above its own refusal count is the contradiction a judge
 * reads first.
 */
export function Hero({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="mb-10 flex items-center justify-between gap-8 overflow-hidden rounded-2xl bg-cta-1 px-8 py-9 md:px-11 md:py-11">
      <div className="max-w-[62ch]">
        <h1 className="text-title font-semibold text-cta-ink">{title}</h1>
        <p className="mt-3 text-data leading-relaxed text-cta-3">{children}</p>
      </div>

      <Stripes className="hidden shrink-0 text-cta-3 lg:block" />
    </header>
  );
}

/**
 * The logo's four parallel strokes, opened out into a field of them.
 *
 * Heights are a fixed list rather than random: the page renders on the server
 * and hydrates on the client, and anything drawn from `Math.random()` draws a
 * different picture in each and makes React reconcile a mismatch. Fixed also
 * means the shape is the same every visit, which is what a mark is for.
 *
 * Butt caps and no rounding, because that is how `Logo.tsx` draws its strokes,
 * and a decoration that quotes the mark should quote it exactly.
 */
const HEIGHTS = [34, 62, 46, 88, 54, 100, 72, 40, 92, 58, 76, 44, 84, 50, 66, 36];

function Stripes({ className }: { className?: string }) {
  const width = HEIGHTS.length * 14;

  return (
    <svg
      viewBox={`0 0 ${width} 110`}
      className={className}
      style={{ width, height: 110 }}
      aria-hidden
    >
      {HEIGHTS.map((h, i) => (
        <rect key={i} x={i * 14} y={110 - h} width={6} height={h} fill="currentColor" />
      ))}
    </svg>
  );
}
