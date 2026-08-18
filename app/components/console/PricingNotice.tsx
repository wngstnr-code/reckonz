import type { Board } from '@/src/board';
import { pricing } from './board-format';

/**
 * The difference between a broken market and a broken feed, said out loud.
 *
 * Without this the page renders a wall of refusals and a reader concludes the
 * chain is empty. What is actually true is the opposite of the impression: the
 * depth below is real, measured on chain, and unaffected — it is our own price
 * that is missing, so there is nothing to check a trade against and every
 * verdict is a refusal by us rather than by the market.
 *
 * It is drawn in caution rather than refuse. Nothing is wrong here in the sense
 * that needs alarm: the oracle is doing exactly what D62 and the cross-check in
 * D79 built it to do, which is decline to invent a number it cannot defend.
 * Red would tell a reader to distrust the system that is currently protecting
 * them.
 *
 * Quiet when everything is priced, which is the normal case and deserves no
 * furniture.
 */
export function PricingNotice({ board }: { board: Board }) {
  const { priced, unpriced, blind } = pricing(board);
  if (unpriced === 0) return null;

  const withDepth = board.assets.filter((a) => a.depth === 'ok').length;

  return (
    <div className="mt-10 max-w-[74ch] rounded-xl border border-caution/40 bg-caution/6 p-4">
      <h2 className="font-mono text-micro text-caution uppercase">
        {blind ? 'No prices on this measurement' : `${unpriced} without a price we can defend`}
      </h2>

      <p className="mt-2.5 text-data leading-relaxed text-dim">
        {blind ? (
          <>
            The issuer's price feed did not answer when this board was measured, so every value is
            withheld rather than guessed. The depth is unaffected: {withDepth} of these markets
            were measured on chain and hold real liquidity. What is missing is our own price, and
            without one there is nothing to check a trade against, so everything below is refused
            by us rather than by the market.
          </>
        ) : (
          <>
            {priced} of {board.assets.length} carry a price we can stand behind. For the rest the
            oracle declined to publish a value on this measurement, so they are refused until it
            can. Their depth was still measured and is still real.
          </>
        )}
      </p>
    </div>
  );
}
