import { PageHeader } from '@/app/components/console/PageHeader';
import { Exit } from '@/app/components/Exit';
import { Fill } from '@/app/components/Fill';
import { Mandate } from '@/app/components/Mandate';
import { MandateManage } from '@/app/components/MandateManage';

export const metadata = {
  title: 'Trade · Reckonz',
  description:
    'The part that needs your wallet. You set the rules, the chain enforces them, and no key of ours can move your money.',
};

/**
 * Four panels in the order the work happens: write the rules, watch what they
 * are doing, buy, sell.
 *
 * They stay on one page because they talk to each other while they run — a new
 * mandate tells the fill panel to re-read the chain, a settled fill tells the
 * manager its positions moved. Those messages are DOM events between siblings,
 * and splitting these four across routes would break them for no gain. The two
 * hand-offs that *do* cross a page boundary arrive from `/idea` and
 * `/receipts`, and `handoff.ts` carries those.
 */
export default function TradePage() {
  return (
    <>
      <PageHeader title="Trade">
        The one surface that needs your wallet. You write the rules, the chain enforces them inside
        the trade itself, and a trade that breaks them is undone before it settles. No key of ours
        can move your money, and nothing is signed on your behalf.
      </PageHeader>
      <Mandate />
      <MandateManage />
      <Fill />
      <Exit />
    </>
  );
}
