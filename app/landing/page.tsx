import { fetchBoard } from '@/src/board-store';
import { Approach } from '@/app/components/landing/Approach';
import { Closing } from '@/app/components/landing/Closing';
import { Hero } from '@/app/components/landing/Hero';
import { HowItWorks } from '@/app/components/landing/HowItWorks';
import { TopBar } from '@/app/components/landing/TopBar';

/**
 * The landing page, while it is being built.
 *
 * It lives at `/landing` rather than at `/` on purpose and temporarily. `/` is
 * still the prototype surface — every panel stacked on one page — and D102
 * records that `Fill` and `Exit` keep disconnected branches reachable *only*
 * from there. Replacing that page is a decision with a blast radius, and it is
 * not this commit's.
 *
 * Moving it is one line once the rest of the page exists: this file's contents
 * become `app/page.tsx` and the prototype goes wherever it is decided to go.
 *
 * **The thirty symbols come from the board, not from a list written here.** The
 * page already had to load it, the console already treats it as the truth about
 * what is listed, and a second list on the landing page would be the one that
 * quietly stops matching. `fetchBoard` falls back to the committed file, so the
 * wall is empty only when nothing has ever been measured.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reckonz — tokenised stocks, priced against the market that has to absorb them',
  description:
    'Write a thesis in plain language. Reckonz maps it onto what is actually investable on X Layer, sizes it against real pool depth, and refuses the part the market cannot take.',
};

export default async function LandingPage() {
  const found = await fetchBoard();
  const symbols = found?.board.assets.map((asset) => asset.symbol) ?? [];

  return (
    <main className="min-h-screen bg-ground">
      <TopBar />
      <Hero symbols={symbols} />
      <Approach />
      <HowItWorks />
      <Closing />
    </main>
  );
}
