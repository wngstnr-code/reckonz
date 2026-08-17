'use client';

import { useCallback, useState } from 'react';
import type { Board as BoardData } from '@/src/board';
import { BoardHeader } from './BoardHeader';
import { BoardView } from './BoardView';
import { SizeControl } from './SizeControl';
import { useNow, type RefreshState } from './useBoardClock';

/**
 * The shell that owns the size and the board itself.
 *
 * **The size lives here** so nothing on the page can disagree about it. The
 * header counts allowed and refused, each card carries a verdict, and the table
 * repeats it in a column; all three answer a question about a size, and holding
 * it in one place is what stops the summary claiming fifteen allowed over a
 * grid showing six. Search, filter and sort stay in `BoardView`, because the
 * header does not depend on them: hiding rows should not change what the market
 * is.
 *
 * **The board lives here too**, so a refresh can replace it in place. The
 * server sent one and it is the floor; a newer one only ever displaces it if it
 * is genuinely newer, which is the same rule `shouldWithhold` enforces on the
 * archive. A refresh that quietly swapped in an older measurement would undo
 * that on the last hop.
 */
export function Board({
  board: initial,
  from,
  defaultSizeUsdg,
  renderedAt,
}: {
  board: BoardData;
  from: 'blob' | 'file';
  defaultSizeUsdg: number;
  /** The server's clock at render, so hydration agrees on what "now" was. */
  renderedAt: number;
}) {
  // The default only holds if the board actually measured it. A size nobody
  // quoted would make every verdict read "not measured at this size", which is
  // true and useless — the first rung is the one thing always there.
  const [sizeUsdg, setSizeUsdg] = useState(
    initial.ladderUsdg.includes(defaultSizeUsdg) ? defaultSizeUsdg : initial.ladderUsdg[0],
  );

  const [board, setBoard] = useState(initial);
  const [source, setSource] = useState(from);
  const [refresh, setRefresh] = useState<RefreshState>('idle');

  const now = useNow(renderedAt);

  const check = useCallback(async () => {
    setRefresh('checking');
    try {
      const res = await fetch('/api/board', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as { board: BoardData; source: 'blob' | 'file' };

      // Strictly newer, never merely different. The route serves a 60s cache and
      // the archive can be written by more than one worker; equal or older is
      // the normal answer, not a failure, and it deserves a calm one.
      if (next.board?.measuredAt > board.measuredAt) {
        setBoard(next.board);
        setSource(next.source);
        setRefresh('updated');
      } else {
        setRefresh('unchanged');
      }
    } catch {
      setRefresh('failed');
    }
  }, [board.measuredAt]);

  // A size that existed on the old board may not exist on the new one. Falling
  // through to "not measured at this size" across thirty cards would look like
  // a broken refresh rather than a changed ladder.
  const size = board.ladderUsdg.includes(sizeUsdg) ? sizeUsdg : board.ladderUsdg[0];

  return (
    <>
      <BoardHeader
        board={board}
        sizeUsdg={size}
        from={source}
        now={now}
        refresh={refresh}
        onRefresh={check}
      />
      <SizeControl board={board} value={size} onChange={setSizeUsdg} />
      <BoardView board={board} sizeUsdg={size} />
    </>
  );
}
