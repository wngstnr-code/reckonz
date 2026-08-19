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
 * **The card scrolls inside itself.** Sticky and unbounded, it grows past the
 * viewport once a quote is on screen — the plan adds a quote, an oracle read, a
 * verdict and an evidence block — and the first thing to fall off the bottom is
 * its own commit button. Found by driving a real fill to the point of signing
 * and having nothing to press. A height cap and `overflow-y-auto` keep the
 * button reachable at any window size.
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
    <aside className="rounded-2xl bg-card lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      {/* Across the top, on the card's own hairline. The two split the width
          rather than sitting together on the left: with one card and exactly two
          directions, a tab that stops halfway leaves the rule looking unfinished
          and the second choice looking like an afterthought. */}
      <div role="tablist" aria-label="trade direction" className="flex border-b border-line">
        <TabButton current={tab} value="buy" onSelect={setTab}>
          Buy
        </TabButton>
        <TabButton current={tab} value="sell" onSelect={setTab}>
          Sell
        </TabButton>
      </div>

      <div className="px-5 py-5">
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
        className="mt-4 w-full rounded-xl bg-ink px-4 py-3.5 text-data font-semibold text-ground hover:opacity-90"
      >
        Connect wallet
      </button>

      <p className="mt-4 text-meta leading-relaxed text-ink">
        Every fill is pulled against a Permit2 signature you produce yourself, scoped to one token
        and expiring in twenty minutes. No key of ours can move your money.
      </p>
    </>
  );
}

/**
 * The card's top navigation, underlined.
 *
 * The rule sits on the card's own bottom border and is drawn thicker than it, so
 * the active tab reads as joined to the body under it. The inactive one is
 * `faint` rather than a lighter weight: the reference tells them apart by colour
 * and holds the type at one size, which keeps the row from shifting as the
 * choice changes.
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
      className={`-mb-px flex-1 border-b-[3px] py-4 text-center text-lead transition-colors ${
        active ? 'border-ink text-ink' : 'border-transparent text-faint hover:text-dim'
      }`}
    >
      {children}
    </button>
  );
}
