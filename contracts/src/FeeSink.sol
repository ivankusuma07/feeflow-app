// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPonsFactory, IPonsFeeEscrow} from "./interfaces/IPons.sol";

/// @title FeeSink
/// @notice Per-token Pons creator fee recipient. Deployed by FeeFlow as an EIP-1167 clone at a
///         CREATE2 address (salt = token), so its address is known before routing.
/// @dev The Pons escrow pays only msg.sender, so this contract must itself be the recipient and
///      call `claim` / `claimToken`. Every state-changing function is callable only by FeeFlow.
contract FeeSink {
    using SafeERC20 for IERC20;

    /// @notice Pair asset sentinel for native ETH pairs.
    address public constant NATIVE = address(0);

    address public feeflow;
    address public token;
    address public pairAsset;
    IPonsFeeEscrow public escrow;
    IPonsFactory public factory;

    error AlreadyInitialized();
    error ZeroAddress();
    error OnlyFeeFlow();
    error OnlyEscrow();
    error EthForwardFailed();

    modifier onlyFeeFlow() {
        if (msg.sender != feeflow) revert OnlyFeeFlow();
        _;
    }

    /// @dev Locks the implementation so it can never be initialized directly.
    constructor() {
        feeflow = address(this);
    }

    function initialize(
        address feeflow_,
        address token_,
        address pairAsset_,
        address escrow_,
        address factory_
    ) external {
        if (feeflow != address(0)) revert AlreadyInitialized();
        if (feeflow_ == address(0) || token_ == address(0) || escrow_ == address(0) || factory_ == address(0))
        {
            revert ZeroAddress();
        }
        feeflow = feeflow_;
        token = token_;
        pairAsset = pairAsset_;
        escrow = IPonsFeeEscrow(escrow_);
        factory = IPonsFactory(factory_);
    }

    /// @notice Claims this sink's pair-asset balance from the Pons escrow and forwards everything it
    ///         holds in that asset to FeeFlow. FeeFlow measures the amount by its own balance delta.
    /// @return amount Amount forwarded.
    function pull() external onlyFeeFlow returns (uint256 amount) {
        if (pairAsset == NATIVE) {
            if (escrow.balanceOf(address(this)) > 0) escrow.claim();
            amount = address(this).balance;
            if (amount > 0) {
                (bool ok,) = feeflow.call{value: amount}("");
                if (!ok) revert EthForwardFailed();
            }
        } else {
            if (escrow.balanceOfToken(address(this), pairAsset) > 0) escrow.claimToken(pairAsset);
            amount = IERC20(pairAsset).balanceOf(address(this));
            if (amount > 0) IERC20(pairAsset).safeTransfer(feeflow, amount);
        }
    }

    /// @notice Moves the token's Pons creator fee recipient away from this sink (exit).
    function transferRecipient(address newRecipient) external onlyFeeFlow {
        factory.transferCreatorFeeRecipient(token, newRecipient);
    }

    /// @notice Accepts ETH only from the Pons escrow.
    receive() external payable {
        if (msg.sender != address(escrow)) revert OnlyEscrow();
    }
}
