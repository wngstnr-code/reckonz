import { Console } from '@/app/components/Console';
import { PageHeader } from '@/app/components/console/PageHeader';

export const metadata = {
  title: 'Idea · Reckonz',
  description:
    'Write what you think in plain words. We turn it into a basket, size it against the real market, and tell you what we will not do.',
};

export default function IdeaPage() {
  return (
    <>
      <PageHeader title="Idea">
        Write what you think in plain words. We turn it into a basket, size it against the real
        market, and tell you what we will not do. It takes about two minutes, and you can watch
        every step of it happen.
      </PageHeader>
      <Console />
    </>
  );
}
