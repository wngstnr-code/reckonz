import { PageHeader } from '@/app/components/console/PageHeader';
import { Theses } from '@/app/components/Theses';

export const metadata = {
  title: 'Receipts · Reckonz',
  description:
    'Every idea published here, and what actually happened after. The reasoning goes on chain before the trade, so nobody can rewrite it later.',
};

export default function ReceiptsPage() {
  return (
    <>
      <PageHeader title="Receipts">
        Every idea published here, and what actually happened after. The reasoning goes on chain
        before the trade, so nobody can go back and tidy it up. Losses stay on the page as long as
        the wins do.
      </PageHeader>
      <Theses />
    </>
  );
}
