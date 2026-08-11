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
export const TESTNET: Deployment = {
  chainId: 1952,
  name: 'X Layer testnet',
  explorer: 'https://www.oklink.com/xlayer-test',
  contracts: {
    FairValueOracle: '0x20a30E6fe3e3C2aCad4180EbeEeAD8BC9aB32B5c',
    ReceiptRegistry: '0xc5589899556749c2D56fD08c7214739c0bA2bF94',
    PolicyGuard: '0x92aF161Ac20177b49FE498f3fFb0e0DC062a6278',
    Executor: '0xE127C36390c0Ee6c4eB1632b514BA498696c883b',
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
 */
export const MAINNET: Deployment | null = {
  chainId: 196,
  name: 'X Layer mainnet',
  explorer: 'https://www.oklink.com/xlayer',
  contracts: {
    FairValueOracle: '0x3659E05Fbbaafb7bA868171aB98327b62831Cd75',
    ReceiptRegistry: '0x9D04575894F570C3638Bc1f6ECaD6EF36D479Fa6',
    PolicyGuard: '0x481e0A60c5E105708b86e804811F8fc98a43bEFd',
    Executor: '0xdc2f34A220D4cd7c098D7927454F30AEf3157681',
    FeeCollector: '0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0',
    ThesisRegistry: '0xD4b503d002Fb77019d7BB1a26DCe1d60F32dfa1E',
    USDG: '0x4ae46a509F6b1D9056937BA4500cb143933D2dc8',
    PoolSwapper: '0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28',
  },
};
