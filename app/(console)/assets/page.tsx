import { PageHeader } from '@/app/components/console/PageHeader';

export const metadata = {
  title: 'Assets · Reckonz',
  description:
    'All 30 tokenised stocks on X Layer, with a fair price we can stand behind, how risky the overnight gap is, and how much each market can really take.',
};

/**
 * The one page still standing empty, and it says so.
 *
 * Every other route now renders something that works. This one cannot yet:
 * the modules that compute the board exist in `src/`, and nothing has ever
 * served them to a browser. Naming the two missing routes here is cheaper than
 * letting a visitor wonder whether the page is broken or unbuilt.
 */
const SECTIONS = [
  'What one real idea asked for, what the market could take, and what we handed back',
  'How many assets we would allow today, and the refusals grouped by reason',
  'The table: fair price, price here, overnight risk, what the market can take, verdict',
  'Whether anything can trade right now, and when these numbers were measured',
];

export default function AssetsPage() {
  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_288px]">
      <div>
        <PageHeader title="Assets">
          Before you buy, we check if the price holds up and how much this market can really take.
          All 30 tokenised stocks on X Layer are here, with what we would refuse and why. You do
          not need a wallet to read any of it.
        </PageHeader>

        <div className="flex items-baseline justify-between border-b border-line pb-2.5">
          <h2 className="font-mono text-micro text-faint uppercase">What goes here</h2>
          <span className="font-mono text-micro text-faint tabular-nums">{SECTIONS.length}</span>
        </div>

        <ol>
          {SECTIONS.map((section, i) => (
            <li key={section} className="flex gap-5 border-b border-line/60 py-3 last:border-b-0">
              <span className="shrink-0 pt-px font-mono text-micro text-faint tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-data text-dim">{section}</span>
            </li>
          ))}
        </ol>
      </div>

      <aside className="lg:pt-[4.5rem]">
        <div className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-mono text-micro text-caution uppercase">Blocked on</h2>
          <p className="mt-2.5 text-data leading-relaxed text-dim">
            Two routes have to exist before this page can be honest. One serves the guard&apos;s
            answer across all thirty assets, the other serves the stored run behind the ribbon.
            Neither exists today. The code that works both out does.
          </p>
        </div>
      </aside>
    </div>
  );
}
