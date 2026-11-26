// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BaseTest} from "./Base.t.sol";

/// Plain 18-decimal ERC-20, like the Robinhood stock tokens Pons allows as pair assets.
contract MockStockToken is ERC20 {
    constructor() ERC20("GameStop", "GME") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Takes 1% of every transfer (not mints). Pons allows any ERC-20 pair, so FeeFlow must stay
/// solvent even when the pair asset behaves like this.
contract MockFeeOnTransfer is ERC20 {
    constructor() ERC20("Taxed", "TAX") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 tax = value / 100;
        super._update(from, address(0xdead), tax);
        super._update(from, to, value - tax);
    }
}

/// FeeFlow accepts any pair asset Pons allows. Accounting is per asset and by balance delta.
contract PairAssetsTest is BaseTest {
    MockStockToken gme;
    MockFeeOnTransfer taxed;
    address tokenGme = makeAddr("tokenGme");
    address tokenTaxed = makeAddr("tokenTaxed");

    function setUp() public override {
        super.setUp();
        gme = new MockStockToken();
        taxed = new MockFeeOnTransfer();
        factory.launch(tokenGme, creator, creator, address(gme));
        factory.launch(tokenTaxed, creator, creator, address(taxed));
    }

    function _accrue(ERC20 asset, address sink, uint256 amount) internal {
        if (address(asset) == address(gme)) gme.mint(address(this), amount);
        else taxed.mint(address(this), amount);
        asset.approve(address(escrow), amount);
        escrow.creditToken(sink, address(asset), amount);
    }

    function test_otherErc20Pair_registersCollectsAndClaims() public {
        address sink = _route(tokenGme, X_ID);
        assertEq(ff.tokens(tokenGme).asset, address(gme), "asset is the Pons pair token");

        _accrue(gme, sink, 50e18);
        uint256 net = ff.collect(tokenGme);
        assertEq(net, 49.5e18, "1% fee in the pair asset");
        assertEq(ff.totals(address(gme)).credited, 49.5e18);
        assertEq(ff.totals(address(usdg)).credited, 0, "assets never mix");

        address to = makeAddr("to");
        _claim(X_ID, _list(tokenGme), to);
        assertEq(gme.balanceOf(to), 49.5e18);
    }

    function test_claimAcrossThreeAssets_paysEachAssetOnce() public {
        address sinkU = _route(tokenUsdg, X_ID);
        address sinkE = _route(tokenEth, X_ID);
        address sinkG = _route(tokenGme, X_ID);
        _accrueUsdg(sinkU, 100e6);
        _accrueEth(sinkE, 1 ether);
        _accrue(gme, sinkG, 10e18);
        ff.collect(tokenUsdg);
        ff.collect(tokenEth);
        ff.collect(tokenGme);

        address[] memory list = new address[](3);
        list[0] = tokenUsdg;
        list[1] = tokenEth;
        list[2] = tokenGme;
        address to = makeAddr("to3");
        _claim(X_ID, list, to);
        assertEq(usdg.balanceOf(to), 99e6);
        assertEq(to.balance, 0.99 ether);
        assertEq(gme.balanceOf(to), 9.9e18);
    }

    function test_feeOnTransferPair_creditsOnlyWhatArrived_andStaysSolvent() public {
        address sink = _route(tokenTaxed, X_ID);
        _accrue(taxed, sink, 100e18);
        // The mock escrow records 100 but receives 99 after the tax; top it up so this test isolates
        // FeeFlow's behaviour (how the real Pons escrow handles taxed tokens is Pons' concern).
        taxed.mint(address(escrow), 1e18);

        uint256 net = ff.collect(tokenTaxed);
        // escrow -> sink loses 1%, sink -> FeeFlow loses 1%: FeeFlow measures what actually arrived.
        uint256 arrived = ff.totals(address(taxed)).collectedGross;
        assertEq(arrived, taxed.balanceOf(address(ff)), "gross is the real balance delta");
        assertEq(net, arrived - arrived / 100);

        address to = makeAddr("taxedTo");
        _claim(X_ID, _list(tokenTaxed), to);
        assertEq(taxed.balanceOf(to), net - net / 100, "recipient bears the token's own transfer tax");

        // What remains covers exactly the accrued FeeFlow fees; nothing owed is unbacked.
        assertEq(taxed.balanceOf(address(ff)), ff.accruedFees(address(taxed)));
        ff.withdrawFees(address(taxed));
        assertEq(taxed.balanceOf(address(ff)), 0);
    }
}
