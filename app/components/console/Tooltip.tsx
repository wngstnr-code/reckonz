/**
 * A fact that only the reader who wants it has to pay for.
 *
 * Two things on this console were being said out loud on every render for the
 * benefit of the one reader in twenty who needed them: the absolute timestamp
 * beside the relative one, and the impact limit under the capacity column. Both
 * are load-bearing — a capacity figure without its limit is not a measurement,
 * and D84 is the record of what that costs — and neither is worth a second line
 * of chrome on a surface that is thirty rows of data.
 *
 * So they move here. The trigger stays on screen and carries a dotted rule so
 * it reads as something to hover; the qualification arrives when asked for.
 *
 * ## Why there is no JavaScript in it
 *
 * Open-on-hover with a state hook means a re-render per pointer move across a
 * table header, a `useEffect` to close it, and a component that cannot be used
 * from a server component. CSS does the whole job here: `group-hover` and
 * `group-focus-visible` on a wrapper, opacity for the transition. It works
 * before hydration, it costs nothing, and it cannot get stuck open.
 *
 * `focus-visible` as well as hover, because a fact reachable only by pointer is
 * a fact a keyboard reader does not have. `role="tooltip"` and the wrapper's
 * `tabIndex` are what make that reachable rather than merely visible.
 *
 * ## `side`
 *
 * `top` is right nearly everywhere. The exception is anything inside a scroll
 * container: the board's table sits in `overflow-x-auto`, which clips its own
 * overflow in *both* axes, so a bubble drawn above the header row is cut off at
 * the top edge rather than floating over the page. Those pass `bottom`, and the
 * bubble opens down into the table it is describing.
 */
export function Tooltip({
  children,
  label,
  side = 'top',
}: {
  /** The visible trigger. Text, not a control — a tooltip is not an action. */
  children: React.ReactNode;
  /** What is revealed. One sentence; anything longer belongs on the page. */
  label: React.ReactNode;
  side?: 'top' | 'bottom';
}) {
  return (
    <span
      tabIndex={0}
      className="group/tip relative inline-flex cursor-help underline decoration-line decoration-dotted underline-offset-4 outline-none"
    >
      {children}

      <span
        role="tooltip"
        className={`overlay pointer-events-none absolute left-1/2 z-30 w-max max-w-[20rem] -translate-x-1/2 rounded-lg px-3 py-2 text-left text-fine leading-snug font-normal tracking-normal text-dim normal-case opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100 ${
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
      >
        {label}
      </span>
    </span>
  );
}
