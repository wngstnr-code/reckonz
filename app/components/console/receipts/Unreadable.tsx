/**
 * A throttled RPC is not an empty registry, and it is not a missing receipt.
 *
 * The public endpoint rate-limits hard, and rendering "nothing here" over a
 * failed read would be the most damaging thing these pages could say: they are
 * the pages that exist to prove the fills happened.
 *
 * Shared by the index and the detail route, which had drifted into saying two
 * different things about the same failure. The index has always rendered this;
 * the detail route called `notFound()` and told the reader the receipt does not
 * exist, which is a different claim and the wrong one. It is D77's shape one
 * layer out: two facts, one of them a measurement and the other the absence of
 * one, must not share a rendering.
 *
 * `id` is what separates them. With one, this is a receipt we could not read;
 * without one, it is a registry we could not read.
 *
 * ## It answers 200, and that is a real limitation
 *
 * A page cannot set a status code the way `notFound()` can, so a machine
 * fetching this route sees success and a human sees the truth. `GET
 * /api/health` is the operational answer for anything automated (D81); this is
 * the answer for the person looking at the screen.
 */
export function Unreadable({ id }: { id?: number }) {
  return (
    <div className="max-w-[62ch] rounded-xl border border-caution/40 bg-caution/6 p-4">
      <h2 className="font-mono text-micro text-caution uppercase">
        {id === undefined ? 'Could not read the registry' : `Could not read receipt #${id}`}
      </h2>
      <p className="mt-2.5 text-data leading-relaxed text-dim">
        {id === undefined ? (
          <>
            The chain did not answer. That is not the same as no receipts: nothing is being shown
            because nothing could be read. The registries are append-only, so whatever settled is
            still there.
          </>
        ) : (
          <>
            The chain did not answer. That is not the same as receipt #{id} not existing: this page
            is empty because nothing could be read, and it says so rather than reporting the
            receipt as missing. The registry is append-only, so if it settled it is still there.
            Reloading is worth trying.
          </>
        )}
      </p>
    </div>
  );
}
