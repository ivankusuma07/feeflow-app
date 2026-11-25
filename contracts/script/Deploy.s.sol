// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {FeeFlow} from "../src/FeeFlow.sol";

/// @notice Mainnet / testnet / fork deployment. Every argument comes from env and is immutable
///         after deploy except the attester (timelocked rotation). Review with two people.
///
/// Env: PONS_FACTORY_ADDRESS, PONS_ESCROW_ADDRESS, FEEFLOW_FEE_RECIPIENT, ADMIN_MULTISIG,
///      ATTESTER_ADDRESS, ATTESTER_TIMELOCK (seconds)
///
/// Dry run on a fork:  forge script script/Deploy.s.sol --fork-url $RPC_URL
/// Broadcast:          forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
contract Deploy is Script {
    function run() external returns (FeeFlow ff) {
        address factory = vm.envAddress("PONS_FACTORY_ADDRESS");
        address escrow = vm.envAddress("PONS_ESCROW_ADDRESS");
        address feeRecipient = vm.envAddress("FEEFLOW_FEE_RECIPIENT");
        address admin = vm.envAddress("ADMIN_MULTISIG");
        address attester = vm.envAddress("ATTESTER_ADDRESS");
        uint256 timelock = vm.envUint("ATTESTER_TIMELOCK");

        require(factory.code.length > 0, "factory has no code");
        require(escrow.code.length > 0, "escrow has no code");
        require(timelock >= 1 hours, "timelock too short");

        vm.startBroadcast();
        ff = new FeeFlow(factory, escrow, feeRecipient, admin, attester, timelock);
        vm.stopBroadcast();

        console2.log("FeeFlow                ", address(ff));
        console2.log("FeeSink implementation ", ff.SINK_IMPLEMENTATION());
        console2.log("Deploy block           ", block.number);
    }
}
