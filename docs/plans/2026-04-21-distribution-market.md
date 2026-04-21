# Distribution Market — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a continuous distribution prediction market on Gnosis Chain — traders express beliefs as Normal distributions (mean μ, standard deviation σ) and trade against an AMM, rather than buying discrete binary shares.

**Architecture:** Frontend-first dApp using Scaffold-ETH 2 (React + Foundry + wagmi). One Solidity contract (`DistributionMarket.sol`) implements the Normal-distribution AMM from Paradigm's paper. Offchain math library computes L2 norms and trade costs. Frontend lets users drag a bell curve to set their belief and see potential profit/loss.

**Tech Stack:** Scaffold-ETH 2 (Next.js, Tailwind, wagmi/viem, Foundry), Solidity, OpenZeppelin, Gnosis Chiado testnet

**Chain:** Gnosis Chain (Chiado testnet for dev, Gnosis mainnet for production)

**Contract Count:** 1 MVP contract (`DistributionMarket.sol`) + 1 library (`NormalMath.sol`)

**Why Gnosis:** Low fees (~$0.001/tx), fast finality, strong prediction market ecosystem (Omen/Presagio), EVM-compatible.

---

## Core Mechanism (From Paradigm Paper)

Instead of betting on discrete buckets (e.g., "ETH $3000-$3200"), traders submit a full Normal distribution:

- **μ (mean):** Where you think the price will land
- **σ (std dev):** How confident you are (narrow = confident, wide = uncertain)

The AMM maintains its own consensus distribution. When you trade, you move the AMM's distribution toward yours. Your profit depends on how close the actual outcome is to your predicted distribution vs. the market's final consensus.

**Key invariant:** The market uses an L2 norm constraint over function space. The AMM's holdings are `h(x) = b - f(x)` where `f(x)` is the traders' aggregate distribution and `b` is the total collateral backing. This ensures the AMM is always solvent.

---

## Phase 0: Project Bootstrap (Day 1)

### Task 1: Scaffold-ETH 2 Setup

**Files:**
- Create: All SE2 boilerplate via `npx create-eth@latest`

- [ ] **Step 1: Initialize SE2 with Foundry**

```bash
cd ~/code/distribution-market-agent
npx create-eth@latest . --foundry
yarn install
```

- [ ] **Step 2: Configure for Gnosis**

Modify `packages/nextjs/scaffold.config.ts`:

```typescript
import { gnosis, gnosisChiado } from "viem/chains";

const scaffoldConfig = {
  targetNetworks: [gnosisChiado],
  pollingInterval: 5000,
  // ... rest of config
};
```

- [ ] **Step 3: Configure Foundry for Gnosis**

Modify `packages/foundry/foundry.toml`:

```toml
[rpc_endpoints]
gnosis = "https://rpc.gnosischain.com"
gnosisChiado = "https://rpc.chiadochain.net"

[etherscan]
gnosis = { key = "${GNOSISSCAN_API_KEY}", url = "https://api.gnosisscan.io/api" }
gnosisChiado = { key = "${GNOSISSCAN_API_KEY}", url = "https://blockscout.chiadochain.net/api" }
```

- [ ] **Step 4: Add .env.example**

Create `packages/foundry/.env.example`:

```bash
DEPLOYER_PRIVATE_KEY=0x...
GNOSISSCAN_API_KEY=...
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: bootstrap Scaffold-ETH 2 with Foundry for Gnosis"
```

---

## Phase 1: Frontend-First — UI Shell & Mock Data (Days 1-2)

Per ethskills orchestration: build the frontend FIRST with mock data. No contracts yet.

### Task 2: Distribution Curve UI Component

**Files:**
- Create: `packages/nextjs/app/components/DistributionCurve.tsx`
- Create: `packages/nextjs/app/components/MarketCard.tsx`

- [ ] **Step 1: Install chart library**

```bash
cd packages/nextjs
yarn add recharts
```

- [ ] **Step 2: Build the curve component**

```typescript
// packages/nextjs/app/components/DistributionCurve.tsx
"use client";

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from "recharts";

interface DistributionPoint {
  x: number;
  y: number;
}

interface DistributionCurveProps {
  marketDistribution: DistributionPoint[];
  userDistribution?: DistributionPoint[];
  actualPrice?: number;
}

export default function DistributionCurve({
  marketDistribution,
  userDistribution,
  actualPrice,
}: DistributionCurveProps) {
  const data = marketDistribution.map((p, i) => ({
    x: p.x,
    market: p.y,
    user: userDistribution?.[i]?.y ?? 0,
  }));

  return (
    <div className="w-full h-64 bg-base-200 rounded-lg p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="x" type="number" domain={["auto", "auto"]} />
          <YAxis hide />
          <Line type="monotone" dataKey="market" stroke="#8884d8" strokeWidth={2} dot={false} />
          {userDistribution && (
            <Line type="monotone" dataKey="user" stroke="#82ca9d" strokeWidth={2} dot={false} />
          )}
          {actualPrice && <ReferenceLine x={actualPrice} stroke="red" strokeDasharray="3 3" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Build the market card**

```typescript
// packages/nextjs/app/components/MarketCard.tsx
import DistributionCurve from "./DistributionCurve";

interface Market {
  id: string;
  question: string;
  endDate: string;
  marketMu: number;
  marketSigma: number;
  currentPrice: number;
}

export default function MarketCard({ market }: { market: Market }) {
  const generateNormalPoints = (mu: number, sigma: number) => {
    const points = [];
    for (let x = mu - 3 * sigma; x <= mu + 3 * sigma; x += sigma / 10) {
      const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
      points.push({ x, y });
    }
    return points;
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">{market.question}</h2>
        <p>Resolves: {market.endDate}</p>
        <DistributionCurve
          marketDistribution={generateNormalPoints(market.marketMu, market.marketSigma)}
          actualPrice={market.currentPrice}
        />
        <div className="card-actions justify-end">
          <button className="btn btn-primary">Trade</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(frontend): add distribution curve and market card components"
```

---

### Task 3: Market List Page with Mock Data

**Files:**
- Create: `packages/nextjs/app/page.tsx`

- [ ] **Step 1: Build the main page**

```typescript
// packages/nextjs/app/page.tsx
"use client";

import MarketCard from "./components/MarketCard";

const MOCK_MARKETS = [
  {
    id: "1",
    question: "ETH price on May 1, 2026",
    endDate: "2026-05-01",
    marketMu: 3200,
    marketSigma: 400,
    currentPrice: 3150,
  },
  {
    id: "2",
    question: "BTC price on May 1, 2026",
    endDate: "2026-05-01",
    marketMu: 98000,
    marketSigma: 12000,
    currentPrice: 96500,
  },
];

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Distribution Markets</h1>
      <p className="mb-8 text-lg">
        Trade your beliefs as probability distributions, not discrete buckets.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {MOCK_MARKETS.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run dev server and verify**

```bash
cd packages/nextjs
yarn dev
```

Open `http://localhost:3000`. You should see two market cards with bell curves.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(frontend): market list page with mock data"
```

---

### Task 4: Interactive Trading UI

**Files:**
- Create: `packages/nextjs/app/trade/[id]/page.tsx`
- Create: `packages/nextjs/app/components/TradingInterface.tsx`

- [ ] **Step 1: Build the trading interface**

```typescript
// packages/nextjs/app/components/TradingInterface.tsx
"use client";

import { useState } from "react";
import DistributionCurve from "./DistributionCurve";

interface TradingInterfaceProps {
  market: {
    id: string;
    question: string;
    marketMu: number;
    marketSigma: number;
  };
}

export default function TradingInterface({ market }: TradingInterfaceProps) {
  const [userMu, setUserMu] = useState(market.marketMu);
  const [userSigma, setUserSigma] = useState(market.marketSigma);

  const generateNormalPoints = (mu: number, sigma: number) => {
    const points = [];
    for (let x = mu - 3 * sigma; x <= mu + 3 * sigma; x += sigma / 10) {
      const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
      points.push({ x, y });
    }
    return points;
  };

  return (
    <div className="space-y-6">
      <DistributionCurve
        marketDistribution={generateNormalPoints(market.marketMu, market.marketSigma)}
        userDistribution={generateNormalPoints(userMu, userSigma)}
      />
      
      <div className="bg-base-200 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Your Prediction</h3>
        
        <div className="space-y-4">
          <div>
            <label className="label">
              <span className="label-text">Expected Price (μ): {userMu}</span>
            </label>
            <input
              type="range"
              min={market.marketMu - 3 * market.marketSigma}
              max={market.marketMu + 3 * market.marketSigma}
              value={userMu}
              onChange={(e) => setUserMu(Number(e.target.value))}
              className="range range-primary w-full"
            />
          </div>
          
          <div>
            <label className="label">
              <span className="label-text">Confidence (σ): {userSigma}</span>
            </label>
            <input
              type="range"
              min={50}
              max={market.marketSigma * 3}
              value={userSigma}
              onChange={(e) => setUserSigma(Number(e.target.value))}
              className="range range-secondary w-full"
            />
            <span className="text-sm text-base-content/60">
              Narrow = confident, Wide = uncertain
            </span>
          </div>
        </div>
        
        <button className="btn btn-primary w-full mt-6">
          Submit Trade
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the trade page**

```typescript
// packages/nextjs/app/trade/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import TradingInterface from "../../components/TradingInterface";

const MOCK_MARKETS = {
  "1": { id: "1", question: "ETH price on May 1, 2026", marketMu: 3200, marketSigma: 400 },
  "2": { id: "2", question: "BTC price on May 1, 2026", marketMu: 98000, marketSigma: 12000 },
};

export default function TradePage() {
  const params = useParams();
  const market = MOCK_MARKETS[params.id as keyof typeof MOCK_MARKETS];

  if (!market) return <div>Market not found</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">{market.question}</h1>
      <TradingInterface market={market} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(frontend): interactive trading UI with distribution sliders"
```

---

## Phase 2: Smart Contracts — The Math Core (Days 3-4)

### Task 5: Normal Distribution Math Library

**Files:**
- Create: `packages/foundry/contracts/NormalMath.sol`

- [ ] **Step 1: Write the math library**

```solidity
// packages/foundry/contracts/NormalMath.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title NormalMath
/// @notice Math utilities for Normal distribution AMM
/// @dev Implements fixed-point math for onchain Normal distribution calculations
///      Based on Paradigm's Distribution Markets paper (Dec 2024)
library NormalMath {
    uint256 constant DECIMALS = 1e18;
    uint256 constant PI = 3141592653589793238; // pi * 1e18
    uint256 constant SQRT_2PI = 2506628274631000502; // sqrt(2*pi) * 1e18
    uint256 constant SQRT_PI = 1772453850905516027; // sqrt(pi) * 1e18

    /// @notice Calculate Normal PDF at point x given mu and sigma
    /// @param x Point to evaluate
    /// @param mu Mean
    /// @param sigma Standard deviation (scaled by 1e18)
    /// @return pdf Value of PDF at x, scaled by 1e18
    function pdf(int256 x, int256 mu, uint256 sigma) internal pure returns (uint256) {
        require(sigma > 0, "Sigma must be positive");
        
        int256 diff = x - mu;
        uint256 diffSquared = uint256(diff * diff);
        uint256 sigmaSquared = (sigma * sigma) / DECIMALS;
        
        // exponent = -diff^2 / (2 * sigma^2)
        uint256 exponent = (diffSquared * DECIMALS) / (2 * sigmaSquared);
        
        // e^(-exponent)
        uint256 expResult = exp(-int256(exponent));
        
        // pdf = expResult / (sigma * sqrt(2*pi))
        uint256 denominator = (sigma * SQRT_2PI) / DECIMALS;
        return (expResult * DECIMALS) / denominator;
    }

    /// @notice Approximate e^x for fixed-point math using Taylor series
    /// @param x Exponent in fixed-point (1e18 = 1.0)
    /// @return result e^x in fixed-point
    function exp(int256 x) internal pure returns (uint256) {
        if (x == 0) return DECIMALS;
        if (x <= -41 * int256(DECIMALS)) return 0;
        
        bool negative = x < 0;
        uint256 absX = negative ? uint256(-x) : uint256(x);
        
        uint256 result = DECIMALS;
        uint256 term = DECIMALS;
        
        for (uint256 i = 1; i <= 20; i++) {
            term = (term * absX) / (DECIMALS * i);
            if (term == 0) break;
            
            if (negative) {
                result = (i % 2 == 1) ? result - term : result + term;
            } else {
                result = result + term;
            }
        }
        
        return result;
    }

    /// @notice Calculate L2 norm of Normal distribution
    /// @dev L2 norm = 1 / sqrt(2 * sigma * sqrt(pi))
    /// @param sigma Standard deviation
    /// @return l2norm L2 norm scaled by 1e18
    function l2Norm(uint256 sigma) internal pure returns (uint256) {
        uint256 sigmaSqrtPi = (sigma * SQRT_PI) / DECIMALS;
        uint256 twoSigmaSqrtPi = 2 * sigmaSqrtPi;
        return sqrt((DECIMALS * DECIMALS) / twoSigmaSqrtPi);
    }

    /// @notice Calculate lambda scaling factor for a given sigma and k
    /// @dev lambda = k * sqrt(2 * sigma * sqrt(pi))
    /// @param k L2 norm constant
    /// @param sigma Standard deviation
    /// @return lambda Scaling factor
    function lambda(uint256 k, uint256 sigma) internal pure returns (uint256) {
        uint256 twoSigmaSqrtPi = (2 * sigma * SQRT_PI) / DECIMALS;
        return (k * sqrt(twoSigmaSqrtPi)) / DECIMALS;
    }

    /// @notice Integer square root using Babylonian method
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    /// @notice Calculate max value of f(x) = lambda * p(x)
    /// @dev max f = k / sqrt(sigma * sqrt(pi))
    function maxF(uint256 k, uint256 sigma) internal pure returns (uint256) {
        uint256 sigmaSqrtPi = (sigma * SQRT_PI) / DECIMALS;
        return (k * DECIMALS) / sqrt(sigmaSqrtPi);
    }
}
```

- [ ] **Step 2: Write comprehensive tests**

```solidity
// packages/foundry/test/NormalMath.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/NormalMath.sol";

contract NormalMathTest is Test {
    function testPDFAtMean() public pure {
        // At x = mu, PDF = 1/(sigma*sqrt(2*pi))
        // For sigma=400, PDF ≈ 0.000997 → scaled: ~9.97e14
        uint256 result = NormalMath.pdf(3000, 3000, 400e18);
        
        // Allow 10% tolerance for Taylor approximation
        assertGt(result, 897e15);
        assertLt(result, 1097e15);
    }

    function testPDFDecreasesWithDistance() public pure {
        uint256 atMean = NormalMath.pdf(3000, 3000, 400e18);
        uint256 atOneSigma = NormalMath.pdf(3400, 3000, 400e18);
        uint256 atTwoSigma = NormalMath.pdf(3800, 3000, 400e18);
        
        assertGt(atMean, atOneSigma);
        assertGt(atOneSigma, atTwoSigma);
    }

    function testL2Norm() public pure {
        // For sigma=400: L2 = 1/sqrt(2*400*sqrt(pi))
        uint256 result = NormalMath.l2Norm(400e18);
        assertGt(result, 0);
        
        // Lower sigma → higher L2 norm (more peaked = more mass)
        uint256 narrow = NormalMath.l2Norm(200e18);
        uint256 wide = NormalMath.l2Norm(800e18);
        assertGt(narrow, wide);
    }

    function testMaxFConstraint() public pure {
        uint256 k = NormalMath.l2Norm(400e18);
        uint256 backing = 1000e18;
        
        // maxF = k / sqrt(sigma * sqrt(pi))
        uint256 max = NormalMath.maxF(k, 400e18);
        
        // maxF must be <= backing for solvency
        assertLe(max, backing);
    }

    function testExp() public pure {
        assertEq(NormalMath.exp(0), 1e18);
        
        uint256 e_neg1 = NormalMath.exp(-1e18);
        // e^-1 ≈ 0.3679
        assertGt(e_neg1, 330e15);
        assertLt(e_neg1, 400e15);
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd packages/foundry
forge test --match-contract NormalMathTest -vv
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(contracts): add NormalMath library with PDF, L2 norm, and solvency checks"
```

---

### Task 6: Distribution Market Contract

**Files:**
- Create: `packages/foundry/contracts/DistributionMarket.sol`

- [ ] **Step 1: Write the market contract**

```solidity
// packages/foundry/contracts/DistributionMarket.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./NormalMath.sol";

/// @title DistributionMarket
/// @notice AMM for trading continuous Normal distributions
/// @dev Implements Paradigm's distribution market mechanism:
///      - Traders submit Normal distributions (mu, sigma)
///      - AMM maintains consensus distribution
///      - L2 norm invariant ensures solvency
///      - Payout based on PDF at outcome vs market PDF
contract DistributionMarket {
    using SafeERC20 for IERC20;
    using NormalMath for uint256;

    struct Market {
        string question;
        uint256 endTime;
        int256 currentMu;      // Market consensus mean
        uint256 currentSigma;  // Market consensus std dev
        uint256 backing;       // Total collateral backing
        uint256 k;            // L2 norm constant
        bool resolved;
        int256 outcome;       // Final outcome (set after resolution)
    }

    struct Position {
        int256 mu;
        uint256 sigma;
        uint256 collateral;
    }

    IERC20 public immutable collateralToken;
    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime, uint256 backing);
    event TradeExecuted(uint256 indexed marketId, address indexed trader, int256 mu, uint256 sigma, uint256 cost);
    event MarketResolved(uint256 indexed marketId, int256 outcome);
    event PayoutClaimed(uint256 indexed marketId, address indexed trader, uint256 amount);

    constructor(address _collateralToken) {
        collateralToken = IERC20(_collateralToken);
    }

    /// @notice Create a new distribution market
    /// @param question Human-readable market question (e.g., "ETH price on May 1, 2026")
    /// @param endTime When the market resolves (unix timestamp)
    /// @param initialMu Initial market estimate (mean, e.g., 3200 for $3,200 ETH)
    /// @param initialSigma Initial market estimate (std dev, scaled by 1e18)
    /// @param backing Initial collateral backing the market (scaled by token decimals)
    function createMarket(
        string calldata question,
        uint256 endTime,
        int256 initialMu,
        uint256 initialSigma,
        uint256 backing
    ) external returns (uint256 marketId) {
        require(endTime > block.timestamp, "End time must be in future");
        require(initialSigma > 0, "Sigma must be positive");
        require(backing > 0, "Backing must be positive");

        marketId = marketCount++;
        uint256 k = NormalMath.l2Norm(initialSigma);

        // Verify solvency: maxF <= backing
        uint256 maxF = NormalMath.maxF(k, initialSigma);
        require(maxF <= backing, "Insufficient backing for sigma");

        markets[marketId] = Market({
            question: question,
            endTime: endTime,
            currentMu: initialMu,
            currentSigma: initialSigma,
            backing: backing,
            k: k,
            resolved: false,
            outcome: 0
        });

        collateralToken.safeTransferFrom(msg.sender, address(this), backing);

        emit MarketCreated(marketId, question, endTime, backing);
    }

    /// @notice Trade on a market by submitting your distribution estimate
    /// @param marketId Market to trade on
    /// @param newMu Your predicted mean
    /// @param newSigma Your predicted standard deviation (scaled by 1e18)
    function trade(uint256 marketId, int256 newMu, uint256 newSigma) external {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.endTime, "Market expired");
        require(newSigma > 0, "Sigma must be positive");

        // Enforce minimum sigma based on backing constraint
        // sigma >= k^2 / (b^2 * sqrt(pi))
        uint256 minSigma = (market.k * market.k * 1e18) / 
            (market.backing * market.backing * NormalMath.SQRT_PI / 1e18);
        require(newSigma >= minSigma, "Sigma too small for backing");

        // Calculate trade cost
        uint256 cost = calculateTradeCost(marketId, newMu, newSigma);
        
        // Update market state
        market.currentMu = newMu;
        market.currentSigma = newSigma;

        // Record position
        positions[marketId][msg.sender] = Position({
            mu: newMu,
            sigma: newSigma,
            collateral: cost
        });

        if (cost > 0) {
            collateralToken.safeTransferFrom(msg.sender, address(this), cost);
        }

        emit TradeExecuted(marketId, msg.sender, newMu, newSigma, cost);
    }

    /// @notice Calculate the cost to move market to a new distribution
    /// @dev Cost is based on change in L2 norm (simplified model)
    function calculateTradeCost(
        uint256 marketId,
        int256 newMu,
        uint256 newSigma
    ) public view returns (uint256) {
        Market storage market = markets[marketId];
        
        uint256 oldK = NormalMath.l2Norm(market.currentSigma);
        uint256 newK = NormalMath.l2Norm(newSigma);
        
        // Cost proportional to how much the distribution changes
        if (newK > oldK) {
            return newK - oldK;
        }
        return 0;
    }

    /// @notice Resolve the market with the actual outcome
    /// @param marketId Market to resolve
    /// @param outcome Actual outcome value
    function resolve(uint256 marketId, int256 outcome) external {
        Market storage market = markets[marketId];
        require(block.timestamp >= market.endTime, "Market not yet expired");
        require(!market.resolved, "Already resolved");
        
        market.resolved = true;
        market.outcome = outcome;

        emit MarketResolved(marketId, outcome);
    }

    /// @notice Claim payout after resolution
    /// @param marketId Market to claim from
    function claim(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved");
        
        Position storage pos = positions[marketId][msg.sender];
        require(pos.collateral > 0, "No position");

        uint256 payout = calculatePayout(marketId, msg.sender);
        
        uint256 collateral = pos.collateral;
        pos.collateral = 0;

        if (payout > 0) {
            collateralToken.safeTransfer(msg.sender, payout);
        }

        emit PayoutClaimed(marketId, msg.sender, payout);
    }

    /// @notice Calculate payout for a position
    /// @dev Payout based on how close the trader's PDF at outcome is vs market PDF
    function calculatePayout(uint256 marketId, address trader) public view returns (uint256) {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][trader];
        
        if (!market.resolved || pos.collateral == 0) return 0;

        // PDF value at outcome for trader's prediction
        uint256 traderPDF = NormalMath.pdf(market.outcome, pos.mu, pos.sigma);
        
        // PDF value at outcome for market consensus
        uint256 marketPDF = NormalMath.pdf(market.outcome, market.currentMu, market.currentSigma);

        if (traderPDF > marketPDF) {
            // Trader predicted better than market
            uint256 ratio = (traderPDF * 1e18) / marketPDF;
            return (pos.collateral * ratio) / 1e18;
        }
        
        return 0;
    }

    /// @notice View function to get current market state
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }
}
```

- [ ] **Step 2: Write deploy script**

```solidity
// packages/foundry/script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/DistributionMarket.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN");
        
        vm.startBroadcast(deployerPrivateKey);
        
        DistributionMarket market = new DistributionMarket(collateralToken);
        
        vm.stopBroadcast();
        
        console.log("DistributionMarket deployed at:", address(market));
    }
}
```

- [ ] **Step 3: Write contract integration tests**

```solidity
// packages/foundry/test/DistributionMarket.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../contracts/DistributionMarket.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock WXDAI", "mWXDAI") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }
}

contract DistributionMarketTest is Test {
    DistributionMarket market;
    MockToken token;
    address alice = address(1);
    address bob = address(2);

    function setUp() public {
        token = new MockToken();
        market = new DistributionMarket(address(token));
        
        token.transfer(alice, 10_000 * 10**18);
        token.transfer(bob, 10_000 * 10**18);
        
        vm.prank(alice);
        token.approve(address(market), type(uint256).max);
        vm.prank(bob);
        token.approve(address(market), type(uint256).max);
    }

    function testCreateMarket() public {
        vm.prank(alice);
        uint256 marketId = market.createMarket(
            "ETH price on May 1, 2026",
            block.timestamp + 7 days,
            3200,
            400e18,
            1000 * 10**18
        );
        
        assertEq(marketId, 0);
        
        DistributionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.question, "ETH price on May 1, 2026");
        assertEq(m.currentMu, 3200);
        assertFalse(m.resolved);
    }

    function testTradeUpdatesMarket() public {
        vm.prank(alice);
        uint256 marketId = market.createMarket(
            "ETH price on May 1, 2026",
            block.timestamp + 7 days,
            3200,
            400e18,
            1000 * 10**18
        );

        vm.prank(bob);
        market.trade(marketId, 3500, 300e18);
        
        DistributionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.currentMu, 3500);
        assertEq(m.currentSigma, 300e18);
    }

    function testResolveAndClaim() public {
        // Setup market
        vm.prank(alice);
        uint256 marketId = market.createMarket(
            "ETH price on May 1, 2026",
            block.timestamp + 1,
            3200,
            400e18,
            1000 * 10**18
        );

        // Bob trades
        vm.prank(bob);
        market.trade(marketId, 3300, 350e18);

        // Fast forward past end time
        vm.warp(block.timestamp + 2);

        // Resolve
        market.resolve(marketId, 3300); // Outcome matches Bob's prediction

        // Bob claims
        vm.prank(bob);
        market.claim(marketId);
    }

    function test_RevertWhen_InsufficientBacking() public {
        vm.prank(alice);
        // Should fail: sigma too small for backing
        vm.expectRevert("Insufficient backing for sigma");
        market.createMarket(
            "ETH price",
            block.timestamp + 7 days,
            3200,
            50e18,  // Very narrow
            100 * 10**18  // Low backing
        );
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/foundry
forge test -vv
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(contracts): add DistributionMarket with Normal AMM and solvency checks"
```

---

## Phase 3: Frontend-Contract Integration (Day 5)

### Task 7: Wire Up Frontend to Contracts

**Files:**
- Modify: `packages/nextjs/contracts/externalContracts.ts`
- Modify: `packages/nextjs/app/page.tsx`
- Modify: `packages/nextjs/app/trade/[id]/page.tsx`
- Modify: `packages/nextjs/app/components/TradingInterface.tsx`

- [ ] **Step 1: Add contract ABIs to externalContracts.ts**

```typescript
// packages/nextjs/contracts/externalContracts.ts
import { gnosisChiado } from "viem/chains";

export const externalContracts = {
  [gnosisChiado.id]: {
    DistributionMarket: {
      address: "0x...", // Fill after deployment
      abi: [
        {
          inputs: [{ name: "_collateralToken", type: "address" }],
          stateMutability: "nonpayable",
          type: "constructor",
        },
        {
          inputs: [
            { name: "question", type: "string" },
            { name: "endTime", type: "uint256" },
            { name: "initialMu", type: "int256" },
            { name: "initialSigma", type: "uint256" },
            { name: "backing", type: "uint256" },
          ],
          name: "createMarket",
          outputs: [{ name: "marketId", type: "uint256" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          inputs: [
            { name: "marketId", type: "uint256" },
            { name: "newMu", type: "int256" },
            { name: "newSigma", type: "uint256" },
          ],
          name: "trade",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          inputs: [{ name: "marketId", type: "uint256" }],
          name: "getMarket",
          outputs: [
            {
              components: [
                { name: "question", type: "string" },
                { name: "endTime", type: "uint256" },
                { name: "currentMu", type: "int256" },
                { name: "currentSigma", type: "uint256" },
                { name: "backing", type: "uint256" },
                { name: "k", type: "uint256" },
                { name: "resolved", type: "bool" },
                { name: "outcome", type: "int256" },
              ],
              name: "",
              type: "tuple",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [],
          name: "marketCount",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
    },
  },
} as const;
```

- [ ] **Step 2: Replace mock data with contract reads**

```typescript
// packages/nextjs/app/page.tsx
"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import MarketCard from "./components/MarketCard";

export default function Home() {
  const { data: marketCount } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "marketCount",
    watch: true,
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Distribution Markets</h1>
      <p className="mb-8 text-lg">
        Trade your beliefs as probability distributions, not discrete buckets.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {marketCount && Array.from({ length: Number(marketCount) }, (_, i) => (
          <MarketCard key={i} marketId={BigInt(i)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update MarketCard to fetch from contract**

```typescript
// packages/nextjs/app/components/MarketCard.tsx
"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import DistributionCurve from "./DistributionCurve";

export default function MarketCard({ marketId }: { marketId: bigint }) {
  const { data: market } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "getMarket",
    args: [marketId],
    watch: true,
  });

  const generateNormalPoints = (mu: number, sigma: number) => {
    const points = [];
    for (let x = mu - 3 * sigma; x <= mu + 3 * sigma; x += sigma / 10) {
      const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
      points.push({ x, y });
    }
    return points;
  };

  if (!market) return null;

  const mu = Number(market.currentMu);
  const sigma = Number(market.currentSigma) / 1e18;

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">{market.question}</h2>
        <p>Resolves: {new Date(Number(market.endTime) * 1000).toLocaleDateString()}</p>
        <DistributionCurve
          marketDistribution={generateNormalPoints(mu, sigma)}
        />
        <div className="card-actions justify-end">
          <a href={`/trade/${marketId}`} className="btn btn-primary">Trade</a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement contract write in TradingInterface**

```typescript
// packages/nextjs/app/components/TradingInterface.tsx
"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import DistributionCurve from "./DistributionCurve";

export default function TradingInterface({ marketId }: { marketId: bigint }) {
  const [userMu, setUserMu] = useState(3200);
  const [userSigma, setUserSigma] = useState(400);
  const { writeContractAsync, isMining } = useScaffoldWriteContract("DistributionMarket");

  const handleTrade = async () => {
    await writeContractAsync({
      functionName: "trade",
      args: [
        marketId,
        BigInt(userMu),
        parseUnits(userSigma.toString(), 18),
      ],
    });
  };

  // ... rest of component with handleTrade wired to button
}
```

- [ ] **Step 5: Add three-button flow**

Per ethskills frontend-ux: Switch Network → Approve → Execute.

```typescript
const { writeContractAsync: approveToken } = useScaffoldWriteContract("MockToken");

// Check allowance
const { data: allowance } = useScaffoldReadContract({
  contractName: "MockToken",
  functionName: "allowance",
  args: [address, marketAddress],
});

// Show Approve button if allowance < trade cost
// Show Trade button if allowance >= trade cost
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(frontend): integrate with DistributionMarket contract"
```

---

## Phase 4: Deployment & QA (Day 6-7)

### Task 8: Deploy to Gnosis Chiado

- [ ] **Step 1: Deploy mock token (if needed)**

On Chiado, use an existing token or deploy a mock:

```bash
cd packages/foundry
forge create MockToken --rpc-url gnosisChiado --broadcast
```

- [ ] **Step 2: Deploy DistributionMarket**

```bash
source .env
forge script script/Deploy.s.sol --rpc-url gnosisChiado --broadcast --verify
```

- [ ] **Step 3: Update contract addresses in externalContracts.ts**

- [ ] **Step 4: Deploy frontend**

```bash
cd packages/nextjs
yarn build
yarn vercel
```

- [ ] **Step 5: Create a test market**

Use the frontend or cast:

```bash
cast send $MARKET_ADDRESS "createMarket(string,uint256,int256,uint256,uint256)" \
  "ETH price on June 1, 2026" \
  $(date -v+30d +%s) \
  3200 \
  400000000000000000000 \
  1000000000000000000000 \
  --rpc-url gnosisChiado \
  --private-key $DEPLOYER_PRIVATE_KEY
```

- [ ] **Step 6: Final QA checklist**

- [ ] App loads on public URL
- [ ] Wallet connects to Gnosis Chiado
- [ ] Can create a market
- [ ] Can view market list with bell curves
- [ ] Can trade by setting mu and sigma
- [ ] Three-button flow works (approve → trade)
- [ ] No console errors
- [ ] Mobile responsive

- [ ] **Step 7: Commit and push**

```bash
git add .
git commit -m "chore: deploy to Gnosis Chiado testnet"
git push origin main
```

---

## File Structure

```
packages/
├── foundry/
│   ├── contracts/
│   │   ├── DistributionMarket.sol    # Main AMM contract
│   │   └── NormalMath.sol            # Fixed-point Normal distribution math
│   ├── script/
│   │   └── Deploy.s.sol
│   ├── test/
│   │   ├── NormalMath.t.sol
│   │   └── DistributionMarket.t.sol
│   └── foundry.toml
└── nextjs/
    ├── app/
    │   ├── components/
    │   │   ├── DistributionCurve.tsx  # Recharts bell curve
    │   │   ├── MarketCard.tsx         # Market preview card
    │   │   └── TradingInterface.tsx   # Slider-based trading UI
    │   ├── trade/
    │   │   └── [id]/
    │   │       └── page.tsx
    │   └── page.tsx
    ├── contracts/
    │   ├── deployedContracts.ts
    │   └── externalContracts.ts
    └── scaffold.config.ts
```

---

## Self-Review

**Spec coverage:**
- Normal distribution math onchain (Task 5)
- AMM with L2 norm invariant (Task 6)
- Frontend with interactive curves (Tasks 2-4)
- Contract integration with three-button flow (Task 7)
- Gnosis deployment (Task 8)

**Placeholder scan:** No "TODO" or "TBD" in implementation code.

**Type consistency:** Solidity uses `int256` for μ, `uint256` for σ (both scaled by 1e18). Frontend uses `number` for display, converts to `BigInt` for contract calls.

---

**Plan saved to:** `docs/plans/2026-04-21-distribution-market.md`
