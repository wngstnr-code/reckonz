import { ASSETS } from '@/src/fairvalue';
import { Approach } from '@/app/components/landing/Approach';
import { Closing } from '@/app/components/landing/Closing';
import { Footer } from '@/app/components/landing/Footer';
import { Hero } from '@/app/components/landing/Hero';
import { HowItWorks } from '@/app/components/landing/HowItWorks';
import { SmoothScroll } from '@/app/components/landing/SmoothScroll';
import { TopBar } from '@/app/components/landing/TopBar';

/**
 * The landing page.
 *
 * It was built at `/landing` while `/` was still the prototype surface, every
 * panel stacked on one page. The prototype is deleted rather than moved: every
 * component it mounted is used by the console too, so nothing was orphaned by
 * removing it, and the disconnected branches in `Fill` and `Exit` that D102
 * recorded as reachable only from here went with it. `TradeCard` owns that
 * state now, with a real Connect button.
 *
 * One thing did not survive the deletion: the prototype listed the **testnet**
 * contract addresses, and `Footer` lists mainnet only. They are in
 * `src/deployments.ts` and in the docs, and nowhere in the UI.
 *
 * **The thirty symbols are fixed, and they are `ASSETS`.**
 *
 * They came from `fetchBoard()` first, which reads whatever the board last
 * measured. That is the right source for the console, where the question is
 * what can be traded right now, and the wrong one for a wall: the set and its
 * order could differ between two loads of the same page, and a board that had
 * never been written left the hero empty.
 *
 * A list typed out here would have been the other mistake — a second copy of a
 * fact, drifting the first time an asset is admitted. `ASSETS` in
 * `src/fairvalue.ts` is the list this repo already keeps of what it can defend
 * a price for, it is exactly thirty, every symbol has a logo file, and nothing
 * enters it without passing `pnpm reconcile`. Reading it makes the wall a
 * statement the rest of the repo has to keep true.
 */

export const metadata = {
  title: 'Reckonz — tokenised stocks, priced against the market that has to absorb them',
  description:
    'Write a thesis in plain language. Reckonz maps it onto what is actually investable on X Layer, sizes it against real pool depth, and refuses the part the market cannot take.',
};

export default function LandingPage() {
  const symbols = ASSETS.map((asset) => asset.symbol);

  return (
    <main className="min-h-screen bg-ground">
      <SmoothScroll />
      <TopBar />
      <Hero symbols={symbols} />
      <Approach />
      <HowItWorks />
      <Closing />
      <Footer />
    </main>
  );
}
