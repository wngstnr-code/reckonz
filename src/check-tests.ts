/**
 * Every test count this repo states, checked against the suites that produce them.
 *
 * D60 found the number stale in five files at once — 89, 98 and 99 against an
 * actual 105. Individually trivial; the reason it is worth a script is that it
 * drifted in five places simultaneously because nothing compared them. A number
 * repeated across a repo is not documentation, it is an unverified claim in
 * several copies, and the fix for that is the same as everywhere else here:
 * derive it, do not recall it (D5).
 *
 *   pnpm check:tests
 *
 * Fails with the file, line and both numbers when a claim disagrees with what
 * `forge test` actually ran. Adding a sixth claim to a listed file needs no
 * change here — the scan is by pattern, not by a list of known sentences, so a
 * new claim is checked the moment it is written.
 *
 * Historical claims are deliberately exempt: a log entry saying "45/45 tests" on
 * 2026-08-10 is *correct* and rewriting it would be a lie about the past. So the
 * scan stops at a `## Log` heading, and skips struck-through lines and dated log
 * entries, which is how superseded statements are marked everywhere in `docs/`.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Files that state the current count. `docs/04-decisions.md` is not here on
 *  purpose: it is append-only and every count in it is a historical one. */
const FILES = [
  'CLAUDE.md',
  'README.md',
  'docs/05-status.md',
  'docs/06-assessment.md',
  'docs/08-parallel.md',
];

/**
 * There are two suites now, and therefore two numbers a doc can be wrong about.
 *
 * They are told apart by the words around the number, which is why the unit
 * suite must always be described as *unit* tests in prose. A bare "38 tests"
 * would be read as a Foundry claim and fail — deliberately: an ambiguous count
 * is the state D60 found, and the fix is to make the sentence say which suite
 * it means rather than to teach the checker to guess.
 */
interface Suite {
  name: string;
  /** Derived by running the suite. Not a cached number, not a count of function
   *  names — the thing that would fail CI is the thing that defines it. */
  actual: () => number;
  /** Each pattern must capture the claimed number in group 1. */
  claims: RegExp[];
}

function forgeCount(): number {
  const out = execFileSync('forge', ['test'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const m = out.match(/\((\d+)\s+total tests\)/);
  if (!m) throw new Error('could not read a total from `forge test` output');
  return Number(m[1]);
}

function unitCount(): number {
  // `app/components` as well as `src` since 2026-08-14: the wallet layer grew
  // logic worth pinning — a promise that never settles left the connect button
  // spinning forever (D83) — and a suite that cannot see the file where that
  // lives is a suite that guarantees the bug class stays untested.
  //
  // `app/components/console` since 2026-08-18, for the same reason one level
  // down. `board-format.ts` decides what every card and every row on /assets
  // says, including two refusals that were bugs first, and neither this list
  // nor the runner glob was recursive — so tests written for it would have been
  // collected by nothing and passed by default.
  const files = ['src', 'app/components', 'app/components/console'].flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => `${dir}/${f}`),
  );
  if (files.length === 0) return 0;

  // Node's runner exits non-zero on a failure, which `execFileSync` throws on.
  // The output is still on the error, and a red suite is worth reporting here
  // rather than crashing with a stack trace.
  let out: string;
  try {
    // `node_modules/.bin/tsx` is a shell shim that only exists on POSIX; on
    // Windows npm writes `tsx.CMD` and `tsx.ps1` instead, so the bare path is
    // `ENOENT` and this check could not run there at all. Calling the package's
    // own entry point with the Node that is already running works on both, and
    // depends on nothing the package manager decided to generate.
    const tsx = fileURLToPath(import.meta.resolve('tsx/cli'));
    out = execFileSync(process.execPath, [tsx, '--test', ...files], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    out = String((e as { stdout?: string }).stdout ?? '');
    const failed = out.match(/^.\s*fail (\d+)$/m);
    if (failed && Number(failed[1]) > 0) {
      throw new Error(`the unit suite has ${failed[1]} failing test(s) — fix those first`);
    }
    throw e;
  }
  // The total, which includes `todo` entries: a test marked todo is a claim
  // about behaviour that is written down and not yet true, and hiding it from
  // the count would be the same as not writing it.
  const m = out.match(/^.\s*tests (\d+)$/m);
  if (!m) throw new Error('could not read a total from the unit test output');
  return Number(m[1]);
}

const SUITES: Suite[] = [
  {
    name: 'forge test',
    actual: forgeCount,
    claims: [
      /(\d+)\s+(?:Foundry\s+)?tests?\b/gi,
      /(\d+)\s+passed\b/gi,
      /\b(\d+)\s*\/\s*(\d+)\b/g, // "105/105", only on lines that mention tests
    ],
  },
  {
    name: 'unit tests',
    actual: unitCount,
    claims: [/(\d+)\s+(?:unit|TypeScript)\s+tests?\b/gi],
  },
];

/** A line whose number is about the past, not about now. */
function isHistorical(line: string): boolean {
  return line.includes('~~') || /^\s*\*\*20\d\d-\d\d-\d\d/.test(line);
}

const problems: string[] = [];
let checked = 0;

console.log();
for (const suite of SUITES) {
  const expected = suite.actual();
  console.log(`  ${suite.name}: ${expected}`);

  for (const file of FILES) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const [i, line] of lines.entries()) {
      // Everything below the log heading is history and stays as it was written.
      if (/^##+\s+(Log|History|Timeline)\b/i.test(line)) break;
      if (isHistorical(line)) continue;

      for (const pattern of suite.claims) {
        // The N/N form is ambiguous on its own — "2 of 3", "28/30" — so it only
        // counts as a test claim when the line says so.
        if (pattern.source.includes('\\/') && !/test/i.test(line)) continue;

        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const claimed = Number(match[1]);
          // A pattern like `(\d+) tests?` also matches "9 tests" inside prose
          // about something else. Only numbers in the plausible range of a suite
          // size are treated as claims; below that it is not this script's call.
          if (claimed < 20) continue;
          checked += 1;
          if (claimed !== expected) {
            problems.push(
              `  ${file}:${i + 1}  claims ${claimed} ${suite.name}, actual ${expected}\n      ${line.trim()}`,
            );
          }
        }
      }
    }
  }
}

console.log(`  claims checked: ${checked} across ${FILES.length} files\n`);

if (problems.length > 0) {
  console.error('  stale test counts:\n');
  console.error(problems.join('\n'));
  console.error('\n  Fix the docs, or the suite, but do not leave them disagreeing.\n');
  process.exit(1);
}

console.log('  every stated count matches.\n');
