// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @notice Pons v2 launch surface, transcribed from the verified PonsV2LaunchFactory and
 *         PonsV2LaunchDeployer sources (Blockscout, 28 Nov 2026). Used by the web app's Launch page.
 * @dev Not imported by FeeFlow.sol, so the deployed contracts' bytecode and metadata are unchanged.
 *      Metadata limits (bytes): name 64, symbol 16, logo 512, description 2048, each social 256.
 *      A launch's token address depends on its creator fee recipient (CREATE2 over the curve's
 *      constructor args), so a token cannot launch with its own FeeFlow sink as recipient.
 */
struct PonsSocials {
    string twitter;
    string telegram;
    string discord;
    string website;
    string farcaster;
}

struct PonsTokenParams {
    string name;
    string symbol;
    string logo;
    string description;
    PonsSocials socials;
    /// Zero = the launching wallet.
    address creatorFeeRecipient;
    /// Added creator tax on trades, at most `maxCreatorTaxBps` (1000 = 10%).
    uint16 creatorTaxBps;
    bool buybackEnabled;
    /// Zero skips the launch-economics check.
    bytes32 expectedEconomics;
    /// CREATE2 salt, scoped to the launching wallet.
    bytes32 salt;
}

struct PonsLaunchConfig {
    uint256 supply;
    uint256 curveFeeBps;
    uint256 phantomQuote;
    uint256 graduationThreshold;
    uint24 poolFee;
    int24 tickSpacing;
    bool enabled;
}

interface IPonsLaunchFactory {
    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed deployer,
        address pairToken,
        uint256 launchConfigId,
        uint256 graduationThreshold
    );

    /// @notice `msg.value` must equal `launchFee()` exactly. `pairToken` zero = native ETH.
    function launchToken(PonsTokenParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve);

    function launchFee() external view returns (uint256);
    function canLaunch(address launcher) external view returns (bool);
    function maxCreatorTaxBps() external view returns (uint256);
    function approvedPairTokens(address pairToken) external view returns (bool);
    function getLaunchConfig(uint256 id) external view returns (PonsLaunchConfig memory);
}

/// @notice The launch's bonding curve. ETH pairs pay `quoteIn` as `msg.value`; ERC-20 pairs approve.
interface IPonsCurveBuy {
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        returns (uint256 tokensOut);
}
