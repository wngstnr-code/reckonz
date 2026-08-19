"use client";

import { Mandate } from "../../Mandate";
import { useMandateCount } from "../../mandate-presence";
import { Section } from "./Section";

/**
 * The create form, placed by whether it is the thing to do next.
 *
 * It was at the bottom, on the argument that a mandate is made once and filled
 * against daily, so the daily act should not sit below a setup step. That
 * argument only holds for a wallet that already owns one. For a wallet that owns
 * none — which is every first visit, and every judge — the entire page is inert
 * until this form is used, and burying the one control that unblocks it under a
 * capacity table is the worse of the two mistakes.
 *
 * So it is neither: the slot renders in whichever position matches the state,
 * and the same component is mounted in both places with only one of them ever
 * returning anything. It moves exactly once, when the first mandate is created,
 * and remounting the form at that moment costs a draft that has just been
 * submitted.
 *
 * `null` — no wallet, or a read that failed — takes the bottom. The rail's own
 * connect button is the action then, and a form that can only say "connect a
 * wallet" is not worth the top of the page.
 */
export function CreateMandateSlot({
  position,
}: {
  position: "top" | "bottom";
}) {
  const count = useMandateCount();
  const belongs = count === 0 ? "top" : "bottom";
  if (belongs !== position) return null;

  return (
    // The spacing belongs to the slot rather than to a wrapper on the page: a
    // wrapper with a margin around a component that renders nothing is a gap
    // above the footer for every wallet that owns a mandate.
    <div className={position === "bottom" ? "mt-14" : undefined}>
      <Section title="Create a mandate">
        {count === 0 && (
          <p className="mb-5 max-w-[68ch] text-meta leading-relaxed text-dim">
            This wallet owns none, and nothing on this page can be signed
            without one. It is the rule set the chain enforces inside the trade
            itself — what it may spend, how far off fair value it may pay, which
            assets it may hold.
          </p>
        )}
        <Mandate />
      </Section>
    </div>
  );
}
