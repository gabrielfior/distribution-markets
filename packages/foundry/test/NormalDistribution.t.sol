// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { NormalDistribution } from "../src/NormalDistribution.sol";

contract NormalDistributionTest is Test {
    uint256 internal constant SQRT2PI_RAW = 2_506628274631000200;
    uint256 internal constant SQRT_PI_RAW = 1_772453850905516027;

    function testPDFAtMean() external {
        int256 mu = 3200e18;
        uint256 sigma = 400e18;

        uint256 p = NormalDistribution.pdf(mu, mu, sigma);
        uint256 expected = 1e54 / (sigma * SQRT2PI_RAW);
        assertApproxEqRel(p, expected, 1e16, "PDF at mean should match analytical value");
    }

    function testPDFDecreasesWithDistance() external {
        int256 mu = 3200e18;
        uint256 sigma = 400e18;

        uint256 pAtMu = NormalDistribution.pdf(mu, mu, sigma);
        uint256 pAtMuPlusSigma = NormalDistribution.pdf(mu + int256(sigma), mu, sigma);
        uint256 pAtMuPlus2Sigma = NormalDistribution.pdf(mu + int256(sigma * 2), mu, sigma);

        assertTrue(pAtMu > pAtMuPlusSigma, "PDF at mu should be > PDF at mu+sigma");
        assertTrue(pAtMuPlusSigma > pAtMuPlus2Sigma, "PDF at mu+sigma should be > PDF at mu+2sigma");
    }

    function testPDFSymmetry() external {
        int256 mu = 3200e18;
        uint256 sigma = 400e18;
        int256 offset = 200e18;

        uint256 pPos = NormalDistribution.pdf(mu + offset, mu, sigma);
        uint256 pNeg = NormalDistribution.pdf(mu - offset, mu, sigma);

        assertApproxEqRel(pPos, pNeg, 1e15, "PDF should be symmetric around mu");
    }

    function testL2NormInverse() external {
        uint256 sigma1 = 400e18;
        uint256 sigma2 = 800e18;

        uint256 l2_1 = NormalDistribution.l2Norm(sigma1);
        uint256 l2_2 = NormalDistribution.l2Norm(sigma2);

        assertTrue(l2_1 > l2_2, "Narrower sigma should have higher L2 norm");
    }

    function testL2NormReasonableRange() external {
        uint256 sigma = 400e18;
        uint256 l2 = NormalDistribution.l2Norm(sigma);
        assertTrue(l2 > 0, "L2 norm should be positive");
        assertTrue(l2 < 1e18, "L2 norm should be < 1 (for sigma=400)");
    }

    function testSigmaMin() external {
        uint256 k = 10e18;
        uint256 b = 100e18;

        uint256 sMin = NormalDistribution.sigmaMin(k, b);
        uint256 expected = 1e54 / (b * b * SQRT_PI_RAW / 1e18) * (k * k / 1e18) / 1e18;
        assertApproxEqRel(sMin, expected, 1e17, "sigma_min should match formula");
    }

    function testComputeKFromGaussian() external {
        uint256 b = 100e18;
        uint256 sigma = 400e18;

        uint256 k = NormalDistribution.computeKFromGaussian(b, sigma);
        assertTrue(k > 0, "k should be positive");

        uint256 sMin = NormalDistribution.sigmaMin(k, b);
        assertTrue(sigma >= sMin, "initial sigma should be >= sigma_min");
    }

    function testScaledPDFAtCenter() external {
        int256 mu = 3200e18;
        uint256 sigma = 400e18;
        uint256 b = 100e18;
        uint256 k = NormalDistribution.computeKFromGaussian(b, sigma);

        uint256 scaled = NormalDistribution.scaledPDF(mu, mu, sigma, k);
        assertApproxEqRel(scaled, b, 1e16, "scaled PDF at mu should approximate backing b");
    }

    function testScaledPDFNeverOverB() external {
        int256 mu = 3200e18;
        uint256 sigma = 400e18;
        uint256 b = 100e18;
        uint256 k = NormalDistribution.computeKFromGaussian(b, sigma);

        for (int256 i = -5; i <= 5; i++) {
            int256 x = mu + i * int256(sigma) / 2;
            uint256 scaled = NormalDistribution.scaledPDF(x, mu, sigma, k);
            assertTrue(scaled <= b * 1005 / 1000, string.concat("scaled PDF at offset ", vm.toString(i), " exceeds b"));
        }
    }
}
