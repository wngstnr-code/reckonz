// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Executor, ISignatureTransfer} from "../contracts/Executor.sol";
import {FeeCollector} from "../contracts/FeeCollector.sol";
import {IFairValueOracle} from "../contracts/interfaces/IFairValueOracle.sol";
import {PolicyGuard} from "../contracts/PolicyGuard.sol";
import {ReceiptRegistry} from "../contracts/ReceiptRegistry.sol";

/// @notice Replace `PolicyGuard` and `Executor` for the exit fix in D56.
///
/// The guard changed, and `guard` is `immutable` in `Executor`, so the executor
/// comes along. Nothing else moves: the oracle is untouched (it already had
/// `peek`; only the interface omitted it), and `ReceiptRegistry` is kept so the
/// five real fills — including the first exit — stay in one append-only history.
///
/// ## Two things this script deliberately cannot do
///
/// **1. It cannot hand over the registry's write permission.** `setWriter` is
/// `onlyAdmin` and admin is the 2-of-3 Safe as of D42, so the deployer no longer
/// has it. `Migrate.s.sol` did it inline because back then the deployer was
/// admin; doing that here would revert halfway and leave a deployed guard that
/// can never record anything. It is a separate, Safe-signed step:
///
///     pnpm safe:admin writer <newGuard> on
///     pnpm safe:admin writer <oldGuard> off
///
/// **2. It cannot migrate the mandates.** They live in the old guard's storage
/// and there is no export. Every live mandate must be created again on the new
/// guard, which also resets `_positions` — so `drawdownBpsFromEntry` and
/// `priceVsThesisEntryBps` start measuring from the new entry, not the original
/// one. That is a real loss and it is stated here rather than discovered later.
/// The receipts do not move, so the *track record* is intact either way.
///
/// Usage:
///   export PRIVATE_KEY=0x...
///   export ORACLE=0x... RECEIPTS=0x... FEES=0x... CASH=0x... OLD_GUARD=0x...
///   forge script script/MigrateGuard.s.sol --tc MigrateGuard --rpc-url xlayer --broadcast
///
/// Same script for testnet, with `--rpc-url xlayer_testnet` and the 1952
/// addresses — that chain is a rig for the wallet and mandate flows, so it is
/// only useful while it is running the same contracts as production.
contract MigrateGuard is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant V3_FACTORY = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address oracle = vm.envAddress("ORACLE");
        ReceiptRegistry receipts = ReceiptRegistry(vm.envAddress("RECEIPTS"));
        FeeCollector fees = FeeCollector(payable(vm.envAddress("FEES")));
        address cash = vm.envAddress("CASH");
        address oldGuard = vm.envAddress("OLD_GUARD");

        console2.log("chainid ", block.chainid);
        console2.log("deployer", deployer);

        require(oracle.code.length > 0, "ORACLE has no code");
        require(address(receipts).code.length > 0, "RECEIPTS has no code");
        require(address(fees).code.length > 0, "FEES has no code");
        require(cash.code.length > 0, "CASH has no code");
        require(oldGuard.code.length > 0, "OLD_GUARD has no code");
        require(PERMIT2.code.length > 0, "PERMIT2 has no code");

        // The same rule `Deploy.s.sol` already applies (D36): on mainnet a
        // factory with no code makes the deployment worthless, so refuse. On a
        // testnet it is *expected* — the X Layer v3 factory has no code on 1952
        // — and refusing there is what left the testnet stack two versions
        // behind mainnet while the docs told people to test on it. The oracle,
        // the guard and the mandate lifecycle are worth exercising on a chain
        // that cannot swap; nobody gets to discover the missing factory from a
        // revert with no data either way.
        bool factoryLive = V3_FACTORY.code.length > 0;
        console2.log("factory ", V3_FACTORY, factoryLive ? "" : "<- NO CODE ON THIS CHAIN");
        if (block.chainid == 196) {
            require(factoryLive, "V3_FACTORY has no code on mainnet");
        } else if (!factoryLive) {
            console2.log("WARNING: Executor cannot swap on this chain. Oracle/guard/mandates only.");
        }

        // The old guard must still be the writer, or this is not the migration
        // anyone thinks it is.
        require(receipts.isWriter(oldGuard), "OLD_GUARD is not the current writer");

        uint256 receiptsBefore = receipts.count();
        console2.log("receipts kept, existing entries:", receiptsBefore);

        vm.startBroadcast(pk);

        PolicyGuard guard = new PolicyGuard(IFairValueOracle(oracle), receipts, cash);
        Executor executor = new Executor(
            ISignatureTransfer(PERMIT2),
            V3_FACTORY,
            guard,
            IFairValueOracle(oracle),
            cash,
            fees
        );

        vm.stopBroadcast();

        // Read the immutables back rather than trusting the arguments. A guard
        // and an executor pointing at different oracles would let the guard
        // judge fills against a price source the executor never used — silently.
        require(address(guard.oracle()) == oracle, "guard oracle mismatch");
        require(address(guard.receipts()) == address(receipts), "guard receipts mismatch");
        require(guard.cash() == cash, "guard cash mismatch");
        require(address(executor.guard()) == address(guard), "executor guard mismatch");
        require(address(executor.oracle()) == oracle, "executor oracle mismatch");
        require(executor.cash() == cash, "executor cash mismatch");
        require(address(executor.feeCollector()) == address(fees), "executor fees mismatch");
        require(address(executor.permit2()) == PERMIT2, "executor permit2 mismatch");
        require(executor.factory() == V3_FACTORY, "executor factory mismatch");
        require(receipts.count() == receiptsBefore, "the record moved");

        console2.log("PolicyGuard    ", address(guard), "<- new, exits survive a stale oracle");
        console2.log("Executor       ", address(executor), "<- new");
        console2.log("FairValueOracle", oracle, "<- kept");
        console2.log("ReceiptRegistry", address(receipts), "<- kept");
        console2.log("FeeCollector   ", address(fees), "<- kept");
        console2.log("");
        console2.log("NOT DONE YET. The new guard cannot record a fill until the Safe grants it:");
        console2.log("  pnpm safe:admin writer", address(guard));
        console2.log("  pnpm safe:admin writer", oldGuard);
        console2.log("Then recreate your mandates on the new guard. They do not migrate.");
    }
}
