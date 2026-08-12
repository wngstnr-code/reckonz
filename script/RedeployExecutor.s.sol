// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Executor, ISignatureTransfer} from "../contracts/Executor.sol";
import {FeeCollector} from "../contracts/FeeCollector.sol";
import {IFairValueOracle} from "../contracts/interfaces/IFairValueOracle.sol";
import {PolicyGuard} from "../contracts/PolicyGuard.sol";

/// @notice Replace **only** `Executor`, for the exit path added in D51.
///
/// `Migrate.s.sol` replaces the oracle, the guard and the executor together,
/// because `oracle` is `immutable` in the first two and a new oracle drags them
/// along. Nothing of that kind happened here: `PolicyGuard` needed no change to
/// support exits — it already accepted `isExit`, already skipped the trigger
/// check for exits, and `ExitTriggers.applyFill` already decremented the
/// position. Only the executor was missing a direction.
///
/// So this deploys one contract and reuses every other address, including the
/// registry that holds the four real fills and the guard that holds the live
/// mandates. Using the full migration here would have replaced a guard that has
/// nothing wrong with it, and stranded the mandates pointing at it.
///
/// The old executor keeps working for entries until `setExecutor` is called on
/// each mandate — deliberately a separate, owner-signed step, so a half-finished
/// migration leaves a working system rather than a broken one.
///
/// Usage:
///   export PRIVATE_KEY=0x...
///   export GUARD=0x... ORACLE=0x... CASH=0x... FEES=0x...
///   forge script script/RedeployExecutor.s.sol --tc RedeployExecutor \
///     --rpc-url xlayer --broadcast
contract RedeployExecutor is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant V3_FACTORY = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        PolicyGuard guard = PolicyGuard(vm.envAddress("GUARD"));
        address oracle = vm.envAddress("ORACLE");
        address cash = vm.envAddress("CASH");
        FeeCollector fees = FeeCollector(payable(vm.envAddress("FEES")));

        console2.log("chainid ", block.chainid);
        console2.log("deployer", deployer);

        require(address(guard).code.length > 0, "GUARD has no code");
        require(oracle.code.length > 0, "ORACLE has no code");
        require(cash.code.length > 0, "CASH has no code");
        require(address(fees).code.length > 0, "FEES has no code");
        require(PERMIT2.code.length > 0, "PERMIT2 has no code");
        // A deployed address with the right shape proves nothing (D35), but an
        // address with no code at all proves the opposite, and cheaply.
        require(V3_FACTORY.code.length > 0, "V3_FACTORY has no code");

        // The executor's oracle is immutable and the guard's is too. If they
        // disagree, the guard would be judging fills against a different price
        // source than the one the executor priced them with — silently.
        require(address(guard.oracle()) == oracle, "ORACLE is not the guard's oracle");
        require(guard.cash() == cash, "CASH is not the guard's settlement currency");

        vm.startBroadcast(pk);
        Executor executor = new Executor(
            ISignatureTransfer(PERMIT2),
            V3_FACTORY,
            guard,
            IFairValueOracle(oracle),
            cash,
            fees
        );
        vm.stopBroadcast();

        // Read the immutables back rather than trusting the arguments: this is
        // the whole reason to redeploy one contract instead of five, so it is
        // worth proving the new one is wired to the same stack.
        require(address(executor.guard()) == address(guard), "guard mismatch");
        require(address(executor.oracle()) == oracle, "oracle mismatch");
        require(executor.cash() == cash, "cash mismatch");
        require(address(executor.feeCollector()) == address(fees), "fees mismatch");
        require(address(executor.permit2()) == PERMIT2, "permit2 mismatch");
        require(executor.factory() == V3_FACTORY, "factory mismatch");

        console2.log("Executor       ", address(executor), "<- new, with exit()");
        console2.log("PolicyGuard    ", address(guard), "<- kept");
        console2.log("FairValueOracle", oracle, "<- kept");
        console2.log("FeeCollector   ", address(fees), "<- kept");
        console2.log("");
        console2.log("Now, per live mandate owned by you:");
        console2.log("  guard.setExecutor(mandateId, newExecutor)");
        console2.log("Until then the old executor is still the one they will accept.");
    }
}
