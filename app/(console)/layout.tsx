import { Footer } from '@/app/components/console/Footer';
import { Nav } from '@/app/components/console/Nav';

/**
 * The console shell.
 *
 * `(console)` is a route group: the parentheses keep it out of the URL, so this
 * layout wraps `/verdict`, `/run`, `/theses` and `/trade` without any of them
 * living under an `/console` path. It exists so the marketing surface at `/`
 * and the tool can have different chrome while sharing one deployment, and so
 * the old page keeps working untouched while this is built beside it.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      {/* Near full bleed, following the reference: a fixed gutter rather than a
          narrow centred column. The cap only exists so an ultrawide monitor
          does not stretch a thirty-column table to the horizon. */}
      <main className="mx-auto w-full max-w-[1920px] grow px-6 py-10 md:px-[78px]">{children}</main>
      <Footer />
    </div>
  );
}
