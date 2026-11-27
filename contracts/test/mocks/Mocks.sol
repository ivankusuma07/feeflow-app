// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LaunchedToken, FeePolicy} from "../../src/interfaces/IPons.sol";

/// @dev USDG stand-in: 6 decimals, pausable like the Paxos token (transfers revert while paused).
contract MockUSDG is ERC20 {
    bool public paused;

    error Paused();

    constructor() ERC20("Global Dollar", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setPaused(bool p) external {
        paused = p;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert Paused();
        super._update(from, to, value);
    }
}

/// @dev Pons fee escrow stand-in: self-service claims that pay msg.sender, per the Pons docs.
contract MockEscrow {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public balanceOfToken;

    function credit(address recipient) external payable {
        balanceOf[recipient] += msg.value;
    }

    function creditToken(address recipient, address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balanceOfToken[recipient][token] += amount;
    }

    function claim() external {
        uint256 amount = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "eth");
    }

    function claimToken(address token) external {
        uint256 amount = balanceOfToken[msg.sender][token];
        balanceOfToken[msg.sender][token] = 0;
        IERC20(token).transfer(msg.sender, amount);
    }
}

/// @dev Pons factory stand-in with the documented recipient rules, including the protocol-owner
///      override (IPonsOverride.sol) with the same events. Anyone may propose here; on Pons only
///      the owner can.
contract MockFactory {
    struct PendingRecipient {
        address newRecipient;
        uint256 effectiveAt;
        uint256 expiresAt;
    }

    uint256 public constant CREATOR_FEE_RECIPIENT_TIMELOCK = 3 days;
    uint256 public constant CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW = 3 days;

    mapping(address => LaunchedToken) internal _launched;
    mapping(address => PendingRecipient) public pendingCreatorFeeRecipient;

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

    error NotCreatorFeeRecipient();
    error NoPendingChange();
    error TimelockNotElapsed(uint256 effectiveAt);
    error TimelockExpired(uint256 expiresAt);

    function launch(address token, address deployer, address recipient, address pairToken) external {
        LaunchedToken storage l = _launched[token];
        l.token = token;
        l.deployer = deployer;
        l.creatorFeeRecipient = recipient;
        l.pairToken = pairToken;
        l.exists = true;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory) {
        return _launched[token];
    }

    function transferCreatorFeeRecipient(address token, address newRecipient) external {
        if (msg.sender != _launched[token].creatorFeeRecipient) revert NotCreatorFeeRecipient();
        _setRecipient(token, newRecipient);
    }

    function setCreatorFeeRecipient(address token, address newRecipient) external {
        uint256 effectiveAt = block.timestamp + CREATOR_FEE_RECIPIENT_TIMELOCK;
        uint256 expiresAt = effectiveAt + CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW;
        pendingCreatorFeeRecipient[token] = PendingRecipient(newRecipient, effectiveAt, expiresAt);
        emit CreatorFeeRecipientChangeProposed(
            token, _launched[token].creatorFeeRecipient, newRecipient, effectiveAt, expiresAt
        );
    }

    function executeCreatorFeeRecipientChange(address token) external {
        PendingRecipient memory p = pendingCreatorFeeRecipient[token];
        if (p.newRecipient == address(0)) revert NoPendingChange();
        if (block.timestamp < p.effectiveAt) revert TimelockNotElapsed(p.effectiveAt);
        if (block.timestamp > p.expiresAt) revert TimelockExpired(p.expiresAt);
        delete pendingCreatorFeeRecipient[token];
        _setRecipient(token, p.newRecipient);
    }

    function cancelCreatorFeeRecipientChange(address token) external {
        PendingRecipient memory p = pendingCreatorFeeRecipient[token];
        if (p.newRecipient == address(0)) revert NoPendingChange();
        delete pendingCreatorFeeRecipient[token];
        emit CreatorFeeRecipientChangeCancelled(token, p.newRecipient);
    }

    function _setRecipient(address token, address newRecipient) internal {
        address previous = _launched[token].creatorFeeRecipient;
        _launched[token].creatorFeeRecipient = newRecipient;
        emit CreatorFeeRecipientUpdated(token, previous, newRecipient);
    }

    function getLaunchFeePolicy(address) external pure returns (FeePolicy memory p) {
        return p;
    }
}

/// @dev Contract that rejects ETH, to test payout failure paths.
contract EthRejecter {
    receive() external payable {
        revert("no eth");
    }
}
