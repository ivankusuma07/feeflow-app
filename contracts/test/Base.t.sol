// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FeeFlow} from "../src/FeeFlow.sol";
import {MockEscrow, MockFactory, MockUSDG} from "./mocks/Mocks.sol";

abstract contract BaseTest is Test {
    FeeFlow internal ff;
    MockFactory internal factory;
    MockEscrow internal escrow;
    MockUSDG internal usdg;

    uint256 internal attesterKey = 0xA77E57;
    address internal attesterAddr;
    uint256 internal creatorKey = 0xC12EA702;
    address internal creator;

    address internal feeRecipient = makeAddr("feeRecipient");
    address internal admin = makeAddr("admin");
    address internal handleWallet = makeAddr("handleWallet");

    address internal tokenUsdg = makeAddr("tokenUsdg");
    address internal tokenEth = makeAddr("tokenEth");

    uint64 internal constant X_ID = 1234567890;
    uint64 internal constant OTHER_X_ID = 987654321;
    uint256 internal constant TIMELOCK = 48 hours;

    uint256 internal nextNonce = 1;

    // Cached so signing helpers make no external calls (keeps vm.expectRevert on the right call).
    bytes32 internal domainSep;
    bytes32 internal routeTh;
    bytes32 internal registerTh;
    bytes32 internal claimTh;
    bytes32 internal exitTh;

    function setUp() public virtual {
        vm.warp(1_764_000_000);
        attesterAddr = vm.addr(attesterKey);
        creator = vm.addr(creatorKey);
        factory = new MockFactory();
        escrow = new MockEscrow();
        usdg = new MockUSDG();
        ff = new FeeFlow(address(factory), address(escrow), feeRecipient, admin, attesterAddr, TIMELOCK);
        domainSep = ff.domainSeparator();
        routeTh = ff.ROUTE_TYPEHASH();
        registerTh = ff.REGISTER_TYPEHASH();
        claimTh = ff.CLAIM_TYPEHASH();
        exitTh = ff.EXIT_TYPEHASH();

        factory.launch(tokenUsdg, creator, creator, address(usdg));
        factory.launch(tokenEth, creator, creator, address(0));
    }

    // ---------------------------------------------------------------- signing helpers

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
    }

    function _sign(uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _routeSig(address token, uint64 xUserId, uint256 deadline) internal view returns (bytes memory) {
        return _sign(creatorKey, keccak256(abi.encode(routeTh, token, xUserId, deadline)));
    }

    function _registerAtt(address token, uint64 xUserId, uint256 nonce, uint256 expiry)
        internal
        view
        returns (bytes memory)
    {
        return _sign(attesterKey, keccak256(abi.encode(registerTh, token, xUserId, nonce, expiry)));
    }

    function _claimAtt(uint64 xUserId, address to, uint256 nonce, uint256 expiry)
        internal
        view
        returns (bytes memory)
    {
        return _sign(attesterKey, keccak256(abi.encode(claimTh, xUserId, to, nonce, expiry)));
    }

    function _exitAtt(uint64 xUserId, address token, address newRecipient, uint256 nonce, uint256 expiry)
        internal
        view
        returns (bytes memory)
    {
        return _sign(attesterKey, keccak256(abi.encode(exitTh, xUserId, token, newRecipient, nonce, expiry)));
    }

    // ---------------------------------------------------------------- flow helpers

    function _register(address token, uint64 xUserId) internal returns (address sink) {
        uint256 nonce = nextNonce++;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 expiry = block.timestamp + 10 minutes;
        FeeFlow.RegisterParams memory p = FeeFlow.RegisterParams({
            token: token,
            xUserId: xUserId,
            creator: creator,
            creatorDeadline: deadline,
            nonce: nonce,
            expiry: expiry
        });
        sink = ff.registerToken(
            p, _routeSig(token, xUserId, deadline), _registerAtt(token, xUserId, nonce, expiry)
        );
    }

    /// @dev Register and point the Pons recipient at the sink, as the creator would in tx 2.
    function _route(address token, uint64 xUserId) internal returns (address sink) {
        sink = _register(token, xUserId);
        vm.prank(creator);
        factory.transferCreatorFeeRecipient(token, sink);
    }

    function _accrueUsdg(address sink, uint256 amount) internal {
        usdg.mint(address(this), amount);
        usdg.approve(address(escrow), amount);
        escrow.creditToken(sink, address(usdg), amount);
    }

    function _accrueEth(address sink, uint256 amount) internal {
        vm.deal(address(this), amount);
        escrow.credit{value: amount}(sink);
    }

    function _claim(uint64 xUserId, address[] memory list, address to) internal {
        uint256 nonce = nextNonce++;
        uint256 expiry = block.timestamp + 10 minutes;
        ff.claim(xUserId, list, to, expiry, nonce, _claimAtt(xUserId, to, nonce, expiry));
    }

    function _list(address a) internal pure returns (address[] memory l) {
        l = new address[](1);
        l[0] = a;
    }

    function _list(address a, address b) internal pure returns (address[] memory l) {
        l = new address[](2);
        l[0] = a;
        l[1] = b;
    }
}
