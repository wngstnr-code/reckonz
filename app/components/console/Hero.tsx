/**
 * The claim the page makes, with the three numbers that back it beside it.
 *
 * A visitor can land here from anywhere and the navigation only says where
 * they are, not what this does. So the frame answers that first, and the board
 * underneath spends the rest of the page proving it.
 *
 * **One flat green, not the CTA's gradient.** `.cta-mesh` moves, and a moving
 * field behind reading copy fights the copy. The gradient earns its motion on a
 * button the eye should land on; a frame the eye should read through does not.
 * `cta-1` is the deepest of the four, which is what makes white type on it
 * legible without a shadow.
 *
 * **Measured contrast, so the next person does not have to guess.** White on
 * `cta-1` is 5.02:1 and passes AA for body text. Secondary type in `cta-3` is
 * 3.06:1, which passes only as large text and this is not large text. It is
 * shipped that way on purpose — it is the look that was asked for and `cta-1`
 * is already the deepest of the four — but the fix if it matters is to deepen
 * the frame rather than lighten the type: no green light enough to reach 4.5:1
 * on this field still reads as green.
 *
 * **No "onchain 24/7", deliberately.** It is the obvious line for a frame this
 * shape and it is not one this page can make: eleven of these markets hold no
 * liquidity right now, some xStocks are `TwentyFourFive` rather than always on,
 * and the counts directly below say how many we refuse. A frame promising
 * always-on trading above its own refusal count is the contradiction a judge
 * reads first.
 */
export function Hero({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="mb-8 rounded-2xl bg-cta-1 px-8 py-9 md:px-11 md:py-10">
      <div className="flex flex-col gap-x-14 gap-y-9 xl:flex-row xl:items-center xl:justify-between">
        {/* Held to about three lines. The frame is a claim, and a claim that
            runs to a paragraph stops being one. */}
        <div className="max-w-[46ch] shrink-0">
          <h1 className="text-title leading-tight font-semibold text-cta-ink">{title}</h1>
          <p className="mt-3 text-data leading-relaxed text-cta-3">{children}</p>
        </div>

        {aside}
      </div>
    </header>
  );
}
