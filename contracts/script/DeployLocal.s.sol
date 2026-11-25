// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {FeeFlow} from "../src/FeeFlow.sol";
import {MockEscrow, MockFactory, MockUSDG} from "../test/mocks/Mocks.sol";

/// @notice Local Anvil deployment with mock Pons contracts, for app development and e2e tests.
///         Never use on a public network.
///
///   anvil &
///   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///     --private-key <anvil account 0 key>
contract DeployLocal is Script {
    function run() external {
        require(block.chainid == 31337, "local only");
        address deployer = msg.sender;
        // Anvil account 1 acts as the attester in local development.
        address attester = vm.envOr("ATTESTER_ADDRESS", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8));

        vm.startBroadcast();
        MockFactory factory = new MockFactory();
        MockEscrow escrow = new MockEscrow();
        MockUSDG usdg = new MockUSDG();
        FeeFlow ff = new FeeFlow(address(factory), address(escrow), deployer, deployer, attester, 1 hours);

        // Two demo tokens launched by the deployer: one USDG pair, one ETH pair.
        address demoUsdg = address(uint160(uint256(keccak256("feeflow.demo.usdg"))));
        address demoEth = address(uint160(uint256(keccak256("feeflow.demo.eth"))));
        factory.launch(demoUsdg, deployer, deployer, address(usdg));
        factory.launch(demoEth, deployer, deployer, address(0));
        usdg.mint(deployer, 1_000_000e6);
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_CONTRACT_ADDRESS=", address(ff));
        console2.log("NEXT_PUBLIC_SINK_IMPLEMENTATION_ADDRESS=", ff.SINK_IMPLEMENTATION());
        console2.log("MOCK_FACTORY=", address(factory));
        console2.log("MOCK_ESCROW=", address(escrow));
        console2.log("MOCK_USDG=", address(usdg));
        console2.log("DEMO_TOKEN_USDG=", demoUsdg);
        console2.log("DEMO_TOKEN_ETH=", demoEth);
    }
}
