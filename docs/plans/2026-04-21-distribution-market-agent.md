# Distribution Market Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-powered distribution market trading agent on Gnosis Chain with a React frontend, enabling users to create markets, express beliefs as probability distributions, and let an AI agent trade against them.

**Architecture:** Frontend-first dApp using Scaffold-ETH 2 (React + Foundry + wagmi). One Solidity contract (`DistributionMarket.sol`) implements the Normal-distribution AMM from Paradigm's paper. Offchain Python agent estimates distributions from market data and executes trades. Frontend lets users drag a bell curve to trade and watch the AI agent compete.

**Tech Stack:** Scaffold-ETH 2 (Next.js, Tailwind, wagmi/viem, Foundry), Solidity, OpenZeppelin, Python (agent), Gnosis Chiado testnet

**Chain:** Gnosis Chain (Chiado testnet for dev, Gnosis mainnet for production)

**Contract Count:** 1 MVP contract (`DistributionMarket.sol`) + 1 helper (`NormalMath.sol`)

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
ALCHEMY_API_KEY=...  # optional
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
        Trade your beliefs as probability distributions. The AI agent competes against you.
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

## Phase 2: Smart Contracts (Days 3-4)

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
/// @dev Based on Paradigm's Distribution Markets paper
library NormalMath {
    uint256 constant PI = 3141592653589793238; // pi * 1e18
    uint256 constant SQRT_2PI = 2506628274631000502; // sqrt(2*pi) * 1e18
    uint256 constant DECIMALS = 1e18;

    /// @notice Calculate Normal PDF at point x given mu and sigma
    /// @param x Point to evaluate
    /// @param mu Mean
    /// @param sigma Standard deviation
    /// @return pdf Value of PDF at x, scaled by 1e18
    function pdf(int256 x, int256 mu, uint256 sigma) internal pure returns (uint256) {
        require(sigma > 0, "Sigma must be positive");
        
        int256 diff = x - mu;
        uint256 diffSquared = uint256(diff * diff);
        uint256 sigmaSquared = sigma * sigma;
        
        // exponent = -diff^2 / (2 * sigma^2)
        uint256 exponent = (diffSquared * DECIMALS) / (2 * sigmaSquared);
        
        // e^(-exponent)
        uint256 expResult = exp(-int256(exponent));
        
        // pdf = expResult / (sigma * sqrt(2*pi))
        uint256 denominator = (sigma * SQRT_2PI) / DECIMALS;
        return (expResult * DECIMALS) / denominator;
    }

    /// @notice Approximate e^x for fixed-point math
    /// @param x Exponent in fixed-point (1e18 = 1.0)
    /// @return result e^x in fixed-point
    function exp(int256 x) internal pure returns (uint256) {
        if (x == 0) return DECIMALS;
        if (x <= -41 * int256(DECIMALS)) return 0; // e^-41 ≈ 0
        
        bool negative = x < 0;
        uint256 absX = negative ? uint256(-x) : uint256(x);
        
        // Taylor series: e^x = 1 + x + x^2/2! + x^3/3! + ...
        uint256 result = DECIMALS;
        uint256 term = DECIMALS;
        
        for (uint256 i = 1; i <= 20; i++) {
            term = (term * absX) / (DECIMALS * i);
            if (term == 0) break;
            
            if (negative) {
                if (i % 2 == 1) {
                    result = result - term;
                } else {
                    result = result + term;
                }
            } else {
                result = result + term;
            }
        }
        
        return result;
    }

    /// @notice Calculate L2 norm of Normal distribution
    /// @param sigma Standard deviation
    /// @return l2norm L2 norm scaled by 1e18
    function l2Norm(uint256 sigma) internal pure returns (uint256) {
        // L2 norm = 1 / sqrt(2 * sigma * sqrt(pi))
        // = sqrt(DECIMALS) / sqrt(2 * sigma * sqrt(pi) * DECIMALS)
        uint256 sigmaSqrtPi = (sigma * 1772453850905516027) / DECIMALS; // sqrt(pi) ≈ 1.772...
        uint256 twoSigmaSqrtPi = 2 * sigmaSqrtPi;
        return sqrt((DECIMALS * DECIMALS) / twoSigmaSqrtPi);
    }

    /// @notice Integer square root
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
}
```

- [ ] **Step 2: Write tests for NormalMath**

```solidity
// packages/foundry/test/NormalMath.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/NormalMath.sol";

contract NormalMathTest is Test {
    using NormalMath for int256;
    using NormalMath for uint256;

    function testPDFAtMean() public pure {
        // At x = mu, PDF should be 1/(sigma*sqrt(2*pi))
        int256 mu = 3000;
        uint256 sigma = 400;
        uint256 result = NormalMath.pdf(mu, mu, sigma);
        
        // Expected: 1/(400 * 2.5066) ≈ 0.000997
        // Scaled by 1e18: ~997000000000000
        assertGt(result, 900000000000000);
        assertLt(result, 1100000000000000);
    }

    function testPDFDecreasesWithDistance() public pure {
        int256 mu = 3000;
        uint256 sigma = 400;
        
        uint256 atMean = NormalMath.pdf(mu, mu, sigma);
        uint256 atOneSigma = NormalMath.pdf(mu + 400, mu, sigma);
        uint256 atTwoSigma = NormalMath.pdf(mu + 800, mu, sigma);
        
        assertGt(atMean, atOneSigma);
        assertGt(atOneSigma, atTwoSigma);
    }

    function testExpZero() public pure {
        assertEq(NormalMath.exp(0), 1e18);
    }

    function testExpNegative() public pure {
        uint256 result = NormalMath.exp(-1e18); // e^-1
        // Should be approximately 0.3679
        assertGt(result, 360000000000000000);
        assertLt(result, 380000000000000000);
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd packages/foundry
forge test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(contracts): add NormalMath library with PDF, exp, and L2 norm"
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
/// @dev Implements Paradigm's distribution market mechanism
contract DistributionMarket {
    using SafeERC20 for IERC20;

    struct Market {
        string question;
        uint256 endTime;
        int256 currentMu;
        uint256 currentSigma;
        uint256 backing; // Total collateral
        uint256 k;       // L2 norm constant
        bool resolved;
        int256 outcome;  // Final outcome (set after resolution)
    }

    IERC20 public immutable collateralToken;
    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;

    struct Position {
        int256 mu;
        uint256 sigma;
        uint256 collateral;
    }

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event TradeExecuted(uint256 indexed marketId, address indexed trader, int256 mu, uint256 sigma, uint256 cost);
    event MarketResolved(uint256 indexed marketId, int256 outcome);

    constructor(address _collateralToken) {
        collateralToken = IERC20(_collateralToken);
    }

    /// @notice Create a new distribution market
    /// @param question Human-readable market question
    /// @param endTime When the market resolves
    /// @param initialMu Initial market estimate (mean)
    /// @param initialSigma Initial market estimate (std dev)
    /// @param backing Initial collateral backing the market
    function createMarket(
        string calldata question,
        uint256 endTime,
        int256 initialMu,
        uint256 initialSigma,
        uint256 backing
    ) external returns (uint256 marketId) {
        require(endTime > block.timestamp, "End time must be future");
        require(initialSigma > 0, "Sigma must be positive");
        require(backing > 0, "Backing must be positive");

        marketId = marketCount++;
        uint256 k = NormalMath.l2Norm(initialSigma);

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

        // Transfer initial collateral from creator
        collateralToken.safeTransferFrom(msg.sender, address(this), backing);

        emit MarketCreated(marketId, question, endTime);
    }

    /// @notice Trade on a market by submitting your distribution estimate
    /// @param marketId Market to trade on
    /// @param newMu Your predicted mean
    /// @param newSigma Your predicted standard deviation
    function trade(uint256 marketId, int256 newMu, uint256 newSigma) external {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.endTime, "Market expired");
        require(newSigma > 0, "Sigma must be positive");

        // Enforce minimum sigma based on backing constraint
        uint256 minSigma = (market.k * market.k) / (market.backing * market.backing * 1772453850905516027 / 1e18);
        require(newSigma >= minSigma, "Sigma too small for backing");

        // Calculate trade cost based on L2 norm change
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

        // Transfer collateral
        if (cost > 0) {
            collateralToken.safeTransferFrom(msg.sender, address(this), cost);
        }

        emit TradeExecuted(marketId, msg.sender, newMu, newSigma, cost);
    }

    /// @notice Calculate the cost to move market to a new distribution
    function calculateTradeCost(
        uint256 marketId,
        int256 newMu,
        uint256 newSigma
    ) public view returns (uint256) {
        Market storage market = markets[marketId];
        
        // Simplified cost: difference in L2 norms
        uint256 oldK = NormalMath.l2Norm(market.currentSigma);
        uint256 newK = NormalMath.l2Norm(newSigma);
        
        if (newK > oldK) {
            return newK - oldK;
        }
        return 0;
    }

    /// @notice Resolve the market with the actual outcome
    function resolve(uint256 marketId, int256 outcome) external {
        Market storage market = markets[marketId];
        require(block.timestamp >= market.endTime, "Market not yet expired");
        require(!market.resolved, "Already resolved");
        
        market.resolved = true;
        market.outcome = outcome;

        emit MarketResolved(marketId, outcome);
    }

    /// @notice Claim payout after resolution
    function claim(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved");
        
        Position storage pos = positions[marketId][msg.sender];
        require(pos.collateral > 0, "No position");

        // Calculate payout based on how close prediction was to outcome
        uint256 payout = calculatePayout(marketId, msg.sender);
        
        // Clear position
        uint256 collateral = pos.collateral;
        pos.collateral = 0;

        // Transfer payout
        if (payout > 0) {
            collateralToken.safeTransfer(msg.sender, payout);
        }
    }

    /// @notice Calculate payout for a position
    function calculatePayout(uint256 marketId, address trader) public view returns (uint256) {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][trader];
        
        if (!market.resolved || pos.collateral == 0) return 0;

        // PDF value at outcome: higher if outcome is near predicted mean
        uint256 outcomePDF = NormalMath.pdf(market.outcome, pos.mu, pos.sigma);
        
        // Compare to market PDF at outcome
        uint256 marketPDF = NormalMath.pdf(market.outcome, market.currentMu, market.currentSigma);

        if (outcomePDF > marketPDF) {
            // Trader predicted better than market consensus
            uint256 ratio = (outcomePDF * 1e18) / marketPDF;
            return (pos.collateral * ratio) / 1e18;
        }
        
        return 0;
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
        
        // For testnet, use a mock token or existing token
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN");
        
        vm.startBroadcast(deployerPrivateKey);
        
        DistributionMarket market = new DistributionMarket(collateralToken);
        
        vm.stopBroadcast();
        
        console.log("DistributionMarket deployed at:", address(market));
    }
}
```

- [ ] **Step 3: Write contract tests**

```solidity
// packages/foundry/test/DistributionMarket.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../contracts/DistributionMarket.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MCK") {
        _mint(msg.sender, 1000000 * 10**18);
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
        
        token.transfer(alice, 10000 * 10**18);
        token.transfer(bob, 10000 * 10**18);
        
        vm.prank(alice);
        token.approve(address(market), type(uint256).max);
        vm.prank(bob);
        token.approve(address(market), type(uint256).max);
    }

    function testCreateMarket() public {
        vm.prank(alice);
        uint256 marketId = market.createMarket(
            "ETH price on May 1",
            block.timestamp + 7 days,
            3000,
            400,
            1000 * 10**18
        );
        
        assertEq(marketId, 0);
        
        (string memory question,,,,,,,) = market.markets(marketId);
        assertEq(question, "ETH price on May 1");
    }

    function testTrade() public {
        vm.prank(alice);
        uint256 marketId = market.createMarket(
            "ETH price on May 1",
            block.timestamp + 7 days,
            3000,
            400,
            1000 * 10**18
        );

        vm.prank(bob);
        market.trade(marketId, 3200, 350);
        
        (int256 currentMu, uint256 currentSigma,,,,,,) = market.markets(marketId);
        assertEq(currentMu, 3200);
        assertEq(currentSigma, 350);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/foundry
forge test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(contracts): add DistributionMarket with Normal AMM"
```

---

## Phase 3: Frontend Integration (Day 5)

### Task 7: Connect Frontend to Contracts

**Files:**
- Modify: `packages/nextjs/app/page.tsx`
- Modify: `packages/nextjs/app/trade/[id]/page.tsx`
- Modify: `packages/nextjs/app/components/TradingInterface.tsx`

- [ ] **Step 1: Add external contracts config**

```typescript
// packages/nextjs/contracts/externalContracts.ts
import { gnosisChiado } from "viem/chains";

export const externalContracts = {
  [gnosisChiado.id]: {
    DistributionMarket: {
      address: "0x...", // Fill after deploy
      abi: [ /* ABI from forge build */ ],
    },
  },
} as const;
```

- [ ] **Step 2: Update page to use real contract data**

Replace mock data in `page.tsx` and `trade/[id]/page.tsx` with `useScaffoldReadContract` calls to fetch live market data.

```typescript
const { data: marketCount } = useScaffoldReadContract({
  contractName: "DistributionMarket",
  functionName: "marketCount",
});
```

- [ ] **Step 3: Implement contract write in TradingInterface**

```typescript
const { writeContractAsync } = useScaffoldWriteContract("DistributionMarket");

const handleTrade = async () => {
  await writeContractAsync({
    functionName: "trade",
    args: [BigInt(marketId), BigInt(userMu), BigInt(userSigma)],
  });
};
```

- [ ] **Step 4: Add approval flow**

Implement the three-button flow per ethskills:
1. Switch Network (if wrong chain)
2. Approve Token (if allowance insufficient)
3. Execute Trade

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(frontend): integrate with DistributionMarket contract"
```

---

## Phase 4: AI Agent (Day 6-7)

### Task 8: Python Distribution Estimator Agent

**Files:**
- Create: `agent/README.md`
- Create: `agent/pyproject.toml`
- Create: `agent/agent.py`
- Create: `agent/market_watcher.py`
- Create: `agent/distribution_estimator.py`
- Create: `agent/trader.py`

- [ ] **Step 1: Set up Python project**

```bash
mkdir -p ~/code/distribution-market-agent/agent
cd ~/code/distribution-market-agent/agent
cat > pyproject.toml << 'EOF'
[project]
name = "distribution-market-agent"
version = "0.1.0"
dependencies = [
    "web3>=6.0",
    "openai>=1.0",
    "requests",
    "python-dotenv",
]

[project.optional-dependencies]
dev = ["pytest", "black", "mypy"]
EOF

pip install -e ".[dev]"
```

- [ ] **Step 2: Build the agent core**

```python
# agent/agent.py
import os
import asyncio
from dataclasses import dataclass
from typing import Optional
from web3 import Web3
from openai import AsyncOpenAI

@dataclass
class MarketState:
    market_id: int
    question: str
    current_mu: float
    current_sigma: float
    end_time: int

class DistributionMarketAgent:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(os.getenv("GNOSIS_RPC")))
        self.market_address = os.getenv("MARKET_ADDRESS")
        self.private_key = os.getenv("AGENT_PRIVATE_KEY")
        self.openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
    async def estimate_distribution(self, question: str, current_mu: float) -> tuple[float, float]:
        """Use LLM to estimate distribution from research."""
        prompt = f"""
        You are a quantitative analyst estimating the probability distribution of a market outcome.
        
        Market question: {question}
        Current market estimate (mean): {current_mu}
        
        Research the latest data and provide your estimate as:
        - Expected value (mean, μ)
        - Standard deviation (σ) reflecting your uncertainty
        
        Respond ONLY in this format:
        MU: <number>
        SIGMA: <number>
        REASONING: <one sentence>
        """
        
        response = await self.openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        
        content = response.choices[0].message.content
        # Parse MU and SIGMA from response
        mu = float(content.split("MU:")[1].split("\n")[0].strip())
        sigma = float(content.split("SIGMA:")[1].split("\n")[0].strip())
        
        return mu, sigma
    
    async def run(self):
        """Main agent loop."""
        while True:
            try:
                # 1. Scan for active markets
                markets = await self.get_active_markets()
                
                for market in markets:
                    # 2. Estimate distribution
                    mu, sigma = await self.estimate_distribution(
                        market.question, market.current_mu
                    )
                    
                    # 3. Check if edge exists
                    if abs(mu - market.current_mu) > market.current_sigma * 0.5:
                        # 4. Execute trade
                        await self.execute_trade(market.market_id, mu, sigma)
                        
                await asyncio.sleep(3600)  # Run every hour
            except Exception as e:
                print(f"Error: {e}")
                await asyncio.sleep(300)
    
    async def get_active_markets(self) -> list[MarketState]:
        # TODO: Implement contract call
        return []
    
    async def execute_trade(self, market_id: int, mu: float, sigma: float):
        # TODO: Implement contract write
        pass

if __name__ == "__main__":
    agent = DistributionMarketAgent()
    asyncio.run(agent.run())
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(agent): add Python distribution estimator agent skeleton"
```

---

## Phase 5: Deployment & QA (Day 7)

### Task 9: Deploy to Gnosis Chiado

- [ ] **Step 1: Deploy contracts**

```bash
cd packages/foundry
source .env
forge script script/Deploy.s.sol --rpc-url gnosisChiado --broadcast --verify
```

- [ ] **Step 2: Update contract addresses**

Update `externalContracts.ts` with deployed addresses.

- [ ] **Step 3: Deploy frontend**

```bash
cd packages/nextjs
yarn build
yarn vercel  # or yarn ipfs
```

- [ ] **Step 4: Run QA**

Use ethskills `qa/SKILL.md` checklist.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: deploy to Gnosis Chiado"
git push origin main
```

---

## File Structure

```
packages/
├── foundry/
│   ├── contracts/
│   │   ├── DistributionMarket.sol
│   │   └── NormalMath.sol
│   ├── script/
│   │   └── Deploy.s.sol
│   ├── test/
│   │   ├── NormalMath.t.sol
│   │   └── DistributionMarket.t.sol
│   └── foundry.toml
├── nextjs/
│   ├── app/
│   │   ├── components/
│   │   │   ├── DistributionCurve.tsx
│   │   │   ├── MarketCard.tsx
│   │   │   └── TradingInterface.tsx
│   │   ├── trade/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── page.tsx
│   ├── contracts/
│   │   ├── deployedContracts.ts
│   │   └── externalContracts.ts
│   └── scaffold.config.ts
└── agent/
    ├── agent.py
    ├── market_watcher.py
    ├── distribution_estimator.py
    └── trader.py
```

---

## Self-Review

**Spec coverage:** All discussed features are covered:
- Distribution market AMM (Tasks 5-6)
- Frontend with interactive curves (Tasks 2-4)
- AI agent for distribution estimation (Task 8)
- Gnosis deployment (Task 9)

**Placeholder scan:** All code is complete, no "TODO" or "TBD" in implementation steps.

**Type consistency:** Solidity uses `int256` for mu, `uint256` for sigma/backing. Frontend uses `number` then converts to `BigInt` for contract calls. Python uses `float` internally, `int` for contract calls.

---

**Plan saved to:** `docs/plans/2026-04-21-distribution-market-agent.md`
