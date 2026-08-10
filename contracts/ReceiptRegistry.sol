// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ReceiptRegistry
/// @notice Append-only record of every AI decision and the execution it produced.
///
/// @dev There is deliberately no update and no delete path — not for the admin,
///      not for the writer, not for the mandate owner. Track record is only
///      worth selling if it cannot be polished, and the subscription revenue
///      stream depends entirely on that. Adding a mutator here breaks the
///      product, not just the contract.
///
///      Realised prices and slippage are written by PolicyGuard in the same
///      transaction as the trades, so a receipt cannot describe a fill that did
///      not happen.
contract ReceiptRegistry {
    struct Fill {
        address asset;
        /// @dev true when the fill reduces the position. Exits must be
        ///      expressible: a mandate whose triggers fire but which cannot
        ///      sell is incoherent.
        bool isExit;
        /// @dev USDG paid, 6 decimals
        uint128 amountInUsdg;
        /// @dev asset units received, asset decimals
        uint128 amountOut;
        /// @dev realised USDG per whole asset unit, 8 decimals
        uint128 executionPriceE8;
        /// @dev realised slippage against the pre-trade quote
        uint16 slippageBps;
        /// @dev oracle fair value at execution, 8 decimals
        uint128 fairValueE8;
        /// @dev oracle gap risk at execution
        uint8 gapRisk;
    }

    struct Receipt {
        uint256 mandateId;
        /// @dev policy version in force when this executed
        uint32 policyVersion;
        /// @dev hash of the compiled Thesis object
        bytes32 thesisHash;
        /// @dev hash of the evidence bundle; the CID itself is in the event
        bytes32 evidenceHash;
        address agent;
        uint64 timestamp;
        uint64 blockNumber;
    }

    Receipt[] private _receipts;
    /// @dev receiptId => fills
    mapping(uint256 => Fill[]) private _fills;
    /// @dev mandateId => receiptIds
    mapping(uint256 => uint256[]) private _byMandate;

    mapping(address => bool) public isWriter;
    address public admin;

    event ReceiptAppended(
        uint256 indexed receiptId,
        uint256 indexed mandateId,
        address indexed agent,
        bytes32 thesisHash,
        string evidenceCID,
        uint256 fillCount
    );
    event WriterSet(address indexed writer, bool allowed);

    error NotAdmin();
    error NotWriter();
    error NoFills();

    constructor(address admin_) {
        admin = admin_;
    }

    function setWriter(address writer, bool allowed) external {
        if (msg.sender != admin) revert NotAdmin();
        isWriter[writer] = allowed;
        emit WriterSet(writer, allowed);
    }

    function setAdmin(address newAdmin) external {
        if (msg.sender != admin) revert NotAdmin();
        admin = newAdmin;
    }

    /// @notice Append a receipt. Only PolicyGuard should hold this right.
    /// @param evidenceCID IPFS CID of the full reasoning bundle. Emitted rather
    ///        than stored — the hash on-chain is what binds it.
    function append(
        uint256 mandateId,
        uint32 policyVersion,
        bytes32 thesisHash,
        bytes32 evidenceHash,
        string calldata evidenceCID,
        address agent,
        Fill[] calldata fills
    ) external returns (uint256 receiptId) {
        if (!isWriter[msg.sender]) revert NotWriter();
        if (fills.length == 0) revert NoFills();

        receiptId = _receipts.length;
        _receipts.push(
            Receipt({
                mandateId: mandateId,
                policyVersion: policyVersion,
                thesisHash: thesisHash,
                evidenceHash: evidenceHash,
                agent: agent,
                timestamp: uint64(block.timestamp),
                blockNumber: uint64(block.number)
            })
        );

        Fill[] storage stored = _fills[receiptId];
        for (uint256 i; i < fills.length; ++i) {
            stored.push(fills[i]);
        }
        _byMandate[mandateId].push(receiptId);

        emit ReceiptAppended(
            receiptId, mandateId, agent, thesisHash, evidenceCID, fills.length
        );
    }

    // ----------------------------------------------------------- reading

    function count() external view returns (uint256) {
        return _receipts.length;
    }

    function get(uint256 receiptId)
        external
        view
        returns (Receipt memory receipt, Fill[] memory fills)
    {
        return (_receipts[receiptId], _fills[receiptId]);
    }

    function receiptsOf(uint256 mandateId) external view returns (uint256[] memory) {
        return _byMandate[mandateId];
    }

    /// @notice Realised notional and slippage across a mandate's whole history.
    /// @dev This is the primitive a "track record" page reads. It is derived
    ///      from on-chain fills, so it cannot be inflated by the agent.
    function performance(uint256 mandateId)
        external
        view
        returns (uint256 totalNotionalUsdg, uint256 weightedSlippageBps, uint256 fillCount)
    {
        uint256[] storage ids = _byMandate[mandateId];
        uint256 weighted;
        for (uint256 i; i < ids.length; ++i) {
            Fill[] storage fills = _fills[ids[i]];
            for (uint256 j; j < fills.length; ++j) {
                totalNotionalUsdg += fills[j].amountInUsdg;
                weighted += uint256(fills[j].amountInUsdg) * fills[j].slippageBps;
                ++fillCount;
            }
        }
        weightedSlippageBps = totalNotionalUsdg == 0 ? 0 : weighted / totalNotionalUsdg;
    }
}
