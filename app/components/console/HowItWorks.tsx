/**
 * The four things that produced every number above, for the reader who scrolled.
 *
 * It sits at the bottom rather than the top on purpose. `PageHeader` already
 * says what the page is in three sentences, and a visitor who reads that and
 * then scans thirty cards has been served. This is the layer under that, and
 * putting it above the data would make everyone pay for the questions only some
 * people have.
 *
 * Each step is a claim this repo can be held to, which is why each one names the
 * thing that enforces it rather than describing an intention. "The guard reverts
 * in the same transaction" is checkable; "we take risk seriously" is not.
 */
const STEPS = [
  {
    title: 'We ask the issuer, not a chart',
    body: "Each price starts from the issuer's own mark for that exact token, adjusted for how much stock a token is a claim on. When we cannot defend a number, we publish nothing rather than a guess, which is why some rows here have no price at all.",
  },
  {
    title: 'We quote your size against real pools',
    body: 'Capacity is not estimated from pool size. Every figure on this page is your size walked through the actual Uniswap V3 liquidity on X Layer, tick by tick, the same arithmetic the pool itself runs.',
  },
  {
    title: 'The refusal happens on chain',
    body: 'Price, how risky the overnight gap is, and how far your trade would move the market are all checked inside the transaction that fills it. If any of them fails, the trade reverts. Nothing off chain is trusted to stop it.',
  },
  {
    title: 'Your keys stay yours',
    body: 'No contract here can hold your funds, and no agent holds a key that can move them. Every fill pulls against a signature you made, scoped to one token, capped in amount, and expiring in twenty minutes.',
  },
];

export function HowItWorks() {
  return (
    <section className="mt-14 border-t border-line pt-8">
      <h2 className="font-mono text-micro text-faint uppercase">How this is measured</h2>

      <div className="mt-5 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <div key={step.title}>
            <div className="font-mono text-micro text-faint">{String(i + 1).padStart(2, '0')}</div>
            <h3 className="mt-1.5 text-body font-semibold text-ink">{step.title}</h3>
            <p className="mt-1.5 text-data leading-relaxed text-dim">{step.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-8 max-w-[74ch] text-data leading-relaxed text-faint">
        None of this is advice about what to buy. You bring the idea; this works out whether the
        market can take it and refuses when it cannot.
      </p>
    </section>
  );
}
