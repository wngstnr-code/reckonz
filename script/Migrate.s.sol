// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Executor, ISignatureTransfer} from "../contracts/Executor.sol";
import {FeeCollector} from "../contracts/FeeCollector.sol";
import {FairValueOracle} from "../contracts/FairValueOracle.sol";
import {IFairValueOracle} from "../contracts/interfaces/IFairValueOracle.sol";
import {PolicyGuard} from "../contracts/PolicyGuard.sol";
import {ReceiptRegistry} from "../contracts/ReceiptRegistry.sol";

/// @notice Replace the oracle, the guard and the executor while **keeping the
///         record**.
///
/// `Deploy.s.sol` stands up everything from nothing, which is right for a fresh
/// chain and wrong here. `ReceiptRegistry` holds the two real mainnet fills and
/// `ThesisRegistry` holds thesis #0 that receipt #2 resolves to. Running the
/// full deploy against mainnet would create empty copies of both and strand the
/// only evidence this project has that the loop closes — the exact split D37
/// refused to accept when the fee was added.
///
/// So the three contracts that changed are redeployed and the two that carry
/// history are reused. `oracle` is `immutable` in `PolicyGuard` and `Executor`,
/// which is why replacing the oracle drags them along: a guard whose oracle can
/// be swapped is a guard whose price source can be swapped.
///
/// Usage:
///   export PRIVATE_KEY=0x...
///   export RECEIPTS=0x... THESES=0x... FEES=0x... CASH=0x...
///   forge script script/Migrate.s.sol --tc Migrate --rpc-url xlayer --broadcast
contract Migrate is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant V3_FACTORY = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address cash = vm.envAddress("CASH");
        ReceiptRegistry receipts = ReceiptRegistry(vm.envAddress("RECEIPTS"));
        FeeCollector fees = FeeCollector(payable(vm.envAddress("FEES")));
        address oldGuard = vm.envAddress("OLD_GUARD");

        console2.log("chainid ", block.chainid);
        console2.log("deployer", deployer);

        // Reused, not redeployed. Each one must already exist, or this is a
        // fresh chain and `Deploy.s.sol` is the right script.
        require(address(receipts).code.length > 0, "RECEIPTS has no code");
        require(address(fees).code.length > 0, "FEES has no code");
        require(cash.code.length > 0, "CASH has no code");
        require(oldGuard.code.length > 0, "OLD_GUARD has no code");

        // Only the registry's admin can move the write permission, and without
        // that move the new guard cannot record anything. Failing here beats
        // discovering it after three contracts are deployed.
        require(receipts.admin() == deployer, "deployer is not the ReceiptRegistry admin");
        require(receipts.isWriter(oldGuard), "OLD_GUARD is not the current writer");

        require(PERMIT2.code.length > 0, "PERMIT2 has no code");
        require(V3_FACTORY.code.length > 0, "V3_FACTORY has no code");

        uint256 receiptsBefore = receipts.count();
        console2.log("receipts kept, existing entries:", receiptsBefore);

        vm.startBroadcast(pk);

        FairValueOracle oracle = new FairValueOracle(deployer);
        PolicyGuard guard = new PolicyGuard(IFairValueOracle(address(oracle)), receipts, cash);

        // Hand the write permission over, then take it away from the old guard.
        // Two contracts able to append to one append-only history is two places
        // trust can leak from, and the second one is the one nobody is watching.
        receipts.setWriter(address(guard), true);
        receipts.setWriter(oldGuard, false);

        Executor executor = new Executor(
            ISignatureTransfer(PERMIT2),
            V3_FACTORY,
            guard,
            IFairValueOracle(address(oracle)),
            cash,
            fees
        );

        vm.stopBroadcast();

        require(receipts.isWriter(address(guard)), "new guard is not a writer");
        require(!receipts.isWriter(oldGuard), "old guard is still a writer");
        require(receipts.count() == receiptsBefore, "the record moved");

        console2.log("FairValueOracle", address(oracle), "<- new, with the publish bound");
        console2.log("PolicyGuard    ", address(guard), "<- new");
        console2.log("Executor       ", address(executor), "<- new");
        console2.log("ReceiptRegistry", address(receipts), "<- kept");
        console2.log("FeeCollector   ", address(fees), "<- kept");
        console2.log("");
        console2.log("Mandates on the old guard can no longer record fills. That is the point:");
        console2.log("create a new mandate against the new guard.");
    }
}
