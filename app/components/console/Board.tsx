'use client';

import { useState } from 'react';
import type { Board as BoardData } from '@/src/board';
import { BoardHeader } from './BoardHeader';
import { BoardView } from './BoardView';
import { SizeControl } from './SizeControl';

/**
 * The shell that owns the size, so nothing on the page can disagree about it.
 *
 * The header counts allowed and refused, the cards each carry a verdict, and
 * the table repeats it in a column. All three answer a question about a size,
 * and holding that size in one place is what stops the summary claiming
 * fifteen allowed over a grid showing six.
 *
 * It is the only state that lives above the views. Search, filter and sort stay
 * in `BoardView` because the header does not depend on them: hiding rows should
 * not change what the market is.
 */
export function Board({
  board,
  from,
  defaultSizeUsdg,
}: {
  board: BoardData;
  from: 'blob' | 'file';
  defaultSizeUsdg: number;
}) {
  // The default only holds if the board actually measured it. A size nobody
  // quoted would make every verdict read "not measured at this size", which is
  // true and useless — the first rung is the one thing always there.
  const [sizeUsdg, setSizeUsdg] = useState(
    board.ladderUsdg.includes(defaultSizeUsdg) ? defaultSizeUsdg : board.ladderUsdg[0],
  );

  return (
    <>
      <BoardHeader board={board} sizeUsdg={sizeUsdg} from={from} />
      <SizeControl board={board} value={sizeUsdg} onChange={setSizeUsdg} />
      <BoardView board={board} sizeUsdg={sizeUsdg} />
    </>
  );
}
