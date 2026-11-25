// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "./Base.t.sol";
import {FeeFlow} from "../src/FeeFlow.sol";
import {MockEscrow, MockUSDG} from "./mocks/Mocks.sol";

/// @dev Drives random sequences of accrue / collect / claim / release / withdraw / exit / warp.
contract Handler is Test {
    FeeFlow internal ff;
    MockEscrow internal escrow;
    MockUSDG internal usdg;
    InvariantTest internal base;

    address[] public tokens;
    address[] public sinks;
    uint64 public xUserId;
    uint256 internal nonce = 1_000_000;

    constructor(
        FeeFlow ff_,
        MockEscrow escrow_,
        MockUSDG usdg_,
        InvariantTest base_,
        address[] memory tokens_,
        uint64 x
    ) {
        ff = ff_;
        escrow = escrow_;
        usdg = usdg_;
        base = base_;
        tokens = tokens_;
        xUserId = x;
        for (uint256 i; i < tokens_.length; ++i) {
            sinks.push(ff_.tokens(tokens_[i]).sink);
        }
    }

    function _pick(uint256 seed) internal view returns (uint256) {
        return seed % tokens.length;
    }

    function accrue(uint256 seed, uint256 amount) external {
        uint256 i = _pick(seed);
        amount = bound(amount, 1, 1e24);
        address sink = sinks[i];
        if (ff.tokens(tokens[i]).asset == address(0)) {
            vm.deal(address(this), amount);
            escrow.credit{value: amount}(sink);
        } else {
            usdg.mint(address(this), amount);
            usdg.approve(address(escrow), amount);
            escrow.creditToken(sink, address(usdg), amount);
        }
    }

    function collect(uint256 seed) external {
        ff.collect(tokens[_pick(seed)]);
    }

    function claim(uint256 seed) external {
        address[] memory list = new address[](1);
        list[0] = tokens[_pick(seed)];
        uint256 n = ++nonce;
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = base.signClaim(xUserId, address(0xBEEF), n, expiry);
        try ff.claim(xUserId, list, address(0xBEEF), expiry, n, att) {} catch {}
    }

    function release(uint256 seed, uint256 maxBatches) external {
        try ff.releaseExpired(tokens[_pick(seed)], bound(maxBatches, 1, 20)) {} catch {}
    }

    function withdraw(bool eth) external {
        try ff.withdrawFees(eth ? address(0) : address(usdg)) {} catch {}
    }

    function exit(uint256 seed) external {
        address token = tokens[_pick(seed)];
        vm.prank(ff.tokens(token).creator);
        try ff.exitByCreator(token, address(0xDEAD)) {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 15 days));
    }
}

contract InvariantTest is BaseTest {
    Handler internal handler;
    address[] internal routed;

    function setUp() public override {
        super.setUp();
        address t3 = makeAddr("t3");
        factory.launch(t3, creator, creator, address(usdg));
        _route(tokenUsdg, X_ID);
        _route(tokenEth, X_ID);
        _route(t3, X_ID);
        routed.push(tokenUsdg);
        routed.push(tokenEth);
        routed.push(t3);
        handler = new Handler(ff, escrow, usdg, this, routed, X_ID);
        targetContract(address(handler));
    }

    function signClaim(uint64 xUserId, address to, uint256 nonce, uint256 expiry)
        external
        view
        returns (bytes memory)
    {
        return _claimAtt(xUserId, to, nonce, expiry);
    }

    function _outstanding(address asset) internal view returns (uint256 sum) {
        for (uint256 i; i < routed.length; ++i) {
            if (ff.tokens(routed[i]).asset == asset) sum += ff.credited(routed[i]);
        }
    }

    /// FeeFlow always holds at least every outstanding credit plus unwithdrawn fees.
    function invariant_solvent() public view {
        assertGe(usdg.balanceOf(address(ff)), _outstanding(address(usdg)) + ff.accruedFees(address(usdg)));
        assertGe(address(ff).balance, _outstanding(address(0)) + ff.accruedFees(address(0)));
    }

    /// gross = fee + net; net = claimed + expired + outstanding; fees = withdrawn + accrued.
    function invariant_accounting() public view {
        address[2] memory assets = [address(usdg), address(0)];
        for (uint256 i; i < 2; ++i) {
            FeeFlow.Totals memory t = ff.totals(assets[i]);
            assertEq(t.collectedGross, t.feesTaken + t.credited);
            assertEq(t.credited, t.claimed + t.expiredToCreators + _outstanding(assets[i]));
            assertEq(t.feesTaken, t.feesWithdrawn + ff.accruedFees(assets[i]));
            assertLe(t.feesTaken * 100, t.collectedGross);
        }
    }

    /// Batch sums always equal the credited balance per token.
    function invariant_batchesMatchCredit() public view {
        for (uint256 i; i < routed.length; ++i) {
            FeeFlow.Batch[] memory b = ff.batches(routed[i], 0, type(uint256).max);
            uint256 sum;
            for (uint256 j; j < b.length; ++j) {
                sum += b[j].amount;
            }
            assertEq(sum, ff.credited(routed[i]));
        }
    }

    /// FeeFlow never pays itself from user balances: its fee recipient only ever gets accrued fees.
    function invariant_feeRecipientOnlyGetsFees() public view {
        assertEq(usdg.balanceOf(feeRecipient), ff.totals(address(usdg)).feesWithdrawn);
        assertEq(feeRecipient.balance, ff.totals(address(0)).feesWithdrawn);
    }
}
