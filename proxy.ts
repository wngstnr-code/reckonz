import { NextResponse, type NextRequest } from 'next/server';

import { APP_ORIGIN, SITE_ORIGIN } from '@/app/origins';

/**
 * Two domains, one deployment.
 *
 * `reckonz.xyz` is the landing page and `app.reckonz.xyz` is the console. They
 * are the same build — one set of routes, one traced `observations/` store, one
 * set of API handlers — split here by `Host` rather than by deploying twice.
 *
 * Named `proxy.ts`, not `middleware.ts`: the middleware convention is
 * deprecated in Next 16 and this is its replacement. Same behaviour, different
 * file and export name.
 *
 * ## Two rules, and the second one is the one that matters
 *
 * 1. On the app host, `/` has nothing to serve — the console has no index page,
 *    only `/assets`, `/idea`, `/receipts` and `/trade` — so it goes to the
 *    board.
 * 2. On the site host, a console path leaves for the app host.
 *
 * Without the second rule every console page would answer on both domains, and
 * two live URLs for one page is how a link someone shares stops matching the
 * link someone else has. The landing page is the reverse case and does not need
 * a rule: `/` on the app host is already rule one's business.
 *
 * ## 307, not 308
 *
 * A permanent redirect is what these are semantically, and it is cached by the
 * browser essentially forever — including a wrong one. Until this has run in
 * production against the real domain, a mistake has to be fixable by
 * redeploying rather than by asking people to clear their cache. Promote to 308
 * once it has been stable for a while.
 *
 * ## Off unless both origins are set
 *
 * See `app/origins.ts`: dev and preview deployments have neither variable, so
 * this returns `next()` immediately and the site behaves exactly as it does on
 * one host. That is what makes it safe to merge before the DNS record exists.
 */

/** The console's routes. `app/(console)/` is a route group, so it contributes
 *  no segment of its own — this list is the boundary, and a new console page
 *  has to be added here or it will keep answering on the landing domain. */
const CONSOLE = ['/assets', '/idea', '/receipts', '/trade', '/preview'];

export function proxy(request: NextRequest) {
  if (!APP_ORIGIN || !SITE_ORIGIN) return NextResponse.next();

  // The forwarded host, not `nextUrl` — which domain the visitor actually typed
  // is the entire input to this decision.
  const host = request.headers.get('host');
  const { pathname, search } = request.nextUrl;

  if (host === hostOf(APP_ORIGIN)) {
    if (pathname === '/') {
      // Built from `APP_ORIGIN`, not from `request.url`. `request.url` is the
      // URL this server was reached on, which is not the domain the visitor
      // typed once anything sits in front — locally it resolved to
      // `localhost`, so the app host's front door bounced people onto the
      // wrong origin entirely.
      return NextResponse.redirect(`${APP_ORIGIN}/assets`, 307);
    }
    return NextResponse.next();
  }

  if (host === hostOf(SITE_ORIGIN) && isConsole(pathname)) {
    return NextResponse.redirect(`${APP_ORIGIN}${pathname}${search}`, 307);
  }

  return NextResponse.next();
}

function hostOf(origin: string): string {
  return new URL(origin).host;
}

function isConsole(pathname: string): boolean {
  return CONSOLE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const config = {
  // Everything except the API, the build output, and anything with a file
  // extension. The API is deliberately left on both hosts: the console calls it
  // same-origin from the app domain, and redirecting a POST across hosts drops
  // its body.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
