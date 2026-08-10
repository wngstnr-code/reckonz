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

export const MAINNET: Deployment | null = null;
