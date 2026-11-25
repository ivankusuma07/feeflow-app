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

/// @dev Pons factory stand-in with the documented recipient rules.
contract MockFactory {
    mapping(address => LaunchedToken) internal _launched;

    error NotCreatorFeeRecipient();

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
        _launched[token].creatorFeeRecipient = newRecipient;
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
