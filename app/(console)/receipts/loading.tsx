/**
 * The index has the same problem the detail page had, one level up.
 *
 * `force-dynamic` plus `loadRegistry()`, so arriving here from anywhere else in
 * the console leaves the previous page on screen while the chain is read. The
 * first load is server-rendered and never sees this; every navigation into
 * `/receipts` from the nav does.
 *
 * A grid of six, which is what two rows look like at the widest layout. The
 * real count is whatever the chain says and this cannot know it, so it shows a
 * plausible shape rather than a number it would have to be right about.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-9 w-[26rem] max-w-full rounded-lg bg-raised" />
      <div className="mt-3 h-4 w-[34rem] max-w-full rounded bg-raised/70" />

      <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-44 rounded-2xl border border-line bg-raised/40" />
        ))}
      </div>
    </div>
  );
}
