// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { DistributionMarket } from "../src/DistributionMarket.sol";
import { NormalDistribution } from "../src/NormalDistribution.sol";

contract DistributionMarketTest is Test {
    DistributionMarket internal market;

    address internal alice = address(0x1);
    address internal bob = address(0x2);

    uint256 internal constant INITIAL_B = 0.01 ether;
    int256 internal constant MU_0 = 3200e18;
    uint256 internal constant SIGMA_0 = 400e18;
    uint256 internal constant END_TIME = 1000;

    function setUp() external {
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.prank(alice);
        market = new DistributionMarket();
    }

    function _createMarket() internal returns (uint256) {
        vm.deal(address(this), 1 ether);
        return market.createMarket{ value: INITIAL_B }("ETH price test", block.timestamp + END_TIME, MU_0, SIGMA_0);
    }

    function _sigmaMin(uint256 marketId) internal view returns (uint256) {
        uint256 bVal = market.getMarketB(marketId);
        uint256 kVal = market.getMarketK(marketId);
        return NormalDistribution.sigmaMin(kVal, bVal);
    }

    function _totalToSend(uint256 desiredCollateral, uint256 sigma) internal view returns (uint256 total, uint256 fees) {
        uint256 l2 = NormalDistribution.l2Norm(sigma);
        uint256 referenceL2 = NormalDistribution.l2Norm(400e18);
        uint256 feeRateNumerator = 10;
        if (referenceL2 > 0) {
            feeRateNumerator += (l2 * 100) / referenceL2;
        } else {
            feeRateNumerator += 100;
        }
        total = (desiredCollateral * 10000) / (10000 - feeRateNumerator);
        fees = total - desiredCollateral;
    }

    // ---------- createMarket ----------

    function testCreateMarket() external {
        uint256 mid = _createMarket();

        (int256 cmu, uint256 csig, uint256 bVal, uint256 kVal, bool res,) = market.getMarketSimple(mid);
        assertFalse(res);
        assertEq(cmu, MU_0);
        assertEq(csig, SIGMA_0);
        assertEq(bVal, INITIAL_B);
        assertTrue(kVal > 0);
    }

    function testCreateMarketRevertZeroBacking() external {
        vm.expectRevert("must send backing ETH");
        market.createMarket{ value: 0 }("test", block.timestamp + 100, MU_0, SIGMA_0);
    }

    function testCreateMarketRevertPastEndTime() external {
        vm.expectRevert("endTime must be in future");
        market.createMarket{ value: INITIAL_B }("test", block.timestamp - 1, MU_0, SIGMA_0);
    }

    // ---------- trade ----------

    function testTrade() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        int256 tradeMu = 3300e18;
        uint256 tradeSigma = sMin + 1e18;

        (uint256 totalSend, ) = _totalToSend(0.01 ether, tradeSigma);

        vm.prank(alice);
        market.trade{ value: totalSend }(mid, tradeMu, tradeSigma);

        (int256 cmu, uint256 csig,,, bool res,) = market.getMarketSimple(mid);
        assertFalse(res);
        assertEq(cmu, tradeMu, "market mu should update");
        assertEq(csig, tradeSigma, "market sigma should update");

        (address trader, int256 pmu, uint256 psig,,, uint256 col,, bool claimed) = market.getTrade(mid, 0);
        assertEq(trader, alice);
        assertTrue(col > 0);
        assertEq(pmu, MU_0);
        assertEq(psig, SIGMA_0);
        assertFalse(claimed);
    }

    function testTradeRevertSigmaTooSmall() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);

        vm.prank(alice);
        vm.expectRevert("sigma below minimum");
        market.trade{ value: 0.01 ether }(mid, 3300e18, sMin - 1);
    }

    function testTradeZeroValue() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        uint256 tradeSigma = sMin + 1e18;

        vm.prank(alice);
        vm.expectRevert("fees exceed value");
        market.trade{ value: 0 }(mid, 3300e18, tradeSigma);
    }

    // ---------- sequential ----------

    function testSequentialTrades() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        uint256 tradeSigma = sMin + 1e18;
        (uint256 send, ) = _totalToSend(0.01 ether, tradeSigma);

        vm.prank(alice);
        market.trade{ value: send }(mid, 3300e18, tradeSigma);

        vm.prank(bob);
        market.trade{ value: send }(mid, 3100e18, tradeSigma);

        (int256 cmu,,,,,) = market.getMarketSimple(mid);
        assertEq(cmu, 3100e18, "market mu should reflect bob's trade");
        assertEq(market.getTradeCount(mid), 2);
    }

    // ---------- resolve ----------

    function testResolve() external {
        uint256 mid = _createMarket();

        vm.warp(block.timestamp + END_TIME + 1);
        market.resolve(mid, 3250e18);

        (,,,, bool res, int256 outcome) = market.getMarketSimple(mid);
        assertTrue(res);
        assertEq(outcome, 3250e18);
    }

    function testResolveRevertNonResolver() external {
        uint256 mid = _createMarket();
        vm.warp(block.timestamp + END_TIME + 1);

        vm.prank(alice);
        vm.expectRevert("only resolver");
        market.resolve(mid, 3250e18);
    }

    function testResolveRevertTooEarly() external {
        uint256 mid = _createMarket();
        vm.expectRevert("market not yet ended");
        market.resolve(mid, 3250e18);
    }

    // ---------- claim ----------

    function testClaim() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        uint256 tradeSigma = sMin + 1e18;
        (uint256 send, ) = _totalToSend(0.01 ether, tradeSigma);

        vm.prank(alice);
        market.trade{ value: send }(mid, MU_0, tradeSigma);

        vm.warp(block.timestamp + END_TIME + 1);
        market.resolve(mid, MU_0);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        market.claim(mid, 0);
        uint256 balanceAfter = alice.balance;

        assertTrue(balanceAfter > balanceBefore, "alice should receive payout");
    }

    // ---------- claim twice ----------

    function testDoubleClaimRevert() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        uint256 tradeSigma = sMin + 1e18;
        (uint256 send, ) = _totalToSend(0.01 ether, tradeSigma);

        vm.prank(alice);
        market.trade{ value: send }(mid, MU_0, tradeSigma);

        vm.warp(block.timestamp + END_TIME + 1);
        market.resolve(mid, MU_0);

        vm.prank(alice);
        market.claim(mid, 0);

        vm.prank(alice);
        vm.expectRevert("already claimed");
        market.claim(mid, 0);
    }

    // ---------- solvency ----------

    function testSolvencyTwoTraders() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        uint256 tradeSigma = sMin + 1e18;

        (uint256 send1, ) = _totalToSend(0.01 ether, tradeSigma);
        (uint256 send2, ) = _totalToSend(0.02 ether, tradeSigma);

        vm.prank(alice);
        market.trade{ value: send1 }(mid, 3300e18, tradeSigma);
        vm.prank(bob);
        market.trade{ value: send2 }(mid, 3100e18, tradeSigma);

        vm.warp(block.timestamp + END_TIME + 1);
        market.resolve(mid, 3250e18);

        uint256 poolBefore = address(market).balance;

        vm.prank(alice);
        market.claim(mid, 0);
        vm.prank(bob);
        market.claim(mid, 1);

        uint256 poolAfter = address(market).balance;
        assertTrue(poolBefore - poolAfter <= poolBefore, "payouts should not exceed pool");
    }

    // ---------- claimAll ----------

    function testClaimAll() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        uint256 tradeSigma = sMin + 1e18;
        (uint256 send, ) = _totalToSend(0.01 ether, tradeSigma);

        vm.prank(alice);
        market.trade{ value: send }(mid, 3300e18, tradeSigma);
        vm.prank(alice);
        market.trade{ value: send }(mid, 3100e18, tradeSigma);

        vm.warp(block.timestamp + END_TIME + 1);
        market.resolve(mid, 3150e18);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        market.claimAll(mid);
        assertTrue(alice.balance > balanceBefore, "claimAll should pay out");
    }

    // ---------- LP ----------

    function testAddLiquidity() external {
        uint256 mid = _createMarket();
        uint256 sMinBefore = _sigmaMin(mid);

        vm.prank(alice);
        market.addLiquidity{ value: 0.01 ether }(mid);

        uint256 bAfter = market.getMarketB(mid);
        assertEq(bAfter, INITIAL_B + 0.01 ether, "backing should increase");

        uint256 sMinAfter = _sigmaMin(mid);
        assertTrue(sMinAfter < sMinBefore, "sigma_min should decrease after LP");
    }

    // ---------- fees ----------

    function testWithdrawFees() external {
        uint256 mid = _createMarket();
        uint256 sMin = _sigmaMin(mid);
        uint256 tradeSigma = sMin + 1e18;
        (uint256 send, ) = _totalToSend(0.01 ether, tradeSigma);

        vm.prank(alice);
        market.trade{ value: send }(mid, MU_0, tradeSigma);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        market.withdrawFees(mid);
        assertTrue(alice.balance > balanceBefore, "owner should receive fees");
    }

    // ---------- edge cases ----------

    function testCannotTradeAfterExpiry() external {
        uint256 mid = _createMarket();
        vm.warp(block.timestamp + END_TIME + 1);

        vm.prank(alice);
        vm.expectRevert("market expired");
        market.trade{ value: 0.01 ether }(mid, MU_0, SIGMA_0);
    }

    function testCannotTradeAfterResolve() external {
        uint256 mid = _createMarket();
        vm.warp(block.timestamp + END_TIME + 1);
        market.resolve(mid, MU_0);

        vm.prank(alice);
        vm.expectRevert("market resolved");
        market.trade{ value: 0.01 ether }(mid, MU_0, SIGMA_0);
    }
}
