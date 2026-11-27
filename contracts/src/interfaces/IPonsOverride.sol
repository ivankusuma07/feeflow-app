// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @notice Pons v2 protocol-owner override of a launch's creator fee recipient, as verified in
 *         PonsV2LaunchFactory's published source (Blockscout, 27 Nov 2026). The owner proposes a
 *         new recipient for any token; anyone can execute it after `CREATOR_FEE_RECIPIENT_TIMELOCK`
 *         (3 days) and before `expiresAt` (a further 3 days). A matured proposal supersedes the
 *         creator's own transfer, so it can move a token's future fees away from its FeeFlow sink.
 * @dev Read-only for FeeFlow (the web app and indexer use it). Not imported by FeeFlow.sol, so the
 *      deployed contracts' bytecode and metadata are unaffected.
 */
interface IPonsFactoryOverride {
    event CreatorFeeRecipientUpdated(
        address indexed token, address indexed previousRecipient, address indexed newRecipient
    );
    event CreatorFeeRecipientChangeProposed(
        address indexed token,
        address indexed currentRecipient,
        address indexed proposedRecipient,
        uint256 effectiveAt,
        uint256 expiresAt
    );
    event CreatorFeeRecipientChangeCancelled(address indexed token, address indexed proposedRecipient);

    /// @return newRecipient Zero when nothing is pending.
    function pendingCreatorFeeRecipient(address token)
        external
        view
        returns (address newRecipient, uint256 effectiveAt, uint256 expiresAt);

    function CREATOR_FEE_RECIPIENT_TIMELOCK() external view returns (uint256);
    function CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW() external view returns (uint256);
}
