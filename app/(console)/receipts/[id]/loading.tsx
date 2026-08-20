/**
 * What the reader sees the instant they click a receipt.
 *
 * There was nothing here, and nothing is what the route felt like. `/receipts/
 * [id]` is `force-dynamic` and its render waits on `loadRegistry()`, which is
 * two reads over a throttled public RPC before a single pixel can be decided.
 * Without a `loading` boundary the App Router holds the old page on screen for
 * that whole time: the URL does not change, the row stays where it was, and the
 * only honest reading of that is that the link is broken. It was not. It was
 * being obeyed silently.
 *
 * So this is not decoration. It is the difference between a slow page and a
 * dead one, and only one of those is a bug the reader can wait out.
 *
 * **It is the real page's skeleton, not a spinner.** Same back link in the same
 * place, a title block at the same size, and three panels at the heights the
 * sections actually take, so the content swaps in underneath a layout that has
 * not moved. A spinner would replace the page with a different page and then
 * replace that.
 */
export default function Loading() {
  return (
    <>
      <span className="font-mono text-meta text-dim">← All receipts</span>

      <div className="mt-9 animate-pulse">
        <div className="h-8 w-52 rounded-lg bg-raised" />
        <div className="mt-3 h-4 w-80 rounded bg-raised/70" />

        {/* Three panels, because the page opens on the receipt, its fills and
            its evidence. The fourth and fifth are below the fold at every
            width this console supports. */}
        <div className="mt-9 space-y-5">
          <div className="h-40 rounded-2xl border border-line bg-raised/40" />
          <div className="h-52 rounded-2xl border border-line bg-raised/40" />
          <div className="h-28 rounded-2xl border border-line bg-raised/40" />
        </div>
      </div>
    </>
  );
}
