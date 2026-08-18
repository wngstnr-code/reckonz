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
 *
 * **Its own token, one step deeper than `cta-1`.** That was the fix named when
 * the first version measured 3.06:1 for the subtitle: deepen the field rather
 * than lighten the type, because no green light enough to clear AA on `cta-1`
 * still reads as green. On `--color-frame` the subtitle is 4.90:1 and the title
 * is 8.04:1. See the token for the derivation.
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
    <header className="rounded-2xl bg-frame px-8 py-9 md:px-11 md:py-10">
      <div className="flex flex-col gap-x-24 gap-y-8 xl:flex-row xl:items-center xl:justify-between">
        {/* Held to two lines. The frame is a claim, and a claim that runs to a
            paragraph stops being one. */}
        <div className="max-w-[52ch] shrink-0">
          <h1 className="text-[21px] leading-tight font-semibold text-cta-ink">{title}</h1>
          <p className="mt-2.5 text-meta leading-relaxed text-cta-3">{children}</p>
        </div>

        {aside}
      </div>
    </header>
  );
}
