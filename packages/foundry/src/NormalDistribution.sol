// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { UD60x18 } from "prb-math/UD60x18.sol";
import { SD59x18 } from "prb-math/SD59x18.sol";
import { PI, UNIT } from "prb-math/ud60x18/Constants.sol";

library NormalDistribution {
    UD60x18 internal constant TWO = UD60x18.wrap(2e18);
    SD59x18 internal constant NEG_HALF = SD59x18.wrap(-5e17);

    function pdf(int256 x, int256 mu, uint256 sigma) internal pure returns (uint256) {
        // forge-lint: disable-next-line unsafe-typecast
        SD59x18 z = (SD59x18.wrap(x) - SD59x18.wrap(mu)) / SD59x18.wrap(int256(sigma));
        SD59x18 exponent = NEG_HALF * (z * z);
        uint256 expVal = uint256(exponent.exp().unwrap());

        UD60x18 sigmaUD = UD60x18.wrap(sigma);
        UD60x18 sqrt2pi = (TWO * PI).sqrt();
        UD60x18 coeff = UNIT / (sigmaUD * sqrt2pi);

        return (coeff * UD60x18.wrap(expVal)).unwrap();
    }

    function l2Norm(uint256 sigma) internal pure returns (uint256) {
        UD60x18 sigmaUD = UD60x18.wrap(sigma);
        UD60x18 sqrtPi = PI.sqrt();
        UD60x18 inner = TWO * sigmaUD * sqrtPi;
        UD60x18 denominator = inner.sqrt();
        return (UNIT / denominator).unwrap();
    }

    function computeLambda(uint256 k, uint256 sigma) internal pure returns (uint256) {
        UD60x18 kUD = UD60x18.wrap(k);
        UD60x18 l2 = UD60x18.wrap(l2Norm(sigma));
        return (kUD / l2).unwrap();
    }

    function scaledPDF(int256 x, int256 mu, uint256 sigma, uint256 k) internal pure returns (uint256) {
        uint256 lam = computeLambda(k, sigma);
        uint256 p = pdf(x, mu, sigma);
        return (UD60x18.wrap(lam) * UD60x18.wrap(p)).unwrap();
    }

    function sigmaMin(uint256 k, uint256 b) internal pure returns (uint256) {
        UD60x18 kUD = UD60x18.wrap(k);
        UD60x18 bUD = UD60x18.wrap(b);
        UD60x18 sqrtPi = PI.sqrt();
        UD60x18 numerator = kUD * kUD;
        UD60x18 denominator = bUD * bUD * sqrtPi;
        return (numerator / denominator).unwrap();
    }

    function computeKFromGaussian(uint256 b, uint256 sigma) internal pure returns (uint256) {
        UD60x18 bUD = UD60x18.wrap(b);
        UD60x18 sigmaUD = UD60x18.wrap(sigma);
        UD60x18 sqrt2pi = (TWO * PI).sqrt();
        UD60x18 lam = bUD * sigmaUD * sqrt2pi;
        UD60x18 l2 = UD60x18.wrap(l2Norm(sigma));
        return (lam * l2).unwrap();
    }
}
