'use client';

import { useEffect, useState } from 'react';
import { Exit } from '../../Exit';
import { Fill } from '../../Fill';
import { OPEN_WALLET_EVENT, PICK_ASSET_EVENT, type PickAssetDetail } from '../../follow';
import { useWallet } from '../../useWallet';
import { SwapBox, SwapLeg, TokenChip } from './SwapBox';
import { BasketRail } from './BasketRail';

/**
 * Buy and sell in one card, the way the reference does it.
 *
 * They were two panels stacked down the page, which read as two features and
 * made the second one a scroll away from the first. They are one decision with a
 * direction, so they are one card with a direction control.
 *
 * **Both stay mounted; the inactive one is hidden.** Each holds a quote, a
 * plan, an evidence hash and a wallet phase, and unmounting to switch tabs would
 * throw all of that away — a user who quotes a buy, glances at the sell side and
 * comes back would find their quote gone and would have to spend the round trip
 * again. `hidden` costs one subtree in the DOM and keeps the work.
 */
type Tab = 'buy' | 'sell';

export function TradeCard() {
  const [tab, setTab] = useState<Tab>('buy');
  const { address } = useWallet();

  // A position row or a basket leg naming what to act on. The card owns the
  // tab, so switching is its job; the panel for that direction picks the asset
  // up from the same event.
  useEffect(() => {
    const onPick = (e: Event) => setTab((e as CustomEvent<PickAssetDetail>).detail.direction);
    window.addEventListener(PICK_ASSET_EVENT, onPick);
    return () => window.removeEventListener(PICK_ASSET_EVENT, onPick);
  }, []);

  return (
    <aside className="rounded-2xl bg-card lg:sticky lg:top-6">
      <div className="p-4">
        <div role="tablist" aria-label="trade direction" className="mb-3 flex w-fit rounded-lg bg-inset p-1">
          <TabButton current={tab} value="buy" onSelect={setTab}>
            Buy
          </TabButton>
          <TabButton current={tab} value="sell" onSelect={setTab}>
            Sell
          </TabButton>
        </div>

        {!address ? (
          <Disconnected />
        ) : (
          <>
            <BasketRail direction={tab} />
            <div className={tab === 'buy' ? undefined : 'hidden'}>
              <Fill />
            </div>
            <div className={tab === 'sell' ? undefined : 'hidden'}>
              <Exit />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * The card before a wallet exists, with the box shown rather than hidden.
 *
 * A visitor with ninety seconds should be able to see what the trade surface
 * *is* without connecting anything — an empty panel saying "connect a wallet"
 * describes nothing. The amounts are zero and the tokens are placeholders,
 * which is honest: nothing here has been quoted.
 */
function Disconnected() {
  return (
    <>
      <SwapBox
        top={<SwapLeg label="Spend" amount="" token={<TokenChip symbol="USDG" />} />}
        bottom={<SwapLeg label="Receive" amount="" token={<TokenChip symbol="wNVDAx" />} />}
      />

      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_EVENT))}
        className="mt-3 w-full rounded-xl bg-ink px-4 py-3.5 text-[15px] font-semibold text-ground hover:opacity-90"
      >
        Connect wallet
      </button>

      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        Every fill is pulled against a Permit2 signature you produce yourself, scoped to one token
        and expiring in twenty minutes. No key of ours can move your money.
      </p>
    </>
  );
}

/**
 * A segment, not a tab with an underline.
 *
 * The reference puts direction in a small pill control rather than in the card's
 * top navigation, and it is the better place: the top row of that card is a
 * *venue* switch, a different kind of choice, and buy-or-sell is a property of
 * the trade being composed below it. The active segment is the well colour on
 * the card, which is the same figure-on-field relationship the swap box has.
 */
function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (next: Tab) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(value)}
      className={`rounded-md px-4 py-1.5 text-[14px] font-semibold transition-colors ${
        active ? 'bg-well text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-faint hover:text-dim'
      }`}
    >
      {children}
    </button>
  );
}
