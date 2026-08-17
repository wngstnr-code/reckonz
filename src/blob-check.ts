/**
 * `pnpm blob:check` — does *this* machine's environment actually reach the archive?
 *
 * The question this answers is not "are credentials present". `hasBlobCredentials`
 * already answers that, and on Railway it answers **`true` for the wrong reason**:
 * `BLOB_STORE_ID` pairs with `VERCEL_OIDC_TOKEN`, which is short-lived and injected
 * by Vercel's own runtime, so a container outside Vercel carries the store id and
 * can never obtain the token that makes it usable. The result is an archive that
 * reports itself configured while every write fails — D80's shape exactly.
 *
 * So this does the only thing that settles it: a real upload, to a throwaway key,
 * and it prints whatever the SDK says. Cheap (a few hundred bytes, overwritten in
 * place) and conclusive.
 *
 *   pnpm blob:check                       # locally, with whatever is exported here
 *   railway run pnpm blob:check           # against the worker's own environment
 *
 * Run it after setting `BLOB_READ_WRITE_TOKEN` on Railway and before believing the
 * board is reaching the website.
 */
import { hasBlobCredentials } from './evidence-store';
import { BOARD_BLOB_BASE } from './board-store';

const PROBE_KEY = 'board/_probe.json';

const present = hasBlobCredentials();
const shape = process.env.BLOB_READ_WRITE_TOKEN
  ? 'BLOB_READ_WRITE_TOKEN (static, works anywhere)'
  : process.env.BLOB_STORE_ID
    ? 'BLOB_STORE_ID only — needs VERCEL_OIDC_TOKEN, which only Vercel injects'
    : 'none';

console.log('\n  Archive reachability — measured by writing, not by checking for a variable.\n');
console.log(`  credentials present   ${present}`);
console.log(`  credential shape      ${shape}`);
console.log(`  public base           ${BOARD_BLOB_BASE}`);

if (!present) {
  console.log(
    '\n  Nothing to try. The deployment would fall back to disk, which the website\n' +
      '  cannot serve from. Set BLOB_READ_WRITE_TOKEN and run this again.\n',
  );
  process.exit(1);
}

try {
  const { put } = await import('@vercel/blob');
  const body = `${JSON.stringify({ probe: true, at: new Date().toISOString() })}\n`;
  const result = await put(PROBE_KEY, body, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log(`\n  upload                ok`);
  console.log(`  url                   ${result.url}`);

  // Writing is half of it. The board is only useful if the *website* can read it
  // back from the base the reader actually uses, and those two can disagree — the
  // store's public host is not derivable from its id (D5).
  const readBack = await fetch(`${BOARD_BLOB_BASE}/${PROBE_KEY}`, { cache: 'no-store' });
  console.log(`  read back from base   ${readBack.ok ? 'ok' : `HTTP ${readBack.status}`}`);
  if (!readBack.ok) {
    console.log(
      '\n  Written but unreadable at the base the page fetches. BOARD_BLOB_BASE is\n' +
        '  wrong for this store — take the host from the url above.\n',
    );
    process.exit(1);
  }
  console.log('\n  The worker can reach the archive, and the site can read what it writes.\n');
} catch (e) {
  console.log(`\n  upload                FAILED`);
  console.log(`  the SDK's own words   ${(e as Error).message}`);
  console.log(
    '\n  This is the false positive the note warns about: configured, and refused.\n' +
      '  /api/health will still report the archive as configured. Set a static\n' +
      '  BLOB_READ_WRITE_TOKEN from Vercel → Storage → reckonz-evidence.\n',
  );
  process.exit(1);
}
