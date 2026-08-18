/** Deployed stack. Testnet is live; mainnet is filled in at deploy time. */
export interface Deployment {
  chainId: number;
  name: string;
  explorer: string;
  contracts: Record<string, string>;
}

/**
 * Redeployed 2026-08-11 alongside the mainnet stack, because `Executor`'s
 * constructor changed when the Universal Router was dropped (D35). The previous
 * testnet addresses are still live and still answer, which is precisely the
 * hazard: they would have matched `src/abi.ts` closely enough to call and not
 * closely enough to work.
 *
 * `Executor` here cannot swap and is not meant to. The X Layer v3 factory has no
 * code on 1952, so there are no pools to derive — `Deploy.s.sol` says so out loud
 * rather than deploying quietly (D36). The oracle, guard and receipt registry are
 * fully exercisable; execution is a mainnet-only story and always was.
 */
/**
 * Redeployed 2026-08-11 for the publish-time bound in `FairValueOracle`.
 *
 * The whole stack moved, not just the oracle: `oracle` is `immutable` in both
 * `PolicyGuard` and `Executor`, so a new oracle cannot be pointed at from the
 * old ones. That immutability is deliberate — a guard whose oracle can be
 * swapped is a guard whose price source can be swapped — and the redeploy is
 * the price it charges.
 */
/**
 * **`PolicyGuard` and `Executor` realigned with mainnet 2026-08-12.** Mainnet
 * moved twice that day — D51 gave `Executor` an `exit()`, D56 stopped the guard
 * applying `checkExecution` to exits — and testnet moved neither time. Measured
 * from the deployed bytecode rather than inferred from the dates, the old pair
 * was 7,491 and 13,626 bytes against mainnet's 10,221 and 14,170.
 *
 * That mattered because of what this chain is *for*: `docs/05-status.md` points
 * readers here to exercise wallet connect and the mandate lifecycle on free gas.
 * Most of that was unaffected — `createMandate`, `setTriggers`,
 * `setCircuitBreaker`, `closeMandate` and `updatePolicy` never changed — but
 * anything about exiting could not be tested at all, because the function was
 * not on the executor and the guard would have refused it too. A rig that
 * differs from production in a way nobody has written down is worse than one
 * that differs openly.
 *
 * Both are now byte-for-byte the size of their mainnet counterparts and verified
 * on Sourcify (exact match, creation and runtime). Nothing else moved: the
 * oracle, the receipt registry, the fee collector and the thesis registry are
 * the same addresses. The old guard held no mandates (`nextMandateId` was still
 * 1) and the registry holds no receipts, so nothing was stranded. The Safe
 * granted the new guard `setWriter` and revoked the old one, in that order.
 *
 * Previous: guard `0x92aF161A…`, executor `0xE127C363…`.
 *
 * `Executor` still cannot swap here and is not meant to — the X Layer v3 factory
 * has no code on 1952, so `MigrateGuard.s.sol` says so out loud rather than
 * deploying quietly (D36). Execution is a mainnet-only story and always was.
 */
export const TESTNET: Deployment = {
  chainId: 1952,
  name: 'X Layer testnet',
  explorer: 'https://www.oklink.com/xlayer-test',
  contracts: {
    FairValueOracle: '0x20a30E6fe3e3C2aCad4180EbeEeAD8BC9aB32B5c',
    ReceiptRegistry: '0xc5589899556749c2D56fD08c7214739c0bA2bF94',
    PolicyGuard: '0xD9d04Bc1324ed4fb23D171893BFACb1c99FD581b',
    Executor: '0xf1b73Fb49CEfcB7CEd27b667c8Ea14bD8f3871D9',
    FeeCollector: '0x40B494716a60e2348eD7470BEF789365DF4d36b5',
    ThesisRegistry: '0x5A2e03eb2B07464Da0821a95411e6614ab16C694',
    'TestUSDG (settlement)': '0xE2D6d2BBA5Ece46A90F5ab5656664D4182332c32',
  },
};

/**
 * Deployed 2026-08-11. Settlement is the real USDG — `Deploy.s.sol` only stands
 * up a TestUSDG when the configured address has no code, and on mainnet it
 * correctly left it alone.
 *
 * `Executor` was redeployed 2026-08-11 when `FeeCollector` was added — the
 * collector is immutable on it, so the fee path cannot be switched on after
 * users have read the contract they are trusting. Guard, oracle and registry are
 * unchanged, so receipt #0 (the first mainnet fill, made through the previous
 * executor at `0xA7acf842…`) is still in the same append-only history.
 *
 * Verified on-chain after deployment: the guard points at this oracle, these
 * receipts and this cash; `ReceiptRegistry.isWriter` is true for the guard and
 * false for the deployer, so only the guard can append; and the executor derives
 * the USDG/wSPYx pool to the same address the factory reports — the check that
 * D35 turned out to need.
 *
 * `Executor` was redeployed again 2026-08-12 for the exit path (D51) — the
 * previous one at `0xf3a06c9f…` could only ever buy. One contract moved, and only
 * one: `PolicyGuard` already supported exits, so the guard holding the live
 * mandates and the registry holding the four fills both stayed put. Verified on
 * Sourcify (exact match, creation and runtime) and its immutables read back
 * against the same guard, oracle, cash, collector, Permit2 and factory.
 *
 * A mandate keeps pointing at whichever executor it was created with until its
 * owner calls `setExecutor`, so the old address stays live and harmless.
 *
 * **Both moved again 2026-08-12 for D56** — the guard stopped applying the
 * oracle's `checkExecution` to exits, so a stale or high-gap-risk observation can
 * no longer trap an open position. `guard` is `immutable` in `Executor`, which is
 * why the executor came along; the oracle did not move, because it already
 * implemented `peek` and only the interface omitted it.
 *
 * Previous: guard `0x3F58df45…`, executor `0x09af5194…`. **Mandates do not
 * migrate** — they live in the old guard's storage, so mandate #3 and its
 * recorded positions stayed behind and a new one had to be created. The receipts
 * did not move, so the track record is continuous across all of it.
 */
export const MAINNET: Deployment | null = {
  chainId: 196,
  name: 'X Layer mainnet',
  explorer: 'https://www.oklink.com/xlayer',
  contracts: {
    FairValueOracle: '0xDB7949c99e6d234C0eD374a71966d9e6CbfcfD09',
    ReceiptRegistry: '0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6',
    PolicyGuard: '0x9C8F1af1cF0FaD14C46617c573bFed8C90a783be',
    Executor: '0xD3d4aeD69f045dAb75390b2a1431A2161C02fBE2',
    FeeCollector: '0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0',
    ThesisRegistry: '0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E',
    USDG: '0x4ae46a509F6b1D9056937BA4500cb143933D2dc8',
    PoolSwapper: '0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28',
  },
};

/**
 * The publisher's hot key — the address `FairValueOracle.setPublisher` authorised,
 * and the one to top up when the oracle is about to go stale for want of gas.
 *
 * Here rather than in a script because it is a fact about the deployment and this
 * file is where those live. It is not a contract, so it is deliberately not in
 * `contracts`: nothing may `readContract` against it. It has been public in
 * `docs/` since it was funded — an address is not a secret, the key behind it is,
 * and that one has never been in this repo.
 *
 * `GET /api/health` reads its balance so the outage everyone can see coming — gas
 * exhaustion on a known date (D85) — is watched by the same monitor that watches
 * staleness, rather than by somebody remembering.
 */
export const PUBLISHER = '0x40101A4932dEb95f0A5951BB7fB0fFa7c17e3Ab8';
