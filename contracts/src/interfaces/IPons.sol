// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * Pons v2 interfaces used by FeeFlow.
 *
 * SOURCE: Pons developer docs (pons-labs-llc.mintlify.app/developers/*), read 25 Nov 2026.
 * STATUS: VERIFIED on a Robinhood Chain (4663) fork, 25 Nov 2026 (ADR-001, test/fork/PonsFork.t.sol):
 * every selector below is present in the deployed bytecode, return values decode as declared,
 * and the full route/collect/claim/exit flow runs against the live factory and escrow.
 * The explorers' verified-source APIs sit behind a bot check, so verification is by bytecode
 * selectors plus live decoding, not by comparing published ABI files.
 */

/// @dev Struct as listed in the docs for `getLaunchedToken`. Field order matters for ABI decoding.
struct LaunchedToken {
    address token;
    address curve;
    address deployer;
    address creatorFeeRecipient;
    address pairToken;
    uint256 graduationThreshold;
    uint24 poolFee;
    int24 tickSpacing;
    uint16 creatorTaxBps;
    bool buybackEnabled;
    uint8 phase;
    uint256 sweptQuote;
    uint256 sweptTokens;
    uint256 sweptAt;
    bool exists;
}

struct FeePolicy {
    address protocolFeeRecipient;
    uint16 protocolFeeShareBps;
    uint16 buybackBurnBps;
    uint16 hookFeeBps;
    uint16 maxInternalPriceImpactBps;
}

interface IPonsFactory {
    /// @notice The current creator fee recipient is `getLaunchedToken(token).creatorFeeRecipient`
    ///         (fills the PONS_RECIPIENT_GETTER placeholder). `exists` is false for foreign tokens.
    function getLaunchedToken(address token) external view returns (LaunchedToken memory);

    /// @notice Callable only by the current recipient (else `NotCreatorFeeRecipient()`).
    ///         Takes effect immediately; only future (unswept) fees move.
    /// @dev Parameter types inferred from the docs' description.
    function transferCreatorFeeRecipient(address token, address newRecipient) external;

    function getLaunchFeePolicy(address token) external view returns (FeePolicy memory);
}

interface IPonsFeeEscrow {
    /// @notice ETH balance credited to `recipient`.
    function balanceOf(address recipient) external view returns (uint256);

    /// @notice ERC-20 balance of `token` credited to `recipient`.
    function balanceOfToken(address recipient, address token) external view returns (uint256);

    /// @notice Pays the caller's full ETH balance to msg.sender. Strictly self-service.
    function claim() external;

    /// @notice Pays the caller's full balance of `token` to msg.sender. Strictly self-service.
    function claimToken(address token) external;
}
