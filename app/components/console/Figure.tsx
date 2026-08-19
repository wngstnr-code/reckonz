/**
 * One headline number inside the green frame, with the thing that stops it
 * being read alone underneath.
 *
 * Sized for the frame rather than for the page: smaller than the same figure
 * would be outside it, because it shares a row with a heading and a 36px number
 * beside a 23px title reads as the title being the caption.
 *
 * Shared by the board and the receipts page so the two frames cannot drift into
 * two scales. The sizes are literal rather than tokens for the same reason the
 * `Hero` title is: this is one deliberate in-frame scale, and folding it into
 * the page scale would make the frame either shout or disappear.
 */
export function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10.5px] tracking-wide text-cta-3 uppercase">{label}</div>
      <div className="mt-1.5 font-mono text-[27px] leading-none font-semibold text-cta-ink">
        {value}
      </div>
      {/* Wraps. It used to be `whitespace-nowrap`, which does not shrink a line
          that no longer fits -- it pushes it out of the frame, and at 110% zoom
          the longest caption ran off the green entirely. A caption on two lines
          is worse than one; a caption outside the panel is broken. */}
      <div className="mt-1.5 text-[12.5px] text-cta-3">{children}</div>
    </div>
  );
}
