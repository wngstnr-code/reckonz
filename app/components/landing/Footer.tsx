import { MAINNET } from '@/src/deployments';
import { Wordmark } from '../console/Wordmark';
import { GitHubMark, XMark } from '../social-marks';
import { AppLink } from './AppLink';

/**
 * The slab the landing page ends on.
 *
 * ## Same footer, different room
 *
 * Every destination and every sentence here is the console footer's. That is
 * deliberate and it is the only part of this file that is not a design
 * decision: a footer is a set of promises about what exists, and two footers
 * making different promises is one of them being wrong. What changes is the
 * room it is in — a landing page has a whole screen to end on, a console has
 * the bottom of a working surface.
 *
 * So the arrangement is the reference's rather than the console's: the columns
 * first, the mark at display size under them, and a loose bottom row. The
 * console keeps its mark on top, where it reads as a label on a slab.
 *
 * ## Black, from a literal
 *
 * The console footer is one grey in both themes with black type on it. This one
 * is the same near-black the rest of this page lights things against — the
 * hero's wall, the demo card, the cards in `How It Works` — because on a page
 * built out of dark panels a grey slab is a fourth surface with no reason to be
 * a different one.
 *
 * A literal rather than a token, for the reason those panels use one: this is
 * not part of the light/dark ladder. It is black in both themes, so the
 * foreground over it is fixed too, and a token that flipped would take the type
 * with it.
 *
 * ## What is not here
 *
 * The reference ends on `Privacy Policy` and `Terms of use`. There are no such
 * pages, so the bottom row carries the two places the project actually is
 * instead. The console footer has the rule this is following: every entry
 * resolves to something that works today, and a footer full of dead links is
 * the cheapest possible way to look unfinished.
 *
 * X and GitHub are the same marks the console uses, from `../social-marks`, so
 * the two footers cannot end up drawing slightly different logos. They are
 * drawn larger here: a 16px glyph would be the one thing on the page that had
 * not grown, and the bottom row it sits in runs a clamp of its own. GitHub
 * stays a touch bigger than X for the reason it does in the console — the
 * octocat carries more empty space, so matched boxes read as mismatched
 * marks.
 *
 * ## `relative z-10`
 *
 * The stroke that starts back in `How It Works` is positioned, and a positioned
 * element paints above ordinary block content — including content in the
 * sections after it. Without an index of its own the footer would end up
 * underneath a decoration from two sections earlier.
 */

const REPO_URL = 'https://github.com/wngstnr-code/reckonz';

export function Footer() {
  const mainnet = MAINNET;

  return (
    <footer className="relative z-10 bg-[#0b0d10] px-[max(2rem,5vw)] pt-[clamp(4rem,11vh,8rem)] pb-[clamp(2.5rem,6vh,4rem)] text-white">
      <div className="flex flex-wrap gap-x-[clamp(3rem,7vw,9rem)] gap-y-[clamp(2.5rem,5vw,4rem)]">
        {/* The console, which may be on another host — `AppLink` is what
            decides, and on two hosts these open in a new tab like the launch
            button does. */}
        <Column title="Product">
          <AppLink path="/assets" className={linkClass}>Assets</AppLink>
          <AppLink path="/idea" className={linkClass}>Idea</AppLink>
          <AppLink path="/receipts" className={linkClass}>Receipts</AppLink>
          <AppLink path="/trade" className={linkClass}>Trade</AppLink>
        </Column>

        <Column title="On chain">
          <External href="https://www.oklink.com/x-layer">X Layer explorer</External>
          <External href="https://sourcify.dev">Sourcify</External>
          <External href="/api/health">Status</External>
        </Column>

        {/* Every mainnet contract by name, each one a link to its address on the
            explorer. The least decorative thing here and probably the most
            persuasive: a footer that hands a stranger the addresses to go and
            read is making a claim it cannot walk back. Built from
            `src/deployments.ts`, so a redeploy cannot leave a wrong one behind. */}
        {mainnet && (
          <Column title="Contracts">
            {Object.entries(mainnet.contracts).map(([name, address]) => (
              <External key={name} href={`${mainnet.explorer}/address/${address}`}>
                {name}
              </External>
            ))}
          </Column>
        )}

        {/* Two headed blocks rather than one paragraph: what we will and will
            not show is a different promise from what this is and is not, and
            running them together buried both. */}
        <div className="min-w-[18rem] max-w-[46ch] flex-1 space-y-7">
          <div>
            <h2 className="text-[clamp(1rem,1.15vw,1.25rem)] font-medium">What we show you</h2>
            <p className="mt-2 text-[clamp(0.95rem,1.05vw,1.1rem)] leading-relaxed text-white/55">
              We only show a price when we can back it up. If we cannot, we say so instead of
              guessing. We also tell you how much this market can really take, and hand back
              whatever it cannot.
            </p>
          </div>
          <div>
            <h2 className="text-[clamp(1rem,1.15vw,1.25rem)] font-medium">Disclaimer</h2>
            <p className="mt-2 text-[clamp(0.95rem,1.05vw,1.1rem)] leading-relaxed text-white/55">
              Your money never leaves your wallet, and no key of ours can move it. This is a tool,
              not investment advice.
            </p>
          </div>
        </div>
      </div>

      {/* The mark, at the size the page ends on. No rule above it and none under
          it: the reference has neither, and against a slab this dark a hairline
          is a seam nobody asked for. */}
      <Wordmark size="display" className="mt-[clamp(3.5rem,11vh,8rem)]" />

      <div className="mt-[clamp(1.75rem,4vh,2.75rem)] flex flex-wrap items-center gap-x-[clamp(1.5rem,4vw,4rem)] gap-y-3 text-[clamp(0.9rem,1vw,1.05rem)]">
        <span className="text-white/55">Reckonz © 2026</span>
        <span className="whitespace-nowrap text-white/55">X Layer</span>
        <div className="ml-auto flex items-center gap-x-[clamp(1.25rem,2.5vw,2.5rem)]">
          <IconLink href="https://x.com/reckonz_xyz" label="Reckonz on X">
            <XMark className="h-[clamp(1.1rem,1.4vw,1.5rem)] w-[clamp(1.1rem,1.4vw,1.5rem)]" />
          </IconLink>
          <IconLink href={REPO_URL} label="Reckonz on GitHub">
            <GitHubMark className="h-[clamp(1.25rem,1.6vw,1.7rem)] w-[clamp(1.25rem,1.6vw,1.7rem)]" />
          </IconLink>
        </div>
      </div>
    </footer>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav className="flex min-w-[10rem] flex-col gap-[clamp(0.7rem,1vw,1.1rem)]">
      <h2 className="mb-1 text-[clamp(1rem,1.15vw,1.25rem)] font-medium">{title}</h2>
      {children}
    </nav>
  );
}

const linkClass =
  'text-[clamp(0.95rem,1.05vw,1.1rem)] text-white/55 transition-colors duration-200 hover:text-white';

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="text-white/55 transition-colors duration-200 hover:text-white"
    >
      {children}
    </a>
  );
}
