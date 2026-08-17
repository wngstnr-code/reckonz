/**
 * Where the measured board lives, and how to read it back.
 *
 * A single JSON document rather than the append-only NDJSON its neighbours use,
 * because this store has no history to keep: a board is the state of every
 * market at one instant, and yesterday's is not evidence of anything. The
 * append-only stores next to it exist because their records accumulate; this
 * one is replaced whole.
 *
 * Kept separate from `board.ts` so a caller that only wants to *read* does not
 * drag the RPC client, the planner and the fair-value engine in behind it. The
 * `Board` type crosses as `import type`, which is erased.
 *
 * `readBoard` returns `null` rather than throwing on a missing or unreadable
 * file, and the difference matters at the call site: a board that has never
 * been measured is a page that says so, not a page that errors. What it must
 * never do is invent one.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Board } from './board';
import { hasBlobCredentials, type Persistence } from './evidence-store';

/**
 * Statically scoped on purpose, and it has to stay that way.
 *
 * This was `process.env.BOARD_PATH ?? …` for about an hour, and the build said
 * what that costs: a path the analyser cannot resolve makes Turbopack trace the
 * **whole project** into the serverless bundle — every source file and the
 * public folder — which slows deployments and eventually breaks them on size.
 *
 * So the two directory segments are literals. A caller that needs to write
 * somewhere else, like the worker with a volume, passes the path to
 * `writeBoard` rather than moving it into the environment where nothing can
 * follow it.
 */
const BOARD_DIR = 'observations';
const BOARD_FILE = 'board.json';
export const BOARD_PATH = `${BOARD_DIR}/${BOARD_FILE}`;

/**
 * The board is measured on one machine and read on another.
 *
 * The worker that can afford two minutes of RPC runs on Railway; the page that
 * needs the answer runs on Vercel, whose filesystem is read-only and whose
 * containers share nothing with it. A file written next to the worker is a file
 * the website cannot see — which is D80 exactly, one store over, and the reason
 * that decision exists at all.
 *
 * So the same archive carries it: one object, overwritten in place, public to
 * read. The committed `observations/board.json` stays as the floor, so a
 * deployment with no credentials still shows a real board rather than nothing.
 */
export const BOARD_BLOB_KEY = 'board/latest.json';
export const BOARD_BLOB_BASE =
  process.env.BOARD_BLOB_BASE ??
  process.env.EVIDENCE_BLOB_BASE ??
  'https://kqjdljzlkaan4s05.public.blob.vercel-storage.com';

/** Absolute, so the answer does not depend on where the process was started. */
export function boardPath(): string {
  return resolve(process.cwd(), BOARD_DIR, BOARD_FILE);
}

export function writeBoard(board: Board, path = boardPath()): string {
  writeFileSync(path, `${JSON.stringify(board, null, 2)}\n`, 'utf8');
  return path;
}

export function readBoard(): Board | null {
  try {
    return validate(JSON.parse(readFileSync(boardPath(), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * A board that cannot say when it was taken is not a board.
 *
 * D84's rule is that a capacity figure is a measurement with a date, so a
 * document missing the date is rejected outright rather than rendered with a
 * blank where the timestamp should be. Silence is recoverable; an undated
 * number is not.
 */
function validate(parsed: unknown): Board | null {
  const board = parsed as Board;
  return typeof board?.measuredAt === 'number' && Array.isArray(board.assets) ? board : null;
}

/**
 * Write the board where the website can reach it.
 *
 * Reports `blob`, `file` or `none` **with the reason** rather than a boolean,
 * for the same reason `persistBundle` does: `none` means nobody can read this,
 * and a caller that cannot tell that apart from success will announce a board
 * that is not there.
 */
export async function persistBoard(board: Board): Promise<Persistence> {
  const body = `${JSON.stringify(board, null, 2)}\n`;

  if (hasBlobCredentials()) {
    try {
      const { put } = await import('@vercel/blob');
      const result = await put(BOARD_BLOB_KEY, body, {
        access: 'public',
        contentType: 'application/json',
        // One board, one address. A random suffix would mean the reader could
        // not find the thing the writer just wrote.
        addRandomSuffix: false,
        // Every measurement replaces the last. There is no history to keep: a
        // board is every market at one instant, and yesterday's is not evidence.
        allowOverwrite: true,
      });
      return { kind: 'blob', url: result.url };
    } catch (e) {
      // Fall through to disk rather than failing — a board on the worker's own
      // volume is still worth having — but say so loudly first. Credentials
      // that exist and do not work is the D80 shape exactly: a file reported as
      // stored, on a machine the website cannot reach, while the log reads
      // like success.
      console.error(
        `board: the archive is configured and refused the write — ${(e as Error).message}. ` +
          'Falling back to disk, which this deployment cannot serve from.',
      );
      return { kind: 'file', path: writeBoard(board) };
    }
  }

  try {
    return { kind: 'file', path: writeBoard(board) };
  } catch (e) {
    return { kind: 'none', reason: (e as Error).message };
  }
}

/**
 * Read the freshest board available, and say where it came from.
 *
 * The archive first because it is the one the worker keeps current; the
 * committed file second because it is the one that ships with the deployment.
 * Never both merged, never invented.
 */
export async function fetchBoard(): Promise<{ board: Board; from: 'blob' | 'file' } | null> {
  try {
    const response = await fetch(`${BOARD_BLOB_BASE}/${BOARD_BLOB_KEY}`, { cache: 'no-store' });
    if (response.ok) {
      const board = validate(await response.json());
      if (board) return { board, from: 'blob' };
    }
  } catch {
    // Offline, or no archive yet. The committed file is the floor.
  }

  const local = readBoard();
  return local ? { board: local, from: 'file' } : null;
}
