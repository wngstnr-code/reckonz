/**
 * A label that rolls over when the thing holding it is approached.
 *
 * Two copies of the same words stacked in a clipped box: the visible one leaves
 * through the top while its double arrives from below, both on one transform.
 * The reader sees a word replaced by itself, which is the point — the control
 * acknowledges the pointer without claiming to have changed.
 *
 * **The duplicate is `aria-hidden`.** It is the same string twice, and a screen
 * reader announcing `How it works How it works` would be the accessibility tree
 * paying for a visual effect.
 *
 * **The easing is the effect.** `cubic-bezier(0.76, 0, 0.24, 1)` is slow at both
 * ends and quick through the middle, so the words read as having weight being
 * moved rather than being swapped. A plain `ease` over this distance reads as a
 * glitch.
 *
 * It answers `group-hover`, so whatever contains it decides what counts as
 * approach. Both copies move together, which keeps them exactly one line apart
 * no matter what the type is doing.
 */
const ROLL = 'transition-transform duration-[560ms] ease-[cubic-bezier(0.76,0,0.24,1)]';

export function RollingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative block overflow-hidden">
      <span className={`block ${ROLL} group-hover:-translate-y-full`}>{children}</span>
      <span
        aria-hidden
        className={`absolute inset-0 block translate-y-full ${ROLL} group-hover:translate-y-0`}
      >
        {children}
      </span>
    </span>
  );
}
