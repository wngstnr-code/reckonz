/** Deployed stack. Testnet is live; mainnet is filled in at deploy time. */
export interface Deployment {
  chainId: number;
  name: string;
  explorer: string;
  contracts: Record<string, string>;
}

export const TESTNET: Deployment = {
  chainId: 1952,
  name: 'X Layer testnet',
  explorer: 'https://www.oklink.com/xlayer-test',
  contracts: {
    FairValueOracle: '0x1f3b67d8209060eC68d0eDCD6E60Ba53A8e9ac28',
    ReceiptRegistry: '0x3A1D6b9129E69fEF189E538996B18cebd56C3Dd0',
    PolicyGuard: '0xdc2f34A220D4cd7c098D7927454F30AEf3157681',
    Executor: '0xA9c7423A4c91AE87f205aE574aD669035aAb055d',
    'TestUSDG (settlement)': '0x37E280C32b074a33A4325d06E139a2BeE6821Bb8',
  },
};

/**
 * Deployed 2026-08-11. Settlement is the real USDG — `Deploy.s.sol` only stands
 * up a TestUSDG when the configured address has no code, and on mainnet it
 * correctly left it alone.
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
    Executor: '0xA7acf8428483c0b84081D36893A49fcEB38AA35d',
    USDG: '0x4ae46a509F6b1D9056937BA4500cb143933D2dc8',
    PoolSwapper: '0x20a0fB089094c6b11A7b2de5c042E1f2f50D41f5',
  },
};
