// SPDX-License-Identifier: MIT
// forge-lint-disable unsafe-typecast
pragma solidity ^0.8.20;

import { NormalDistribution } from "./NormalDistribution.sol";

contract DistributionMarket {
    uint256 public constant BASE_FEE_BPS = 10;
    uint256 public constant L2_FEE_BPS = 100;
    uint256 public constant REFERENCE_SIGMA = 400e18;
    uint256 public constant MAX_PAYOUT_MULTIPLIER = 10;

    address public owner;

    uint256 public marketCount;

    struct TradeEntry {
        address trader;
        int256 prevMu;
        uint256 prevSigma;
        int256 tradeMu;
        uint256 tradeSigma;
        uint256 collateral;
        uint256 feePaid;
        bool claimed;
    }

    struct Market {
        string question;
        uint256 endTime;
        bool resolved;
        int256 outcome;
        int256 initialMu;
        uint256 initialSigma;
        int256 currentMu;
        uint256 currentSigma;
        uint256 b;
        uint256 k;
        address resolver;
        uint256 accumulatedFees;
        TradeEntry[] tradeLog;
        mapping(address => uint256[]) traderToTrades;
        uint256 traderCount;
    }

    mapping(uint256 => Market) internal markets;

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime, int256 mu, uint256 sigma, uint256 b);
    event TradeExecuted(uint256 indexed marketId, address indexed trader, uint256 tradeIndex, int256 mu, uint256 sigma, uint256 collateral, uint256 fee);
    event MarketResolved(uint256 indexed marketId, int256 outcome);
    event PayoutClaimed(uint256 indexed marketId, address indexed trader, uint256 amount);
    event LiquidityAdded(uint256 indexed marketId, address indexed lp, uint256 amount, uint256 newB);
    event FeesWithdrawn(uint256 indexed marketId, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyResolver(uint256 marketId) {
        require(msg.sender == markets[marketId].resolver, "only resolver");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createMarket(
        string calldata question,
        uint256 endTime,
        int256 mu,
        uint256 sigma
    ) external payable returns (uint256 marketId) {
        require(endTime > block.timestamp, "endTime must be in future");
        require(sigma > 0, "sigma must be > 0");
        require(msg.value > 0, "must send backing ETH");

        marketId = ++marketCount;
        Market storage m = markets[marketId];
        m.question = question;
        m.endTime = endTime;
        m.initialMu = mu;
        m.initialSigma = sigma;
        m.currentMu = mu;
        m.currentSigma = sigma;
        m.b = msg.value;
        m.k = NormalDistribution.computeKFromGaussian(msg.value, sigma);
        m.resolver = msg.sender;

        emit MarketCreated(marketId, question, endTime, mu, sigma, msg.value);
    }

    function trade(
        uint256 marketId,
        int256 mu,
        uint256 sigma
    ) external payable {
        Market storage m = markets[marketId];
        require(!m.resolved, "market resolved");
        require(block.timestamp < m.endTime, "market expired");
        require(sigma > 0, "sigma must be > 0");

        uint256 sigmaMinVal = NormalDistribution.sigmaMin(m.k, m.b);
        require(sigma >= sigmaMinVal, "sigma below minimum");

        uint256 l2 = NormalDistribution.l2Norm(sigma);
        uint256 referenceL2 = NormalDistribution.l2Norm(REFERENCE_SIGMA);

        uint256 baseFee = (msg.value * BASE_FEE_BPS) / 10000;
        uint256 l2Fee;
        if (referenceL2 > 0) {
            l2Fee = (msg.value * l2 * L2_FEE_BPS) / (referenceL2 * 10000);
        } else {
            l2Fee = (msg.value * L2_FEE_BPS) / 10000;
        }
        uint256 totalFee = baseFee + l2Fee;
        require(msg.value > totalFee, "fees exceed value");

        uint256 collateral = msg.value - totalFee;

        uint256 tradeIndex = m.tradeLog.length;
        m.tradeLog.push(TradeEntry({
            trader: msg.sender,
            prevMu: m.currentMu,
            prevSigma: m.currentSigma,
            tradeMu: mu,
            tradeSigma: sigma,
            collateral: collateral,
            feePaid: totalFee,
            claimed: false
        }));
        m.traderToTrades[msg.sender].push(tradeIndex);
        if (m.traderToTrades[msg.sender].length == 1) {
            m.traderCount++;
        }
        m.currentMu = mu;
        m.currentSigma = sigma;
        m.accumulatedFees += totalFee;

        emit TradeExecuted(marketId, msg.sender, tradeIndex, mu, sigma, collateral, totalFee);
    }

    function resolve(uint256 marketId, int256 outcome) external onlyResolver(marketId) {
        Market storage m = markets[marketId];
        require(!m.resolved, "already resolved");
        require(block.timestamp >= m.endTime, "market not yet ended");

        m.outcome = outcome;
        m.resolved = true;

        emit MarketResolved(marketId, outcome);
    }

    function claim(uint256 marketId, uint256 tradeIndex) external {
        Market storage m = markets[marketId];
        require(m.resolved, "not resolved");

        TradeEntry storage t = m.tradeLog[tradeIndex];
        require(t.trader == msg.sender, "not your trade");
        require(!t.claimed, "already claimed");

        t.claimed = true;

        uint256 prevScaled = NormalDistribution.scaledPDF(m.outcome, t.prevMu, t.prevSigma, m.k);
        uint256 tradeScaled = NormalDistribution.scaledPDF(m.outcome, t.tradeMu, t.tradeSigma, m.k);

        int256 pnl;
        if (tradeScaled >= prevScaled) {
            pnl = int256(tradeScaled - prevScaled);
        } else {
            pnl = -int256(prevScaled - tradeScaled);
        }

        uint256 rawPayout;
        if (pnl >= 0) {
            rawPayout = t.collateral + uint256(pnl);
        } else {
            uint256 absLoss = uint256(-pnl);
            if (absLoss >= t.collateral) {
                rawPayout = 0;
            } else {
                rawPayout = t.collateral - absLoss;
            }
        }

        uint256 maxPayout = t.collateral * MAX_PAYOUT_MULTIPLIER;
        uint256 payout = rawPayout > maxPayout ? maxPayout : rawPayout;

        require(address(this).balance >= payout, "insufficient contract balance");

        (bool sent, ) = payable(msg.sender).call{ value: payout }("");
        require(sent, "payout failed");

        emit PayoutClaimed(marketId, msg.sender, payout);
    }

    function claimAll(uint256 marketId) external {
        Market storage m = markets[marketId];
        require(m.resolved, "not resolved");

        uint256[] storage indices = m.traderToTrades[msg.sender];
        for (uint256 i = 0; i < indices.length; i++) {
            TradeEntry storage t = m.tradeLog[indices[i]];
            if (!t.claimed && t.trader == msg.sender) {
                t.claimed = true;

                uint256 prevScaled = NormalDistribution.scaledPDF(m.outcome, t.prevMu, t.prevSigma, m.k);
                uint256 tradeScaled = NormalDistribution.scaledPDF(m.outcome, t.tradeMu, t.tradeSigma, m.k);

                int256 pnl;
                if (tradeScaled >= prevScaled) {
                    pnl = int256(tradeScaled - prevScaled);
                } else {
                    pnl = -int256(prevScaled - tradeScaled);
                }

                uint256 rawPayout;
                if (pnl >= 0) {
                    rawPayout = t.collateral + uint256(pnl);
                } else {
                    uint256 absLoss = uint256(-pnl);
                    if (absLoss >= t.collateral) {
                        rawPayout = 0;
                    } else {
                        rawPayout = t.collateral - absLoss;
                    }
                }

                uint256 maxPayout = t.collateral * MAX_PAYOUT_MULTIPLIER;
                uint256 payout = rawPayout > maxPayout ? maxPayout : rawPayout;

                if (address(this).balance >= payout) {
                    (bool sent, ) = payable(msg.sender).call{ value: payout }("");
                    if (sent) {
                        emit PayoutClaimed(marketId, msg.sender, payout);
                    }
                }
            }
        }
    }

    function addLiquidity(uint256 marketId) external payable {
        Market storage m = markets[marketId];
        require(!m.resolved, "market resolved");
        require(msg.value > 0, "must send ETH");

        m.b += msg.value;

        emit LiquidityAdded(marketId, msg.sender, msg.value, m.b);
    }

    function withdrawFees(uint256 marketId) external onlyOwner {
        Market storage m = markets[marketId];
        uint256 amount = m.accumulatedFees;
        require(amount > 0, "no fees");
        m.accumulatedFees = 0;
        (bool sent, ) = payable(owner).call{ value: amount }("");
        require(sent, "fee withdrawal failed");
        emit FeesWithdrawn(marketId, amount);
    }

    function getMarketSimple(uint256 marketId) external view returns (
        int256 currentMu,
        uint256 currentSigma,
        uint256 b,
        uint256 k,
        bool resolved,
        int256 outcome,
        int256 initialMu,
        uint256 initialSigma
    ) {
        Market storage m = markets[marketId];
        return (m.currentMu, m.currentSigma, m.b, m.k, m.resolved, m.outcome, m.initialMu, m.initialSigma);
    }

    function getMarketB(uint256 marketId) external view returns (uint256) {
        return markets[marketId].b;
    }

    function getMarketK(uint256 marketId) external view returns (uint256) {
        return markets[marketId].k;
    }

    function getMarket(uint256 marketId) external view returns (
        string memory question,
        uint256 endTime,
        bool resolved,
        int256 outcome,
        int256 currentMu,
        uint256 currentSigma,
        uint256 b,
        uint256 k,
        address resolver,
        uint256 accumulatedFees,
        uint256 tradeCount
    ) {
        Market storage m = markets[marketId];
        return (
            m.question,
            m.endTime,
            m.resolved,
            m.outcome,
            m.currentMu,
            m.currentSigma,
            m.b,
            m.k,
            m.resolver,
            m.accumulatedFees,
            m.tradeLog.length
        );
    }

    function getTrade(uint256 marketId, uint256 tradeIndex) external view returns (
        address trader,
        int256 prevMu,
        uint256 prevSigma,
        int256 tradeMu,
        uint256 tradeSigma,
        uint256 collateral,
        uint256 feePaid,
        bool claimed
    ) {
        TradeEntry storage t = markets[marketId].tradeLog[tradeIndex];
        return (
            t.trader,
            t.prevMu,
            t.prevSigma,
            t.tradeMu,
            t.tradeSigma,
            t.collateral,
            t.feePaid,
            t.claimed
        );
    }

    function getTraderTrades(uint256 marketId, address trader) external view returns (uint256[] memory) {
        return markets[marketId].traderToTrades[trader];
    }

    function getTradeCount(uint256 marketId) external view returns (uint256) {
        return markets[marketId].tradeLog.length;
    }

    receive() external payable { }
}
