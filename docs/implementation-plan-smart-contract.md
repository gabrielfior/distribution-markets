# Distribution Market Smart Contract — Implementation Plan

> **Date:** 2026-04-24  
> **Goal:** Build `DistributionMarket.sol` with L2 norm cost, capital-weighted PDF aggregation for solvency, and full test coverage. Then integrate with frontend and deploy to testnet.  
> **Chain:** Gnosis Chiado testnet  
> **Based on:** Paradigm's Distribution Markets paper + parametric Normal approximation (Option A architecture)

---

## Architecture Overview

### Core Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Soleny via capital-weighted PDF average** | Exact algebraic identity: `Σ payout_i = Σ collateral_i`. No approximations. |
| **L2 norm for trade cost** | Prevents manipulation. More concentrated predictions cost more. Incentivizes truthful revelation. |
| **O(N) resolution loop** | One-time gas cost paid by resolver. Keeps trade gas cheap (~50k). |
| **Parametric Normal distributions** | Traders submit `(μ, σ)`. On-chain stores parameters, computes PDF at resolution. |
| **Log-normal for price markets** | Prices are bounded below by zero. Natural for BTC, ETH, SOL. |
| **PRB-Math for fixed-point math** | Battle-tested library (PaulRBerg). Replaces custom exp/ln/sqrt. Uses `SD59x18` / `UD60x18` types. |
| **Native ETH for collateral** | No ERC-20 dependency. Simpler UX (no approvals). Matches gas token on all EVM chains. |

### Key Formulas

**L2 norm of Normal PDF:**
```
L2(σ) = 1 / √(2 × σ × √π)
```
Computed via PRB-Math `UD60x18`: `l2 = 1e18 / sqrt(2e18 * sigma * sqrt(pi))`

**Minimum collateral (anti-manipulation):**
```
minCollateral(σ) = L2(σ) × MIN_BACKING / 1e18
```

**Trade cost (fee paid to protocol, in ETH):**
```
totalFee = baseFee + l2Fee
baseFee = collateral × BASE_FEE_BPS / 10000
l2Fee = collateral × L2(σ) × L2_MULTIPLIER / (L2(referenceσ) × 1e18)
```
Paid via `msg.value` alongside collateral. Net collateral = `msg.value - totalFee`.

**Market PDF at outcome (capital-weighted average):**
```
f_m(x*) = Σ (collateral_i × f_i(x*)) / Σ collateral_i
```

**Payout:**
```
payout_i = collateral_i × f_i(x*) / f_m(x*)
```

**Solvency proof:**
```
Σ payout_i = Σ [collateral_i × f_i(x*) / f_m(x*)]
           = [Σ collateral_i × f_i(x*)] / f_m(x*)
           = totalCollateral × f_m(x*) / f_m(x*)
           = totalCollateral
```

---

## Phase 1: Smart Contracts

### File Structure

```
packages/foundry/contracts/
├── DistributionMarket.sol      # Main contract: markets, trades, resolution, claims
└── NormalDistribution.sol      # Library: Normal/log-normal PDF, L2 norm (wraps PRB-Math)

packages/foundry/lib/
└── prb-math/                   # Git submodule: github.com/PaulRBerg/prb-math

packages/foundry/test/
├── NormalDistribution.t.sol    # Unit tests for PDF/L2 math
└── DistributionMarket.t.sol    # Integration tests: solvency, L2, ETH handling, edge cases

packages/foundry/script/
└── Deploy.s.sol                # Deployment script (no token needed)
```

---

### Task 1.1: Install PRB-Math

**Submodule:**
```bash
cd packages/foundry
git submodule add https://github.com/PaulRBerg/prb-math lib/prb-math
```

**Remappings** (add to `foundry.toml`):
```toml
remappings = [
    "prb-math/=lib/prb-math/src/",
]
```

**Why PRB-Math:**
- `SD59x18`: Signed 59.18 fixed-point (handles negative exponents, log-returns)
- `UD60x18`: Unsigned 60.18 fixed-point (handles prices, collateral)
- Built-in: `exp`, `ln`, `sqrt`, `pow`, `div`, `mul` with overflow protection
- Gas-optimized and extensively tested

---

### Task 1.2: NormalDistribution.sol

**Purpose:** Wrapper library around PRB-Math for Normal/log-normal PDF and L2 norm.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { SD59x18 } from "prb-math/SD59x18.sol";
import { UD60x18 } from "prb-math/UD60x18.sol";
import { exp as prbExp, ln as prbLn, sqrt as prbSqrt } from "prb-math/Common.sol";

library NormalDistribution {
    using SD59x18 for int256;
    using UD60x18 for uint256;

    /// @notice Normal PDF at point x given mu and sigma
    /// @param x Point (e.g., price × 1e18)
    /// @param mu Mean (× 1e18)
    /// @param sigma Standard deviation (× 1e18)
    /// @return pdf Value of PDF at x, scaled by 1e18
    function pdf(int256 x, int256 mu, uint256 sigma) internal pure returns (uint256);

    /// @notice Log-normal PDF at point x given mu_ln and sigma_ln
    /// @dev All inputs in log-space (ln(price) × 1e18)
    function logNormalPDF(uint256 x, int256 mu_ln, uint256 sigma_ln) internal pure returns (uint256);

    /// @notice L2 norm of a Normal PDF: 1 / sqrt(2 * sigma * sqrt(pi))
    /// @dev Returns value scaled by 1e18
    function l2Norm(uint256 sigma) internal pure returns (uint256);
}
```

**Key implementation notes:**
- `pdf()` exponent: `-0.5 * ((x - mu) / sigma)^2`. Compute with `SD59x18` for signed arithmetic.
- `pdf()` coefficient: `1 / (sigma * sqrt(2π))`. Use `UD60x18` for positive values.
- `l2Norm()` uses `UD60x18.sqrt()` and `UD60x18.div()`
- All inputs/outputs stay in 1e18 fixed-point to match PRB-Math conventions
- Gas: PRB-Math `exp` ~3k gas, `ln` ~2k gas, `sqrt` ~1k gas. Total PDF ~8k gas.

---

### Task 1.3: DistributionMarket.sol

**Purpose:** Main contract. Creates markets, accepts trades (payable, in ETH), resolves, pays out in ETH.

**State variables:**

```solidity
contract DistributionMarket {
    address public oracle;          // Can be changed by owner
    address public owner;

    uint256 public constant MIN_BACKING = 0.001 ether;  // ~$1-2 in ETH
    uint256 public constant BASE_FEE_BPS = 100;         // 1% base fee
    uint256 public constant L2_MULTIPLIER = 10e18;      // 10x L2 fee scaling
    uint256 public constant MAX_PAYOUT_MULTIPLIER = 100; // 100x payout cap
    uint256 public constant REFERENCE_SIGMA = 400e18;    // Reference σ for L2 fee baseline

    enum MarketType { SPOT_PRICE, MAX_PRICE, MIN_PRICE, CLOSE_PRICE }

    struct Market {
        string question;
        MarketType marketType;
        uint256 startTime;
        uint256 endTime;
        bool resolved;
        int256 outcome;         // Actual outcome value (price × 1e18, or ln(price) × 1e18)
        uint256 totalCollateral; // Total ETH collateral from traders
        uint256 totalFees;       // Protocol fees accumulated in ETH
        uint256 resolutionMarketPDF; // f_m(x*) cached at resolution
    }

    struct Position {
        int256 mu;
        uint256 sigma;
        uint256 collateral; // ETH amount (in wei)
        bool claimed;
    }

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => address[]) public marketTraders;
    mapping(uint256 => mapping(address => Position)) public positions;
}
```

**Functions to implement:**

#### `createMarket` (payable)
```solidity
function createMarket(
    string calldata question,
    MarketType marketType,
    uint256 startTime,
    uint256 endTime,
    int256 initialMu,
    uint256 initialSigma
) external payable returns (uint256 marketId);
```
- Validates: `endTime > startTime > block.timestamp`, `initialSigma > 0`
- Validates: `msg.value >= MIN_BACKING`
- Creator sends `msg.value` as initial ETH backing
- Market starts with `totalCollateral = msg.value`, no traders yet
- Creator does NOT get a position. Initial backing seeds the pool but is not a bet.
- Emits `MarketCreated`

#### `trade` (payable)
```solidity
function trade(
    uint256 marketId,
    int256 mu,
    uint256 sigma
) external payable;
```
- Validates market is open (`block.timestamp < endTime`, not resolved)
- Validates `sigma > 0`
- `collateral = msg.value` (ETH sent with transaction)
- Computes L2 norm: `l2 = NormalDistribution.l2Norm(sigma)`
- Enforces minimum collateral: `collateral >= (l2 * MIN_BACKING) / 1e18`
- Computes fees:
  - `baseFee = (collateral * BASE_FEE_BPS) / 10000`
  - `referenceL2 = NormalDistribution.l2Norm(REFERENCE_SIGMA)`
  - `l2Fee = (collateral * l2 * L2_MULTIPLIER) / (referenceL2 * 1e18)`
  - `totalFee = baseFee + l2Fee`
- Validates: `collateral > totalFee` (stake must exceed fees)
- Net collateral added to pool: `netCollateral = collateral - totalFee`
- Adds `netCollateral` to `market.totalCollateral`
- Adds `totalFee` to `market.totalFees`
- Stores/updates trader's `Position` with `netCollateral`
- If new trader, push to `marketTraders[marketId]`
- Emits `TradeExecuted`

#### `resolve`
```solidity
function resolve(uint256 marketId, int256 outcome) external;
```
- Only callable by `oracle`
- Validates: `block.timestamp >= endTime`, not already resolved
- Stores `outcome`
- **O(N) loop:** Iterates all traders, computes `pdf(outcome, pos.mu, pos.sigma)` for each, accumulates weighted sum:
  ```solidity
  weightedPDFSum += (pos.collateral * traderPDF) / 1e18;
  ```
- Computes and caches: `resolutionMarketPDF = weightedPDFSum / totalCollateral`
- Sets `resolved = true`
- Emits `MarketResolved`

#### `claim`
```solidity
function claim(uint256 marketId) external;
```
- Validates market is resolved
- Validates trader has unclaimed position (`pos.collateral > 0 && !pos.claimed`)
- Computes trader's PDF at outcome
- Computes payout: `payout = (pos.collateral * traderPDF) / resolutionMarketPDF`
- Enforces cap: `if (payout > pos.collateral * MAX_PAYOUT_MULTIPLIER) payout = pos.collateral * MAX_PAYOUT_MULTIPLIER`
- Marks position as claimed
- **Sends ETH:** `payable(msg.sender).transfer(payout)`
- Emits `PayoutClaimed`

#### `getMarket` / `getPosition` (view functions)

#### `withdrawFees` (owner only)
- Owner can withdraw accumulated `totalFees` (ETH) from a market
- `payable(owner).transfer(market.totalFees)`
- Resets `market.totalFees = 0`

#### `receive() external payable`
- Allow contract to receive ETH (needed for initial backing and trades)

---

### Task 1.3: Foundry Configuration

Update `packages/foundry/foundry.toml`:
```toml
[rpc_endpoints]
gnosis = "https://rpc.gnosischain.com"
gnosisChiado = "https://rpc.chiadochain.net"

[etherscan]
gnosis = { key = "${GNOSISSCAN_API_KEY}", url = "https://api.gnosisscan.io/api" }
gnosisChiado = { key = "${GNOSISSCAN_API_KEY}", url = "https://blockscout.chiadochain.net/api" }
```

---

## Phase 2: Tests

### Task 2.1: NormalDistribution.t.sol

**Setup:**
- No contract deployment needed (library tests)
- Use `vm.expectCall` or direct library calls via a test harness contract

Test cases:
1. `testPDFAtMean` — At x=μ, PDF = 1/(σ√(2π)). Verify within 5% tolerance.
2. `testPDFDecreasesWithDistance` — PDF(μ) > PDF(μ+σ) > PDF(μ+2σ)
3. `testPDFSymmetry` — PDF(μ+d) == PDF(μ-d)
4. `testL2Norm` — L2(σ=400) > L2(σ=800). Narrower = higher L2.
5. `testL2NormFormula` — Verify L2(400e18) ≈ 0.001 × 1e18
6. `testLogNormalPDF` — Peak is at e^(μ - σ²), not at μ
7. `testPRBMathIntegration` — Verify exp/ln/sqrt from PRB-Math produce expected values

### Task 2.2: DistributionMarket.t.sol

**Setup:**
- Deploy DistributionMarket (no token needed)
- Fund test accounts with ETH: `vm.deal(alice, 100 ether)`, etc.

**Test cases:**

1. `testCreateMarketPayable` — Verify market creation, parameters, ETH backing stored
2. `testTradeStoresPosition` — Verify position storage, totalCollateral update, ETH balance change
3. `testTradeMinimumCollateral` — Try σ=10 with 0.0001 ETH. Should revert (below L2 minimum).
4. `testTradeL2Fee` — Verify L2 fee increases as σ decreases. Check `totalFees` accumulation.
5. `testTradeUpdatesExistingPosition` — Same trader trades twice. Old position replaced, collateral adjusted, net ETH tracked.
6. `testResolveComputesMarketPDF` — Oracle resolves. Verify `resolutionMarketPDF` is set correctly.
7. `testClaimPayoutETH` — Trader claims. Verify payout = collateral × (traderPDF / marketPDF). Check ETH balance increase.
8. `testSolvencyTwoTraders` — Alice and Bob trade. Resolve. Verify `alicePayout + bobPayout <= totalCollateral` (plus initial backing).
9. `testSolvencyManyTraders` — 10 traders with random μ, σ. Resolve. Verify sum of payouts <= totalCollateral + initial backing.
10. `testMaxPayoutCap` — Trader with extreme σ gets capped at 100×
11. `testCannotTradeAfterExpiry` — Revert if `block.timestamp >= endTime`
12. `testCannotResolveBeforeExpiry` — Revert if `block.timestamp < endTime`
13. `testCannotClaimTwice` — Revert on double claim
14. `testLogNormalMarket` — Create market with log-normal type, trade ln-space values, resolve with actual price
15. `testWithdrawFees` — Owner withdraws fees. Verify ETH transfer and `totalFees` reset.
16. `testTradeInsufficientETH` — Send less ETH than required (msg.value < collateral needed). Should revert or handle gracefully.

---

## Phase 3: Frontend Integration

### Task 3.1: Update TradingInterface.tsx

**Add collateral input:**
- New slider or number input: "Stake (ETH)"
- Minimum automatically computed from σ: `minStake = l2Norm(σ) * MIN_BACKING / 1e18`
- Show breakdown:
  - Stake: X ETH
  - Base fee (1%): Y ETH
  - L2 fee: Z ETH
  - **Total to send:** (X + Y + Z) ETH

**Add L2 visualization:**
- Show how L2 fee changes as σ changes
- When user narrows σ, highlight: "Higher confidence = higher fee"

**Update payout simulation:**
- Payout = `stake × (yourPDF / marketPDF)` (in ETH)
- Show this dynamically as user moves outcome slider

### Task 3.2: Contract ABI Integration

Update `packages/nextjs/contracts/externalContracts.ts` with:
- DistributionMarket ABI (no token ABI needed)

### Task 3.3: Two-Button Flow (No Approval Needed)

With ETH as collateral, the flow is simpler:

1. **Review and Send ETH** — Frontend computes total ETH to send (`stake + baseFee + l2Fee`), user confirms in wallet
2. **Execute trade** — Transaction calls `trade(marketId, mu, sigma)` with `value: totalETH`
3. Show transaction status and confirmation

No token approval step needed. Wallet handles ETH transfer natively.

### Task 3.4: Market List Page

- Fetch `marketCount`
- For each market, show: question, end date, totalCollateral (in ETH), number of traders
- Link to trade page

---

## Phase 4: Deployment

### Task 4.1: Deploy DistributionMarket

```bash
source .env
forge script script/Deploy.s.sol --rpc-url gnosisChiado --broadcast --verify
```

**Deploy script** — no token constructor argument needed:
```solidity
contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        DistributionMarket market = new DistributionMarket();
        vm.stopBroadcast();
        console.log("DistributionMarket deployed at:", address(market));
    }
}
```

### Task 4.2: Update Frontend Config

Add deployed address to `externalContracts.ts`.

### Task 4.3: Create Test Market

Use frontend or `cast` (send ETH with `--value`):
```bash
cast send $MARKET_ADDRESS "createMarket(string,uint8,uint256,uint256,int256,uint256)" \
  "ETH price on May 1, 2026" \
  0 \  # SPOT_PRICE
  $(date +%s) \
  $(date -v+30d +%s) \
  3200000000000000000000 \  # mu = 3200e18
  400000000000000000000 \   # sigma = 400e18
  --value 0.01ether \
  --rpc-url gnosisChiado \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Task 4.4: QA Checklist

- [ ] Contract deploys without errors
- [ ] Can create market (sends ETH)
- [ ] Can trade with valid μ, σ, sending ETH
- [ ] L2 minimum collateral enforces correctly (try σ=10 with 0.00001 ETH, should revert)
- [ ] L2 fee increases as σ decreases
- [ ] Resolution O(N) loop works with 5+ traders
- [ ] Payouts sum to ≤ totalCollateral + initial backing
- [ ] Max payout cap triggers correctly
- [ ] Cannot trade after expiry
- [ ] Cannot double-claim
- [ ] Frontend displays all data correctly
- [ ] Two-button flow works (review ETH amount → execute trade)
- [ ] Owner can withdraw fees
- [ ] Contract ETH balance is always ≥ totalCollateral + totalFees

---

## L2 Norm: Detailed Specification

### Why We Need It (Recap)

| Problem | Without L2 | With L2 |
|---------|-----------|---------|
| **Soleny** | Already guaranteed by PDF average | Still guaranteed |
| **Manipulation** | Trader submits σ=0.1 with $1, wins 100×+ if lucky | σ=0.1 requires $100+ stake. Attack unprofitable. |
| **Truthful revelation** | Incentive to lie: always submit tiny σ | Cost scales with concentration. Honest σ is optimal. |
| **Market quality** | Consensus dominated by noise | Extreme predictions are expensive, consensus is stable |

### Implementation Details

**L2 Norm Formula (using PRB-Math UD60x18):**
```solidity
import { UD60x18 } from "prb-math/UD60x18.sol";
import { sqrt as prbSqrt, div as prbDiv } from "prb-math/Common.sol";

function l2Norm(uint256 sigma) internal pure returns (uint256) {
    UD60x18 sigmaUD = UD60x18.wrap(sigma);
    UD60x18 two = UD60x18.wrap(2e18);
    UD60x18 sqrtPi = UD60x18.wrap(1_772_453_850_905_516_027); // sqrt(pi) × 1e18
    
    // denominator = sqrt(2 * sigma * sqrt(pi))
    UD60x18 denominator = prbSqrt(two.mul(sigmaUD).mul(sqrtPi));
    
    // L2 = 1e18 / denominator
    UD60x18 one = UD60x18.wrap(1e18);
    return UD60x18.unwrap(prbDiv(one, denominator));
}
```

**Example values:**

| σ | L2 Norm (×1e18) | Min Collateral | L2 Fee (for $1000 stake) |
|---|----------------|----------------|-------------------------|
| 400 | 998,000 | $1.00 | $10.00 |
| 200 | 1,412,000 | $1.41 | $14.12 |
| 100 | 1,997,000 | $2.00 | $19.97 |
| 50 | 2,824,000 | $2.82 | $28.24 |
| 10 | 6,315,000 | $6.32 | $63.15 |
| 1 | 19,970,000 | $19.97 | $199.70 |
| 0.1 | 63,150,000 | $63.15 | $631.50 |

**Notice:** As σ gets smaller (more confident), both minimum stake AND fee increase quadratically. A σ=0.1 prediction costs over $600 in fees alone on a $1000 stake.

---

## Gas Estimates

| Operation | Estimated Gas | Notes |
|-----------|--------------|-------|
| `createMarket` | ~120,000 | One-time, no ERC20 calls |
| `trade` (new trader) | ~70,000 | SSTORE + PRB-Math PDF/L2 (~8k gas) |
| `trade` (update) | ~45,000 | SSTORE for existing position |
| `resolve` | ~5,000 × N | N = number of traders. 100 traders = ~500k gas |
| `claim` | ~30,000 | One SLOAD + ETH transfer (cheaper than ERC20) |

**Gnosis Chiado:** 500k gas ≈ $0.02-$0.05. Acceptable for MVP.

**ETH vs ERC20 savings:** ~15k gas per trade (no `transferFrom`/`approve`), ~10k gas per claim (no `transfer` call).

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Resolution gas exceeds block limit** | Cap max traders per market (e.g., 500). Or implement batch resolution. |
| **Rounding errors in PDF** | PRB-Math uses 1e18 precision. Cap payout at 100× to prevent dust manipulation. |
| **Oracle failure** | Owner can change oracle address. Multi-sig recommended for mainnet. |
| **L2 norm overflow** | `sigma` has practical minimum (1e9 = 10^-9). `l2Norm` maxes at ~6e27, fits in uint256. PRB-Math has overflow guards. |
| **Front-running resolution** | Resolution is one-shot. No trading after expiry. Oracle commits hash then reveals. |
| **ETH reentrancy on claim** | Use `transfer` (2300 gas limit) or `call` with reentrancy guard. `transfer` is safest for simple payouts. |
| **Contract balance < obligations** | Invariant check: `address(this).balance >= totalCollateral + totalFees` always. Test in Foundry. |

---

## Success Criteria

1. **Soleny invariant holds** for all test cases (`sum(payouts) <= totalCollateral + initial backing`)
2. **L2 norm prevents σ=1 manipulation** with <0.02 ETH stake
3. **Trade gas < 80k** for updates (ETH is cheaper than ERC20)
4. **Resolution gas < 1M** for 100 traders
5. **All Foundry tests pass** (including PRB-Math integration)
6. **Frontend can create, trade, resolve, claim end-to-end** with MetaMask ETH flow
7. **Contract balance invariant** passes: `balance >= totalCollateral + totalFees` at all times

---

*Next step: Implement Task 1.1 (Install PRB-Math), Task 1.2 (NormalDistribution.sol), and Task 1.3 (DistributionMarket.sol).*
