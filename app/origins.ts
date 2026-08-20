/**
 * The two origins, when there are two.
 *
 * The landing page lives on `reckonz.xyz` and the console on
 * `app.reckonz.xyz`, from one deployment: `proxy.ts` routes by `Host`, and the
 * handful of links that cross between them read their destination from here.
 *
 * ## Both unset means one origin, and that is the point
 *
 * `pnpm dev` is a single host, and so is every preview deployment. If either
 * variable is missing the split does not exist: `crossOrigin()` returns null,
 * the links stay relative, and `proxy.ts` returns `next()` without looking at
 * anything. So the whole arrangement is off unless production says otherwise,
 * which is what makes it safe to ship before the domain is attached — a
 * preview build behaves exactly like today's site rather than redirecting to a
 * host that is not serving yet.
 *
 * Both or neither. One of the two set alone would give links a destination the
 * proxy is not routing, or routing with no links pointing at it, and each of
 * those is worse than not splitting.
 *
 * ## Why the literals are spelled out
 *
 * `process.env.NEXT_PUBLIC_*` is substituted at build time by textual match, so
 * the full name has to appear in the source. Reading it through a variable
 * leaves `undefined` in the browser bundle, and the failure is silent — the
 * links quietly fall back to relative and nothing looks wrong until someone
 * notices the app opening on the landing domain.
 */

const APP = process.env.NEXT_PUBLIC_APP_ORIGIN;
const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN;

/** The console's origin, or null while the site is one host. */
export const APP_ORIGIN = APP && SITE ? APP.replace(/\/$/, '') : null;

/** The landing page's origin, or null while the site is one host. */
export const SITE_ORIGIN = APP && SITE ? SITE.replace(/\/$/, '') : null;

/**
 * The absolute URL for a console path, or null if it is not a crossing.
 *
 * A null answer is not a failure: it is a same-origin link, and the caller
 * should render an ordinary `<Link>` so client-side navigation still works.
 * Only a non-null answer is a real navigation to another origin — which cannot
 * be a `<Link>`, because the router cannot route across hosts.
 */
export function crossOrigin(path: string): string | null {
  return APP_ORIGIN ? `${APP_ORIGIN}${path}` : null;
}
