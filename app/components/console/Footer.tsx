import Link from 'next/link';
import { MAINNET } from '@/src/deployments';
import { Wordmark } from './Wordmark';

/**
 * The console footer.
 *
 * Laid out to the reference the design owner picked: the mark alone on the top
 * row, link columns beneath it, a prose column holding the right edge, a rule,
 * then a loose bottom bar with the legal line on one side and the social mark
 * on the other.
 *
 * It carries its own colours rather than the page's. One grey in both themes,
 * black type on it, so the footer reads as the slab the page ends on instead of
 * as more content that happens to have stopped. See `--color-footer` for why
 * that survives the theme swap without a second set of values.
 *
 * No rule along the top edge, by the design owner's call. Against a white page
 * the boundary is a few percent of tone and nothing else, which is a quieter
 * seam than a line — worth knowing before anyone adds one back thinking it went
 * missing.
 *
 * There is no Docs, no Blog, no About: every entry here resolves to something
 * that works today, which is the same rule the navigation follows. A footer
 * full of dead links is the cheapest possible way to look unfinished.
 *
 * X and GitHub live only as marks in the bottom bar. They were a column too
 * for a while, which meant the same two destinations appeared twice within
 * about eighty pixels of each other — a column of two is thin, and the icons
 * were always going to be the thing people reach for.
 *
 * The right-hand column is every mainnet contract by name, each one a link to
 * its address on the explorer. It is the least decorative thing on the page and
 * probably the most persuasive: a footer that hands a stranger eight addresses
 * they can go and read is making a claim it cannot walk back. The list is built
 * from `src/deployments.ts` rather than typed here, so a redeploy cannot leave
 * a wrong address behind.
 *
 * GitHub is live as of 2026-08-17, when the repository went public. It was
 * written and flagged off before that, because a link to a 404 is worse than an
 * absent one.
 */

const REPO_IS_PUBLIC = true;
const REPO_URL = 'https://github.com/wngstnr-code/reckonz';

export function Footer() {
  const mainnet = MAINNET;

  return (
    <footer className="mt-20 bg-[var(--color-footer)] text-[var(--color-footer-ink)]">
      <div className="mx-auto w-full max-w-[1920px] px-6 py-14 md:px-[78px]">
        <Wordmark size="lg" />

        <div className="mt-16 flex flex-wrap gap-x-20 gap-y-12">
          <Column title="Product">
            <Internal href="/assets">Assets</Internal>
            <Internal href="/idea">Idea</Internal>
            <Internal href="/receipts">Receipts</Internal>
            <Internal href="/trade">Trade</Internal>
          </Column>

          <Column title="On chain">
            <External href="https://www.oklink.com/x-layer">X Layer explorer</External>
            <External href="https://sourcify.dev">Sourcify</External>
            <External href="/api/health">Status</External>
          </Column>

          {/* Every mainnet contract by name, each one a link to its address on
              the explorer. The least decorative thing on the page and probably
              the most persuasive: a footer that hands a stranger eight
              addresses to go and read is making a claim it cannot walk back.
              Built from `src/deployments.ts` rather than typed here, so a
              redeploy cannot leave a wrong address behind. */}
          {mainnet && (
            <Column title="Contracts">
              {Object.entries(mainnet.contracts).map(([name, address]) => (
                <External key={name} href={`${mainnet.explorer}/address/${address}`}>
                  {name}
                </External>
              ))}
            </Column>
          )}

          {/* The prose column, holding the right edge the way the reference
              does. Split into two headed blocks rather than one paragraph:
              what we will and will not show is a different promise from what
              this is and is not, and running them together buried both. */}
          <div className="min-w-[280px] max-w-[52ch] flex-1 space-y-5">
            <div>
              <h2 className="text-[13.5px] font-semibold">What we show you</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-footer-dim)]">
                We only show a price when we can back it up. If we cannot, we say so instead of
                guessing. We also tell you how much this market can really take, and hand back
                whatever it cannot.
              </p>
            </div>
            <div>
              <h2 className="text-[13.5px] font-semibold">Disclaimer</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-footer-dim)]">
                Your money never leaves your wallet, and no key of ours can move it. This is a
                tool, not investment advice.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-3 border-t border-[var(--color-footer-line)] pt-6">
          <span className="text-[13.5px] text-[var(--color-footer-dim)]">Reckonz © 2026</span>
          <span className="text-[13.5px] whitespace-nowrap text-[var(--color-footer-dim)]">
            X Layer
          </span>
          <div className="ml-auto flex items-center gap-5">
            <IconLink href="https://x.com/reckonz_xyz" label="Reckonz on X">
              <XMark className="h-4 w-4" />
            </IconLink>
            {REPO_IS_PUBLIC && (
              <IconLink href={REPO_URL} label="Reckonz on GitHub">
                <GitHubMark className="h-[18px] w-[18px]" />
              </IconLink>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav className="flex min-w-[9rem] flex-col gap-3.5">
      <h2 className="mb-1 text-[13.5px] font-semibold">{title}</h2>
      {children}
    </nav>
  );
}

const linkClass =
  'text-[13.5px] text-[var(--color-footer-dim)] transition-colors duration-200 hover:text-[var(--color-footer-ink)]';

/** Typed routes are on, so the href type comes from `Link` rather than `string`. */
function Internal({
  href,
  children,
}: {
  href: React.ComponentProps<typeof Link>['href'];
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  );
}

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
      className="text-[var(--color-footer-dim)] transition-colors duration-200 hover:text-[var(--color-footer-ink)]"
    >
      {children}
    </a>
  );
}

/** Slightly larger than the X mark on purpose: the octocat's silhouette carries
 *  more empty space, so matched box sizes read as mismatched marks. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
