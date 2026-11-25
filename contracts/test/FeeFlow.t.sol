// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {FeeFlow} from "../src/FeeFlow.sol";
import {FeeSink} from "../src/FeeSink.sol";

contract RegisterTest is BaseTest {
    function test_register_deploysSinkAtPredictedAddress() public {
        address predicted = ff.predictSink(tokenUsdg);
        address sink = _register(tokenUsdg, X_ID);
        assertEq(sink, predicted);
        FeeFlow.TokenInfo memory t = ff.tokens(tokenUsdg);
        assertEq(t.sink, sink);
        assertEq(t.xUserId, X_ID);
        assertEq(t.creator, creator);
        assertEq(t.asset, address(usdg));
        assertFalse(t.exited);
        assertEq(ff.tokenOfSink(sink), tokenUsdg);
        assertEq(FeeSink(payable(sink)).feeflow(), address(ff));
    }

    function test_register_launchedWithSinkAsRecipient() public {
        address token = makeAddr("newToken");
        factory.launch(token, creator, ff.predictSink(token), address(usdg));
        _register(token, X_ID);
        assertEq(ff.tokens(token).creator, creator);
    }

    function test_register_revertsForNonPonsToken() public {
        address token = makeAddr("foreign");
        vm.expectRevert(FeeFlow.NotPonsToken.selector);
        _register(token, X_ID);
    }

    function test_register_revertsWhenCreatorIsNotRecipient() public {
        vm.prank(creator);
        factory.transferCreatorFeeRecipient(tokenUsdg, makeAddr("someoneElse"));
        vm.expectRevert(FeeFlow.NotCurrentRecipient.selector);
        _register(tokenUsdg, X_ID);
    }

    function test_register_revertsOnBadCreatorSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 expiry = block.timestamp + 10 minutes;
        FeeFlow.RegisterParams memory p =
            FeeFlow.RegisterParams(tokenUsdg, X_ID, creator, deadline, 1, expiry);
        // Signed for a different X account.
        bytes memory sig = _routeSig(tokenUsdg, OTHER_X_ID, deadline);
        vm.expectRevert(FeeFlow.InvalidCreatorSignature.selector);
        ff.registerToken(p, sig, _registerAtt(tokenUsdg, X_ID, 1, expiry));
    }

    function test_register_revertsOnBadAttestation() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 expiry = block.timestamp + 10 minutes;
        FeeFlow.RegisterParams memory p =
            FeeFlow.RegisterParams(tokenUsdg, X_ID, creator, deadline, 1, expiry);
        bytes memory att =
            _sign(0xBAD, keccak256(abi.encode(registerTh, tokenUsdg, X_ID, uint256(1), expiry)));
        vm.expectRevert(FeeFlow.InvalidAttestation.selector);
        ff.registerToken(p, _routeSig(tokenUsdg, X_ID, deadline), att);
    }

    function test_register_revertsTwice() public {
        _register(tokenUsdg, X_ID);
        vm.expectRevert(FeeFlow.AlreadyRegistered.selector);
        _register(tokenUsdg, X_ID);
    }

    function test_register_revertsWhenPaused() public {
        vm.prank(admin);
        ff.setRegistrationPaused(true);
        vm.expectRevert(FeeFlow.RegistrationIsPaused.selector);
        _register(tokenUsdg, X_ID);
    }

    function test_register_revertsOnZeroXUserId() public {
        vm.expectRevert(FeeFlow.InvalidXUserId.selector);
        _register(tokenUsdg, 0);
    }

    function test_sinkImplementationCannotBeInitialized() public {
        FeeSink impl = FeeSink(payable(ff.SINK_IMPLEMENTATION()));
        vm.expectRevert(FeeSink.AlreadyInitialized.selector);
        impl.initialize(address(this), tokenUsdg, address(usdg), address(escrow), address(factory));
    }

    function test_sink_onlyFeeFlow() public {
        address sink = _route(tokenUsdg, X_ID);
        vm.expectRevert(FeeSink.OnlyFeeFlow.selector);
        FeeSink(payable(sink)).pull();
        vm.expectRevert(FeeSink.OnlyFeeFlow.selector);
        FeeSink(payable(sink)).transferRecipient(address(this));
    }
}

contract CollectTest is BaseTest {
    address internal sinkU;
    address internal sinkE;

    function setUp() public override {
        super.setUp();
        sinkU = _route(tokenUsdg, X_ID);
        sinkE = _route(tokenEth, X_ID);
    }

    function test_collect_usdg_takesOnePercent() public {
        _accrueUsdg(sinkU, 52_630_000);
        uint256 net = ff.collect(tokenUsdg);
        assertEq(net, 52_103_700);
        assertEq(ff.credited(tokenUsdg), 52_103_700);
        assertEq(ff.accruedFees(address(usdg)), 526_300);
        assertEq(usdg.balanceOf(address(ff)), 52_630_000);
        FeeFlow.Totals memory t = ff.totals(address(usdg));
        assertEq(t.collectedGross, 52_630_000);
        assertEq(t.feesTaken, 526_300);
        assertEq(t.credited, 52_103_700);
        assertEq(ff.batchTail(tokenUsdg), 1);
    }

    function test_collect_eth() public {
        _accrueEth(sinkE, 1 ether);
        ff.collect(tokenEth);
        assertEq(ff.credited(tokenEth), 0.99 ether);
        assertEq(ff.accruedFees(address(0)), 0.01 ether);
        assertEq(address(ff).balance, 1 ether);
    }

    function test_collect_zeroIsNoop() public {
        assertEq(ff.collect(tokenUsdg), 0);
        assertEq(ff.batchTail(tokenUsdg), 0);
    }

    function test_collect_sameTimestampMergesBatch() public {
        _accrueUsdg(sinkU, 1_000_000);
        ff.collect(tokenUsdg);
        _accrueUsdg(sinkU, 1_000_000);
        ff.collect(tokenUsdg);
        assertEq(ff.batchTail(tokenUsdg), 1);
        vm.warp(block.timestamp + 1);
        _accrueUsdg(sinkU, 1_000_000);
        ff.collect(tokenUsdg);
        assertEq(ff.batchTail(tokenUsdg), 2);
        assertEq(ff.credited(tokenUsdg), 2_970_000);
    }

    function test_collect_unregisteredReverts() public {
        vm.expectRevert(FeeFlow.NotRegistered.selector);
        ff.collect(makeAddr("nope"));
    }

    function test_collectMany() public {
        _accrueUsdg(sinkU, 10_000);
        _accrueEth(sinkE, 10_000);
        ff.collectMany(_list(tokenUsdg, tokenEth));
        assertEq(ff.credited(tokenUsdg), 9_900);
        assertEq(ff.credited(tokenEth), 9_900);
    }

    function test_feeflow_rejectsEthFromNonSink() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(ff).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function testFuzz_collect_split(uint256 gross) public {
        gross = bound(gross, 1, type(uint128).max / 2);
        _accrueUsdg(sinkU, gross);
        ff.collect(tokenUsdg);
        uint256 fee = ff.accruedFees(address(usdg));
        assertEq(fee, gross / 100);
        assertEq(ff.credited(tokenUsdg) + fee, gross);
    }
}

contract ClaimTest is BaseTest {
    address internal sinkU;
    address internal sinkE;

    function setUp() public override {
        super.setUp();
        sinkU = _route(tokenUsdg, X_ID);
        sinkE = _route(tokenEth, X_ID);
        _accrueUsdg(sinkU, 100_000_000);
        _accrueEth(sinkE, 1 ether);
        ff.collectMany(_list(tokenUsdg, tokenEth));
    }

    function test_claim_paysAllAssetsToDestination() public {
        _claim(X_ID, _list(tokenUsdg, tokenEth), handleWallet);
        assertEq(usdg.balanceOf(handleWallet), 99_000_000);
        assertEq(handleWallet.balance, 0.99 ether);
        assertEq(ff.credited(tokenUsdg), 0);
        assertEq(ff.batchHead(tokenUsdg), ff.batchTail(tokenUsdg));
        assertEq(ff.totals(address(usdg)).claimed, 99_000_000);
    }

    function test_claim_skipsTokensBoundToOtherAccounts() public {
        address tokenOther = makeAddr("other");
        factory.launch(tokenOther, creator, creator, address(usdg));
        address sinkO = _route(tokenOther, OTHER_X_ID);
        _accrueUsdg(sinkO, 1_000_000);
        ff.collect(tokenOther);
        _claim(X_ID, _list(tokenUsdg, tokenOther), handleWallet);
        assertEq(usdg.balanceOf(handleWallet), 99_000_000);
        assertEq(ff.credited(tokenOther), 990_000);
    }

    function test_claim_nothingToClaimReverts() public {
        uint256 nonce = 999;
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = _claimAtt(OTHER_X_ID, handleWallet, nonce, expiry);
        vm.expectRevert(FeeFlow.NothingToClaim.selector);
        ff.claim(OTHER_X_ID, _list(tokenUsdg), handleWallet, expiry, nonce, att);
    }

    function test_claim_replayReverts() public {
        uint256 nonce = 77;
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = _claimAtt(X_ID, handleWallet, nonce, expiry);
        ff.claim(X_ID, _list(tokenUsdg), handleWallet, expiry, nonce, att);
        vm.expectRevert(FeeFlow.NonceUsed.selector);
        ff.claim(X_ID, _list(tokenEth), handleWallet, expiry, nonce, att);
    }

    function test_claim_expiredAttestationReverts() public {
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = _claimAtt(X_ID, handleWallet, 5, expiry);
        vm.warp(expiry + 1);
        vm.expectRevert(FeeFlow.AttestationExpired.selector);
        ff.claim(X_ID, _list(tokenUsdg), handleWallet, expiry, 5, att);
    }

    function test_claim_cannotRedirectDestination() public {
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = _claimAtt(X_ID, handleWallet, 5, expiry);
        vm.expectRevert(FeeFlow.InvalidAttestation.selector);
        ff.claim(X_ID, _list(tokenUsdg), makeAddr("thief"), expiry, 5, att);
    }

    function test_claim_domainMismatch_chainId() public {
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = _claimAtt(X_ID, handleWallet, 5, expiry);
        vm.chainId(46630);
        vm.expectRevert(FeeFlow.InvalidAttestation.selector);
        ff.claim(X_ID, _list(tokenUsdg), handleWallet, expiry, 5, att);
    }

    function test_claim_domainMismatch_contract() public {
        FeeFlow other =
            new FeeFlow(address(factory), address(escrow), feeRecipient, admin, attesterAddr, TIMELOCK);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes32 structHash = keccak256(abi.encode(claimTh, X_ID, handleWallet, uint256(5), expiry));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(attesterKey, keccak256(abi.encodePacked("\x19\x01", other.domainSeparator(), structHash)));
        vm.expectRevert(FeeFlow.InvalidAttestation.selector);
        ff.claim(X_ID, _list(tokenUsdg), handleWallet, expiry, 5, abi.encodePacked(r, s, v));
    }

    function test_claim_includesExpiredButUnreleasedBatches() public {
        vm.warp(block.timestamp + 31 days);
        assertEq(ff.expirable(tokenUsdg), 99_000_000);
        _claim(X_ID, _list(tokenUsdg), handleWallet);
        assertEq(usdg.balanceOf(handleWallet), 99_000_000);
    }

    function test_claim_revertsWhileUsdgPaused() public {
        usdg.setPaused(true);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = _claimAtt(X_ID, handleWallet, 8, expiry);
        vm.expectRevert();
        ff.claim(X_ID, _list(tokenUsdg), handleWallet, expiry, 8, att);
        // Nothing was debited.
        assertEq(ff.credited(tokenUsdg), 99_000_000);
    }
}

contract ExpiryTest is BaseTest {
    address internal sinkU;

    function setUp() public override {
        super.setUp();
        sinkU = _route(tokenUsdg, X_ID);
    }

    function test_releaseExpired_beforeWindowReverts() public {
        _accrueUsdg(sinkU, 1_000_000);
        ff.collect(tokenUsdg);
        vm.warp(block.timestamp + 30 days - 1);
        vm.expectRevert(FeeFlow.NothingExpired.selector);
        ff.releaseExpired(tokenUsdg, 10);
    }

    function test_releaseExpired_paysCreatorOnly() public {
        _accrueUsdg(sinkU, 1_000_000);
        ff.collect(tokenUsdg);
        vm.warp(block.timestamp + 10 days);
        _accrueUsdg(sinkU, 2_000_000);
        ff.collect(tokenUsdg);
        assertEq(ff.oldestDeadline(tokenUsdg), block.timestamp - 10 days + 30 days);

        vm.warp(block.timestamp + 20 days);
        uint256 released = ff.releaseExpired(tokenUsdg, 10);
        assertEq(released, 990_000);
        assertEq(usdg.balanceOf(creator), 990_000);
        assertEq(usdg.balanceOf(feeRecipient), 0);
        assertEq(ff.credited(tokenUsdg), 1_980_000);
        assertEq(ff.totals(address(usdg)).expiredToCreators, 990_000);
    }

    function test_releaseExpired_500Batches_bounded() public {
        for (uint256 i; i < 500; ++i) {
            _accrueUsdg(sinkU, 100);
            ff.collect(tokenUsdg);
            vm.warp(block.timestamp + 1);
        }
        assertEq(ff.batchTail(tokenUsdg), 500);
        vm.warp(block.timestamp + 31 days);
        assertEq(ff.expirable(tokenUsdg), 500 * 99);

        uint256 g = gasleft();
        ff.releaseExpired(tokenUsdg, 100);
        uint256 used = g - gasleft();
        assertEq(ff.batchHead(tokenUsdg), 100);
        assertLt(used, 1_500_000);

        for (uint256 i; i < 4; ++i) {
            ff.releaseExpired(tokenUsdg, 100);
        }
        assertEq(ff.credited(tokenUsdg), 0);
        assertEq(usdg.balanceOf(creator), 500 * 99);
        vm.expectRevert(FeeFlow.NothingExpired.selector);
        ff.releaseExpired(tokenUsdg, 100);
    }

    function test_batchesView() public {
        _accrueUsdg(sinkU, 1_000);
        ff.collect(tokenUsdg);
        vm.warp(block.timestamp + 1);
        _accrueUsdg(sinkU, 2_000);
        ff.collect(tokenUsdg);
        FeeFlow.Batch[] memory b = ff.batches(tokenUsdg, 0, 10);
        assertEq(b.length, 2);
        assertEq(b[0].amount, 990);
        assertEq(b[1].amount, 1_980);
        assertEq(ff.batches(tokenUsdg, 1, 10).length, 1);
        assertEq(ff.batches(tokenUsdg, 5, 10).length, 0);
    }
}

contract ExitTest is BaseTest {
    address internal sinkU;
    address internal newRecipient = makeAddr("newRecipient");

    function setUp() public override {
        super.setUp();
        sinkU = _route(tokenUsdg, X_ID);
    }

    function _exitByHandle(uint64 xUserId, address to) internal {
        uint256 nonce = nextNonce++;
        uint256 expiry = block.timestamp + 10 minutes;
        ff.exitByHandle(tokenUsdg, to, expiry, nonce, _exitAtt(xUserId, tokenUsdg, to, nonce, expiry));
    }

    function test_exitByHandle_collectsAndMovesRecipient() public {
        _accrueUsdg(sinkU, 1_000_000);
        _exitByHandle(X_ID, newRecipient);
        assertTrue(ff.tokens(tokenUsdg).exited);
        assertEq(ff.credited(tokenUsdg), 990_000);
        assertEq(factory.getLaunchedToken(tokenUsdg).creatorFeeRecipient, newRecipient);
        // Already-credited amounts stay claimable by the handle.
        _claim(X_ID, _list(tokenUsdg), handleWallet);
        assertEq(usdg.balanceOf(handleWallet), 990_000);
    }

    function test_exitByHandle_attestationMustMatchStoredXUserId() public {
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory att = _exitAtt(OTHER_X_ID, tokenUsdg, newRecipient, 3, expiry);
        vm.expectRevert(FeeFlow.InvalidAttestation.selector);
        ff.exitByHandle(tokenUsdg, newRecipient, expiry, 3, att);
    }

    function test_exitByCreator() public {
        vm.prank(creator);
        ff.exitByCreator(tokenUsdg, newRecipient);
        assertEq(factory.getLaunchedToken(tokenUsdg).creatorFeeRecipient, newRecipient);
    }

    function test_exitByCreator_onlyCreator() public {
        vm.expectRevert(FeeFlow.NotCreator.selector);
        ff.exitByCreator(tokenUsdg, newRecipient);
    }

    function test_exit_succeedsWhenCollectReverts_pausedUsdg() public {
        _accrueUsdg(sinkU, 1_000_000);
        usdg.setPaused(true);
        vm.prank(creator);
        ff.exitByCreator(tokenUsdg, newRecipient);
        assertTrue(ff.tokens(tokenUsdg).exited);
        assertEq(factory.getLaunchedToken(tokenUsdg).creatorFeeRecipient, newRecipient);
        // Escrow balance credited before the exit is still collectable later.
        usdg.setPaused(false);
        ff.collect(tokenUsdg);
        assertEq(ff.credited(tokenUsdg), 990_000);
    }

    function test_exit_twiceReverts() public {
        vm.startPrank(creator);
        ff.exitByCreator(tokenUsdg, newRecipient);
        vm.expectRevert(FeeFlow.AlreadyExited.selector);
        ff.exitByCreator(tokenUsdg, newRecipient);
        vm.stopPrank();
    }

    function test_exit_rejectsZeroAndSinkRecipient() public {
        vm.startPrank(creator);
        vm.expectRevert(FeeFlow.InvalidRecipient.selector);
        ff.exitByCreator(tokenUsdg, address(0));
        vm.expectRevert(FeeFlow.InvalidRecipient.selector);
        ff.exitByCreator(tokenUsdg, sinkU);
        vm.stopPrank();
    }

    function test_exit_whenSinkNeverBecameRecipient() public {
        address token = makeAddr("unrouted");
        factory.launch(token, creator, creator, address(usdg));
        _register(token, X_ID);
        vm.prank(creator);
        ff.exitByCreator(token, newRecipient);
        assertTrue(ff.tokens(token).exited);
        assertEq(factory.getLaunchedToken(token).creatorFeeRecipient, creator);
    }
}

contract AdminTest is BaseTest {
    function test_withdrawFees_toImmutableRecipient() public {
        address sinkU = _route(tokenUsdg, X_ID);
        _accrueUsdg(sinkU, 1_000_000);
        ff.collect(tokenUsdg);
        ff.withdrawFees(address(usdg));
        assertEq(usdg.balanceOf(feeRecipient), 10_000);
        assertEq(ff.accruedFees(address(usdg)), 0);
        vm.expectRevert(FeeFlow.NothingToWithdraw.selector);
        ff.withdrawFees(address(usdg));
    }

    function test_attesterRotation_timelocked() public {
        address next = makeAddr("nextAttester");
        vm.expectRevert(FeeFlow.OnlyAdmin.selector);
        ff.queueAttester(next);

        vm.startPrank(admin);
        ff.queueAttester(next);
        vm.expectRevert(
            abi.encodeWithSelector(FeeFlow.TimelockNotElapsed.selector, block.timestamp + TIMELOCK)
        );
        ff.executeAttester();
        vm.warp(block.timestamp + TIMELOCK);
        ff.executeAttester();
        vm.stopPrank();
        assertEq(ff.attester(), next);
    }

    function test_attesterRotation_cancel() public {
        vm.startPrank(admin);
        ff.queueAttester(makeAddr("x"));
        ff.cancelAttester();
        vm.expectRevert(FeeFlow.NoPendingAttester.selector);
        ff.executeAttester();
        vm.stopPrank();
    }

    /// The ABI must expose no setter for the fee, the window, the fee recipient or token bindings:
    /// the only `set*` function is the registration pause, and nothing can sweep or rescue balances.
    function test_abiHasNoForbiddenSetters() public view {
        string memory json = vm.readFile("out/FeeFlow.sol/FeeFlow.json");
        string[] memory sigs = vm.parseJsonKeys(json, ".methodIdentifiers");
        assertGt(sigs.length, 20);
        for (uint256 i; i < sigs.length; ++i) {
            bytes memory sig = bytes(sigs[i]);
            if (_startsWith(sig, "set")) assertEq(sigs[i], "setRegistrationPaused(bool)");
            assertFalse(_startsWith(sig, "rescue"), sigs[i]);
            assertFalse(_startsWith(sig, "sweep"), sigs[i]);
            assertFalse(_startsWith(sig, "rebind"), sigs[i]);
            assertFalse(_startsWith(sig, "upgrade"), sigs[i]);
        }
    }

    function _startsWith(bytes memory s, bytes memory prefix) internal pure returns (bool) {
        if (s.length < prefix.length) return false;
        for (uint256 i; i < prefix.length; ++i) {
            if (s[i] != prefix[i]) return false;
        }
        return true;
    }
}
