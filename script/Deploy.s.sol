// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Executor, ISignatureTransfer} from "../contracts/Executor.sol";
import {FairValueOracle} from "../contracts/FairValueOracle.sol";
import {IFairValueOracle} from "../contracts/interfaces/IFairValueOracle.sol";
import {PolicyGuard} from "../contracts/PolicyGuard.sol";
import {ReceiptRegistry} from "../contracts/ReceiptRegistry.sol";

/// @notice Minimal settlement token, deployed only when the configured `CASH`
///         address has no code on the target chain — which is the normal case on
///         testnet, where the real USDG does not exist. Never used on mainnet.
contract TestUSDG {
    string public constant name = "Test Global Dollar";
    string public constant symbol = "tUSDG";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// Usage:
///   export PRIVATE_KEY=0x...
///   forge script script/Deploy.s.sol --rpc-url xlayer_testnet --broadcast
contract Deploy is Script {
    address constant MAINNET_USDG = 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8;
    // Canonical on X Layer — verified on-chain, unlike the Uniswap V3 factory.
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    /// @dev X Layer's Uniswap V3 factory is **not** at the canonical address, and
    ///      that is load-bearing: the Universal Router has the canonical one baked
    ///      into its bytecode, which is why it cannot swap here and why Executor
    ///      derives pool addresses itself. See D1 and D35.
    address constant V3_FACTORY = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address cash = vm.envOr("CASH", MAINNET_USDG);

        console2.log("chainid ", block.chainid);
        console2.log("deployer", deployer);
        console2.log("balance ", deployer.balance);

        vm.startBroadcast(pk);

        // The Executor needs `decimals()` for its price math, so a settlement
        // token that does not exist on this chain has to be stood up.
        if (cash.code.length == 0) {
            cash = address(new TestUSDG());
            console2.log("cash    ", cash, "<- deployed TestUSDG (configured CASH had no code)");
        } else {
            console2.log("cash    ", cash);
        }

        // The same discipline the settlement token already gets, applied to the
        // two dependencies Executor cannot work without. Both are correct on
        // mainnet and one of them is *absent* on testnet — the X Layer v3
        // factory has no code on 1952 — so an unchecked constant here deploys an
        // Executor that reverts on every swap and says nothing about why. That
        // is exactly how D35 stayed hidden.
        address factory = vm.envOr("V3_FACTORY", V3_FACTORY);
        bool factoryLive = factory.code.length > 0;
        bool permit2Live = PERMIT2.code.length > 0;

        console2.log("factory ", factory, factoryLive ? "" : "<- NO CODE ON THIS CHAIN");
        console2.log("permit2 ", PERMIT2, permit2Live ? "" : "<- NO CODE ON THIS CHAIN");

        // On mainnet this must be right or the deployment is worthless. On a
        // testnet it is allowed to be missing, because the oracle, the guard and
        // the receipt registry are still worth exercising there — but nobody
        // gets to discover it from a revert with no data.
        if (block.chainid == 196) {
            require(factoryLive, "V3_FACTORY has no code on mainnet");
            require(permit2Live, "PERMIT2 has no code on mainnet");
        } else if (!factoryLive || !permit2Live) {
            console2.log("WARNING: Executor cannot swap on this chain. Oracle/guard/receipts only.");
        }

        FairValueOracle oracle = new FairValueOracle(deployer);
        ReceiptRegistry receipts = new ReceiptRegistry(deployer);
        PolicyGuard guard =
            new PolicyGuard(IFairValueOracle(address(oracle)), receipts, cash);

        // PolicyGuard is the only contract permitted to append receipts.
        receipts.setWriter(address(guard), true);

        Executor executor = new Executor(
            ISignatureTransfer(PERMIT2),
            factory,
            guard,
            IFairValueOracle(address(oracle)),
            cash
        );

        vm.stopBroadcast();

        console2.log("FairValueOracle", address(oracle));
        console2.log("ReceiptRegistry", address(receipts));
        console2.log("PolicyGuard    ", address(guard));
        console2.log("Executor       ", address(executor));
    }
}
