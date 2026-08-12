/**
 * The Foundry test count, checked against every doc that states it.
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
import { readFileSync } from 'node:fs';

/** Files that state the current count. `docs/04-decisions.md` is not here on
 *  purpose: it is append-only and every count in it is a historical one. */
const FILES = [
  'CLAUDE.md',
  'README.md',
  'docs/05-status.md',
  'docs/06-assessment.md',
  'docs/08-parallel.md',
];

/** Each pattern must capture the claimed number in group 1. */
const CLAIMS: RegExp[] = [
  /(\d+)\s+(?:Foundry\s+)?tests?\b/gi,
  /(\d+)\s+passed\b/gi,
  /\b(\d+)\s*\/\s*(\d+)\b/g, // "105/105", only on lines that mention tests
];

function actualCount(): number {
  // `forge test` is the source. Not a cached number, not a count of function
  // names — the thing that would fail CI is the thing that gets to define it.
  const out = execFileSync('forge', ['test'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const m = out.match(/\((\d+)\s+total tests\)/);
  if (!m) throw new Error('could not read a total from `forge test` output');
  return Number(m[1]);
}

/** A line whose number is about the past, not about now. */
function isHistorical(line: string): boolean {
  return line.includes('~~') || /^\s*\*\*20\d\d-\d\d-\d\d/.test(line);
}

const expected = actualCount();
const problems: string[] = [];
let checked = 0;

for (const file of FILES) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const [i, line] of lines.entries()) {
    // Everything below the log heading is history and stays as it was written.
    if (/^##+\s+(Log|History|Timeline)\b/i.test(line)) break;
    if (isHistorical(line)) continue;

    for (const pattern of CLAIMS) {
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
          problems.push(`  ${file}:${i + 1}  claims ${claimed}, actual ${expected}\n      ${line.trim()}`);
        }
      }
    }
  }
}

console.log(`\n  forge test: ${expected} tests`);
console.log(`  claims checked: ${checked} across ${FILES.length} files\n`);

if (problems.length > 0) {
  console.error('  stale test counts:\n');
  console.error(problems.join('\n'));
  console.error('\n  Fix the docs, or the suite, but do not leave them disagreeing.\n');
  process.exit(1);
}

console.log('  every stated count matches.\n');
