// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FeeFlow} from "../../src/FeeFlow.sol";
import {IPonsFactory, IPonsFeeEscrow, LaunchedToken, FeePolicy} from "../../src/interfaces/IPons.sol";
import {IPonsFactoryOverride} from "../../src/interfaces/IPonsOverride.sol";

/// Curve and sweep-operator functions FeeFlow does not call itself, verified against deployed
/// bytecode selectors (ADR-001 evidence).
interface IPonsCurve {
    function buy(uint256 amountIn, uint256 minTokensOut, address to) external payable returns (uint256);
    function sweepFees(uint256 minBuybackTokensOut) external;
    function token() external view returns (address);
    function pairToken() external view returns (address);
}

/// Owner-only side of the Pons recipient override (verified source), used to simulate it.
interface IPonsOwnerOverride {
    function owner() external view returns (address);
    function setCreatorFeeRecipient(address token, address newRecipient) external;
    function executeCreatorFeeRecipientChange(address token) external;
}

interface IPonsSweepOperator {
    function sweepCurve(address curve) external;
}

/// Stage 0 fork spike: FeeFlow against the live Pons v2 contracts on Robinhood Chain (4663).
/// Skipped unless FORK_RPC_URL is set:
///   FORK_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-path "test/fork/*" -vv
/// Optional FORK_BLOCK pins the block (needs an archive RPC); default is the latest block.
contract PonsForkTest is Test {
    IPonsFactory constant FACTORY = IPonsFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    IPonsFeeEscrow constant ESCROW = IPonsFeeEscrow(0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e);
    IPonsSweepOperator constant OPERATOR = IPonsSweepOperator(0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NATIVE = address(0);

    /// Recent pre-graduation launches found from TokenLaunched logs on 25 Nov 2026.
    address constant USDG_TOKEN = 0xB6AE0125a3a3feC85e51e55ed27d171bF74D21c1;
    address constant ETH_TOKEN = 0xd99ad830EB6aEB3B2cD72a0D62df6FBd2203d51A;
    /// Paired with other ERC-20s Pons allows: Robinhood stock tokens GME and ANT (18 decimals).
    address constant GME_PAIR_TOKEN = 0xF82fD0874c53C8aFA5A88C4a23d139359326015f;
    address constant ANT_PAIR_TOKEN = 0x0da42f41E04b83817B451606a3f961d9442e85A7;
    address constant GME = 0x1b0E319c6A659F002271B69dB8A7df2F911c153E;
    address constant ANT = 0xbbB6c29bCc3a1028A2B54310DF73F4F7A3bcB373;

    uint64 constant X_ID = 1234567890;

    bool forked;
    FeeFlow ff;
    uint256 creatorKey = 0xC0FFEE;
    uint256 attesterKey = 0xA77E57;
    address creator;
    address attester;
    address feeRecipient = makeAddr("feeRecipient");
    address claimTo = makeAddr("claimTo");
    uint256 nonce;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        uint256 blockNo = vm.envOr("FORK_BLOCK", uint256(0));
        if (blockNo == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, blockNo);
        forked = true;

        creator = vm.addr(creatorKey);
        attester = vm.addr(attesterKey);
        ff = new FeeFlow(
            address(FACTORY), address(ESCROW), feeRecipient, makeAddr("admin"), attester, 48 hours
        );
        console2.log("fork block", block.number, "chain", block.chainid);
    }

    modifier onlyFork() {
        if (!forked) vm.skip(true);
        _;
    }

    // ---------------------------------------------------------------- read-only checks

    function test_fork_interfacesDecode() public onlyFork {
        assertEq(block.chainid, 4663);
        LaunchedToken memory u = FACTORY.getLaunchedToken(USDG_TOKEN);
        LaunchedToken memory e = FACTORY.getLaunchedToken(ETH_TOKEN);
        assertTrue(u.exists && e.exists, "exists");
        assertEq(u.token, USDG_TOKEN);
        assertEq(u.pairToken, USDG, "USDG pair");
        assertEq(e.pairToken, NATIVE, "native ETH pair is address(0)");
        assertEq(IPonsCurve(u.curve).token(), USDG_TOKEN, "curve.token");
        assertEq(IPonsCurve(u.curve).pairToken(), USDG, "curve.pairToken");
        assertFalse(FACTORY.getLaunchedToken(makeAddr("random")).exists, "unknown token");

        FeePolicy memory p = FACTORY.getLaunchFeePolicy(USDG_TOKEN);
        console2.log("protocolFeeShareBps", p.protocolFeeShareBps);
        console2.log("buybackBurnBps", p.buybackBurnBps);
        console2.log("hookFeeBps", p.hookFeeBps);
        console2.log("maxInternalPriceImpactBps", p.maxInternalPriceImpactBps);
    }

    function test_fork_transferRequiresCurrentRecipient() public onlyFork {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(bytes4(keccak256("NotCreatorFeeRecipient()")));
        FACTORY.transferCreatorFeeRecipient(USDG_TOKEN, creator);
    }

    // ---------------------------------------------------------------- end to end

    function test_fork_usdgPair_endToEnd() public onlyFork {
        _endToEnd(USDG_TOKEN, 3000e6);
    }

    function test_fork_ethPair_endToEnd() public onlyFork {
        _endToEnd(ETH_TOKEN, 0.5 ether);
    }

    /// The Pons owner can redirect any token's creator fees after a 3-day notice. Fees already
    /// credited to the sink in the escrow are still collected and claimed through FeeFlow; fees
    /// accrued after the override go to the new recipient; an exit still closes the token in
    /// FeeFlow without touching Pons' recipient.
    function test_fork_ponsOwnerOverride() public onlyFork {
        IPonsFactoryOverride o = IPonsFactoryOverride(address(FACTORY));
        assertEq(o.CREATOR_FEE_RECIPIENT_TIMELOCK(), 3 days, "timelock");
        assertEq(o.CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW(), 3 days, "execution window");

        LaunchedToken memory lt = FACTORY.getLaunchedToken(USDG_TOKEN);
        tToken = USDG_TOKEN;
        tAsset = lt.pairToken;
        _stepRoute(lt.creatorFeeRecipient);
        _stepAccrue(lt.curve, 3000e6);
        uint256 escrowedBefore = _escrowed();

        address owner = IPonsOwnerOverride(address(FACTORY)).owner();
        address newRecipient = makeAddr("ponsOverrideRecipient");
        vm.prank(owner);
        IPonsOwnerOverride(address(FACTORY)).setCreatorFeeRecipient(tToken, newRecipient);
        (address to, uint256 effectiveAt, uint256 expiresAt) = o.pendingCreatorFeeRecipient(tToken);
        assertEq(to, newRecipient, "pending recipient readable");
        assertEq(effectiveAt, block.timestamp + 3 days, "effectiveAt");
        assertEq(expiresAt, effectiveAt + 3 days, "expiresAt");
        assertEq(FACTORY.getLaunchedToken(tToken).creatorFeeRecipient, tSink, "still the sink until executed");

        vm.warp(effectiveAt);
        vm.prank(makeAddr("anyone"));
        IPonsOwnerOverride(address(FACTORY)).executeCreatorFeeRecipientChange(tToken);
        assertEq(FACTORY.getLaunchedToken(tToken).creatorFeeRecipient, newRecipient, "redirected");
        (to,,) = o.pendingCreatorFeeRecipient(tToken);
        assertEq(to, address(0), "pending cleared");

        // Credited before the override: still FeeFlow's to collect and the X account's to claim.
        assertEq(_escrowed(), escrowedBefore, "escrow credit to the sink survives");
        _stepCollect();
        _stepClaim();

        // New fees go to the new recipient, not the sink.
        _buy(lt.curve, tAsset, 1000e6);
        _sweep(lt.curve);
        assertEq(_escrowed(), 0, "no new fees for the sink");

        // Exit still closes the token in FeeFlow; it leaves Pons' recipient alone (the sink no
        // longer controls it).
        vm.prank(creator);
        ff.exitByCreator(tToken, makeAddr("next"));
        assertTrue(ff.tokens(tToken).exited, "exited in FeeFlow");
        assertEq(FACTORY.getLaunchedToken(tToken).creatorFeeRecipient, newRecipient, "recipient untouched");
    }

    // State shared by the end-to-end steps (keeps each function under the stack limit).
    address tToken;
    address tAsset;
    address tSink;
    uint256 tNet;

    /// FeeFlow accepts any pair asset Pons allows; these prove it on two stock-token pairs.
    function test_fork_otherErc20Pair_gme_endToEnd() public onlyFork {
        assertEq(FACTORY.getLaunchedToken(GME_PAIR_TOKEN).pairToken, GME);
        _endToEnd(GME_PAIR_TOKEN, _fractionOfThreshold(GME_PAIR_TOKEN));
    }

    function test_fork_otherErc20Pair_ant_endToEnd() public onlyFork {
        assertEq(FACTORY.getLaunchedToken(ANT_PAIR_TOKEN).pairToken, ANT);
        _endToEnd(ANT_PAIR_TOKEN, _fractionOfThreshold(ANT_PAIR_TOKEN));
    }

    /// 40% of the graduation threshold: large enough to clear the sweep floor, small enough not to
    /// graduate the curve.
    function _fractionOfThreshold(address token) internal view returns (uint256) {
        return FACTORY.getLaunchedToken(token).graduationThreshold * 40 / 100;
    }

    function _endToEnd(address token, uint256 buyAmount) internal {
        LaunchedToken memory lt = FACTORY.getLaunchedToken(token);
        tToken = token;
        tAsset = lt.pairToken;
        _stepRoute(lt.creatorFeeRecipient);
        _stepAccrue(lt.curve, buyAmount);
        _stepCollect();
        _stepClaim();
        _stepExit();
    }

    /// Recipient -> test creator, register (tx 1/2), creator -> sink (tx 2/2).
    function _stepRoute(address currentRecipient) internal {
        vm.prank(currentRecipient);
        FACTORY.transferCreatorFeeRecipient(tToken, creator);
        assertEq(FACTORY.getLaunchedToken(tToken).creatorFeeRecipient, creator, "transfer is immediate");

        uint256 g = gasleft();
        tSink = _register(tToken);
        console2.log("gas registerToken", g - gasleft());
        assertEq(tSink, ff.predictSink(tToken), "sink at predicted address");

        vm.prank(creator);
        g = gasleft();
        FACTORY.transferCreatorFeeRecipient(tToken, tSink);
        console2.log("gas transferCreatorFeeRecipient", g - gasleft());
        assertEq(FACTORY.getLaunchedToken(tToken).creatorFeeRecipient, tSink);
    }

    /// Real trading generates fees; the sweep credits them to the escrow under the sink.
    function _stepAccrue(address curve, uint256 buyAmount) internal {
        _buy(curve, tAsset, buyAmount);
        uint256 g = gasleft();
        _sweep(curve);
        console2.log("gas sweep", g - gasleft());
        uint256 escrowed = _escrowed();
        console2.log("escrow balance of sink", escrowed);
        // ADR-001 open question: launch-token credits (buyback vest) to the sink in the escrow.
        console2.log("escrow launch-token balance of sink", ESCROW.balanceOfToken(tSink, tToken));
        console2.log("launch tokens held by sink", IERC20(tToken).balanceOf(tSink));
        assertGt(escrowed, 0, "fees credited to the sink in the escrow");
    }

    /// Sink claims from the escrow, FeeFlow takes 1% and credits a batch.
    function _stepCollect() internal {
        uint256 escrowed = _escrowed();
        uint256 g = gasleft();
        tNet = ff.collect(tToken);
        console2.log("gas collect", g - gasleft());
        uint256 gross = ff.totals(tAsset).collectedGross;
        assertEq(gross, escrowed, "collect pulls the whole escrow balance");
        assertEq(tNet, gross - gross / 100, "1% fee");
        assertEq(_escrowed(), 0, "escrow emptied");
    }

    function _stepClaim() internal {
        address[] memory list = new address[](1);
        list[0] = tToken;
        uint256 expiry = block.timestamp + 300;
        uint256 n = ++nonce;
        bytes memory att = _sign(keccak256(abi.encode(ff.CLAIM_TYPEHASH(), X_ID, claimTo, n, expiry)));
        uint256 before = _bal(tAsset, claimTo);
        uint256 g = gasleft();
        ff.claim(X_ID, list, claimTo, expiry, n, att);
        console2.log("gas claim (1 token)", g - gasleft());
        assertEq(_bal(tAsset, claimTo) - before, tNet, "claimed net amount");
    }

    function _stepExit() internal {
        address next = makeAddr("nextRecipient");
        vm.prank(creator);
        uint256 g = gasleft();
        ff.exitByCreator(tToken, next);
        console2.log("gas exitByCreator", g - gasleft());
        assertEq(FACTORY.getLaunchedToken(tToken).creatorFeeRecipient, next, "exit moved the Pons recipient");
    }

    function _escrowed() internal view returns (uint256) {
        return tAsset == NATIVE ? ESCROW.balanceOf(tSink) : ESCROW.balanceOfToken(tSink, tAsset);
    }

    // ---------------------------------------------------------------- helpers

    function _register(address token) internal returns (address sink) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory creatorSig =
            _signWith(creatorKey, keccak256(abi.encode(ff.ROUTE_TYPEHASH(), token, X_ID, deadline)));
        uint256 n = ++nonce;
        uint256 expiry = block.timestamp + 300;
        bytes memory att = _sign(keccak256(abi.encode(ff.REGISTER_TYPEHASH(), token, X_ID, n, expiry)));
        FeeFlow.RegisterParams memory p = FeeFlow.RegisterParams({
            token: token, xUserId: X_ID, creator: creator, creatorDeadline: deadline, nonce: n, expiry: expiry
        });
        ff.registerToken(p, creatorSig, att);
        sink = ff.tokens(token).sink;
    }

    function _buy(address curve, address asset, uint256 amount) internal {
        address buyer = makeAddr("buyer");
        if (asset == NATIVE) {
            vm.deal(buyer, amount);
            vm.prank(buyer);
            IPonsCurve(curve).buy{value: amount}(amount, 0, buyer);
        } else {
            deal(asset, buyer, amount);
            vm.startPrank(buyer);
            IERC20(asset).approve(curve, amount);
            IPonsCurve(curve).buy(amount, 0, buyer);
            vm.stopPrank();
        }
    }

    /// curve.sweepFees is operator-only on the live stack (reverts 0x8d42130c), so sweeps go
    /// through the public sweep operator. If it refuses right after a trade, wait and retry once.
    function _sweep(address curve) internal {
        try OPERATOR.sweepCurve(curve) {
            console2.log("swept via operator.sweepCurve");
            return;
        } catch (bytes memory err) {
            console2.log("operator.sweepCurve reverted:");
            console2.logBytes(err);
        }
        uint256 waitSeconds = vm.envOr("FORK_SWEEP_WAIT", uint256(1 hours));
        vm.warp(block.timestamp + waitSeconds);
        vm.roll(block.number + waitSeconds / 12);
        OPERATOR.sweepCurve(curve);
        console2.log("swept via operator.sweepCurve after waiting (s)", waitSeconds);
    }

    function _bal(address asset, address who) internal view returns (uint256) {
        return asset == NATIVE ? who.balance : IERC20(asset).balanceOf(who);
    }

    function _sign(bytes32 structHash) internal view returns (bytes memory) {
        return _signWith(attesterKey, structHash);
    }

    function _signWith(uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ff.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
