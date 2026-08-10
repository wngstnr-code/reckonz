# Reckonz

Non-custodial execution and risk tooling for tokenised equities (xStocks) on **X Layer**.
Built for the X Layer "AI Season" hackathon (AI-RWA track).

## Read first

| Doc | When |
|---|---|
| `docs/05-status.md` | **Always.** What exists, what runs, what is blocked, what is next. |
| `docs/04-decisions.md` | Before changing direction. Contains corrections — each one is a mistake you would otherwise repeat. |
| `docs/01-xlayer-reality.md` | Before touching any address, asset, or chain assumption. |
| `docs/03-architecture.md` | Before writing a contract or an agent stage. |
| `docs/02-product.md` | Product shape, revenue model, scope boundaries. |
| `docs/00-hackathon.md` | Rules, prize strategy, how the judges actually score. |

## Commands

```bash
pnpm verify                  # Uniswap math vs live on-chain state — run after touching v3math.ts
pnpm plan [usdg] [maxBps]    # thesis basket: naive vs planned execution
pnpm capacity                # absorbable size per xStock, by impact limit
pnpm oracle [usdg]           # fair value, gap risk, PolicyGuard allow/reject
pnpm dev                     # the web app — thesis in, guard verdict out
pnpm typecheck               # covers src/ and app/
```

## Non-negotiables

- **Non-custodial.** No contract in this repo may take custody of user funds. See D6.
- **The AI never holds a key that can move funds arbitrarily.** Agent keys call
  `proposeRebalance()` only; `PolicyGuard` bounds execution and reverts in the same
  transaction as the trade. Off-chain checks are decoration.
- **The oracle is a guard, not a price.** It publishes an estimate, its uncertainty, and a
  risk score so consumers can refuse to execute. When it cannot defend a number it marks
  the value unpublishable rather than inventing one. Never weaken this.
- **Tooling, not investment advice.** The user writes the thesis; the system maps and
  executes it. Never invert.
- **Report capacity honestly.** Telling users what the chain cannot absorb is the product.
  Never silently force capital into a market that cannot take it.

## Facts that will bite you

- **The Uniswap V3 factory on X Layer is NOT at the canonical address.** It is
  `0x4b2ab38dbf28d31d467aa8993f6c2585981d6804`. SDK defaults fail *silently*.
- **Morpho and Ondo are not on X Layer.** The $84M lender is Aave V3. Zero RWA-category
  protocols. See D2.
- **Never trust a prose summary of a large JSON API** for X Layer facts — parse the JSON
  or hit the RPC. That is how D2 happened.
- **There are no Chainlink equity feeds on X Layer.** The fair-value layer must be built.
- **DexScreener does not index X Layer.** GeckoTerminal does, as network `x-layer`.
- The public RPC throttles hard: serialise reads, batch ~12, retry with backoff. Use
  `serial()` from `src/chain.ts` rather than `Promise.all` over many RPC calls.
- **The RPC load-balances, so a confirmed write is not immediately readable.** A read straight
  after a write can hit an unsynced node and return **zeroes, not an error** — and the gas
  estimation for a *dependent transaction* can revert for the same reason. Poll until the state
  is visible before reading it back or sending the next dependent transaction. See D18.

## Conventions

- TypeScript ESM, `viem` for all chain access. Web: Next.js App Router + Tailwind in `app/`.
- **The web app computes nothing.** It renders `src/pipeline.ts`, which wraps the same modules the
  CLI uses. Never reimplement a calculation in a component. See D28.
- Relative imports inside `src/` carry **no** file extension — the one form both `tsx` and
  Turbopack resolve.
- All financial math in `BigInt` at chain precision; convert to `number` only for display.
- Uniswap math is ported faithfully from the Solidity — if it differs from
  `UniswapV3Pool.swap`, the port is wrong.
- **Derive magic constants, do not recall them.** See D5.
- `src/guard.ts` mirrors `FairValueOracle.checkExecution` line for line. If they diverge,
  the off-chain mirror is wrong.
- Comments explain *why*, especially where a naive implementation would look correct.

## Workflow

- After changing `v3math.ts` or `pool.ts`, run `pnpm verify` — it is the regression test.
- Log real direction changes and corrections in `docs/04-decisions.md`; update
  `docs/05-status.md` when something starts or finishes working.
- Do not commit private keys. Deployment reads them from the environment.

## Network

```
mainnet   chainId 196   https://rpc.xlayer.tech
testnet   chainId 1952  https://testrpc.xlayer.tech
gas       OKB
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
