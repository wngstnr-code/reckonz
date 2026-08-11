// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ThesisRegistry
/// @notice Publishes a thesis before it is traded, so the track record cannot be
///         written afterwards.
///
/// @dev The pitch rests on a claim that is easy to make and hard to support: that
///      performance here is unfalsifiable. `ReceiptRegistry` already makes the
///      *executions* unfalsifiable — only `PolicyGuard` can append, and prices are
///      derived from measured balance deltas rather than supplied by the agent.
///      What was missing is the other half. A record of trades proves what you
///      did; it does not prove you meant to.
///
///      This closes that. A thesis is hashed, published here, and the resulting
///      fills carry the same hash in their receipts. Anyone can then check that
///      `thesis.publishedAt < receipt.timestamp` and know the reasoning existed
///      before the outcome did. Hindsight becomes visible instead of arguable.
///
///      Three properties do the work, and each is an absence:
///
///      - **No update, no delete.** A thesis that can be edited after the fact
///        proves nothing at all.
///      - **One author per hash, first to publish.** Otherwise anyone could watch
///        a thesis perform and then publish the same text as their own. The claim
///        on a piece of reasoning goes to whoever staked it first.
///      - **No admin.** Nothing here is upgradeable, pausable or ownable. A
///        registry someone can rewrite is a database with extra steps.
///
///      There is deliberately **no paid-following mechanism**. Charging people to
///      follow someone else's thesis is publishing investment recommendations in
///      a lot of jurisdictions, and that is a legal question rather than a
///      technical one. The record is useful on its own; the market on top of it
///      waits for an answer. See `06-assessment.md`.
contract ThesisRegistry {
    struct Thesis {
        address author;
        /// @dev keccak256 of the canonical serialisation. See `thesisHash()` in
        ///      `src/thesis.ts` — the two must agree or the loop does not close.
        bytes32 contentHash;
        uint64 publishedAt;
        uint64 blockNumber;
        /// @dev IPFS CID of the full reasoning bundle: claim, causal chain,
        ///      beneficiaries, evidence, exit triggers. Stored rather than only
        ///      emitted, because a consumer reading a receipt needs to reach the
        ///      reasoning without replaying logs.
        string cid;
    }

    Thesis[] private _theses;

    /// @dev hash -> id + 1, so that zero means "never published".
    mapping(bytes32 => uint256) private _idByHash;
    mapping(address => uint256[]) private _byAuthor;

    event ThesisPublished(
        uint256 indexed thesisId,
        address indexed author,
        bytes32 indexed contentHash,
        string cid
    );

    error AlreadyPublished(uint256 thesisId, address author);
    error EmptyHash();

    /// @notice Stake a claim on a piece of reasoning, at this block.
    /// @param contentHash keccak256 of the canonical thesis serialisation.
    /// @param cid IPFS pointer to the full bundle. May be empty; the hash is what
    ///        binds, and a thesis can be published before its bundle is pinned.
    function publish(bytes32 contentHash, string calldata cid)
        external
        returns (uint256 thesisId)
    {
        if (contentHash == bytes32(0)) revert EmptyHash();

        uint256 existing = _idByHash[contentHash];
        // Not "overwrite the author" and not "silently succeed": both would let a
        // later publisher blur who actually called it. Tell them who was first.
        if (existing != 0) {
            revert AlreadyPublished(existing - 1, _theses[existing - 1].author);
        }

        thesisId = _theses.length;
        _theses.push(
            Thesis({
                author: msg.sender,
                contentHash: contentHash,
                publishedAt: uint64(block.timestamp),
                blockNumber: uint64(block.number),
                cid: cid
            })
        );
        _idByHash[contentHash] = thesisId + 1;
        _byAuthor[msg.sender].push(thesisId);

        emit ThesisPublished(thesisId, msg.sender, contentHash, cid);
    }

    // ----------------------------------------------------------------- reads

    function get(uint256 thesisId) external view returns (Thesis memory) {
        return _theses[thesisId];
    }

    /// @notice Resolve a receipt's `thesisHash` back to the thesis that produced it.
    /// @dev Returns `exists` rather than reverting: a receipt carrying an unknown
    ///      hash is a meaningful answer — it means the trade was made without a
    ///      published thesis — and a caller checking that should not have to
    ///      handle a revert to learn it.
    function idOf(bytes32 contentHash) external view returns (uint256 thesisId, bool exists) {
        uint256 stored = _idByHash[contentHash];
        if (stored == 0) return (0, false);
        return (stored - 1, true);
    }

    function authorOf(bytes32 contentHash) external view returns (address) {
        uint256 stored = _idByHash[contentHash];
        if (stored == 0) return address(0);
        return _theses[stored - 1].author;
    }

    function thesesOf(address author) external view returns (uint256[] memory) {
        return _byAuthor[author];
    }

    function count() external view returns (uint256) {
        return _theses.length;
    }
}
