# Distribution Markets vs. Touch Binaries: Analysis & Design Alternatives

> **Date:** 2026-04-24  
> **Context:** Analysis of Polymarket's discrete bucket/touch binary markets and how continuous distribution markets (based on Paradigm's paper) can replace or improve them.  
> **Reference markets studied:**
> - https://polymarket.com/event/solana-price-on-april-23
> - https://polymarket.com/event/what-price-will-bitcoin-hit-april-20-26

---

## 1. The Two Market Structures

### 1A. Single-Point Discrete Bucket Market (Solana)
**Question:** *"Solana price on April 23?"*

**Polymarket implementation:**
- 11 discrete price buckets: `<$40`, `$40-50`, `$50-60`, ..., `$120-130`, `>$130`
- Each bucket is an independent binary market (YES/NO shares)
- Exactly one bucket resolves YES, all others resolve NO
- Price at noon ET on the specified date determines the winning bucket
- Liquidity is fragmented across 11 separate pools
- **Current volume:** ~$11,234

**Key structural properties:**
- Single outcome at a fixed timestamp
- Mutually exclusive outcomes (only one bucket wins)
- Traders bet on *where* the price will land

### 1B. Touch Binary Market (Bitcoin)
**Question:** *"What price will Bitcoin hit April 20-26?"*

**Polymarket implementation:**
- 14 separate binary markets, each with a strike price:
  - `↑ $88,000`, `↑ $86,000`, `↑ $84,000`, `↑ $82,000`, `↑ $80,000` (upside touches)
  - `↓ $72,000`, `↓ $70,000`, `↓ $68,000`, `↓ $66,000`, `↓ $64,000`, `↓ $62,000`, `↓ $60,000` (downside touches)
- Each market resolves YES if BTC hits that strike at *any point* during the window
- **Multiple outcomes can resolve YES simultaneously** (if BTC hits both $80k and $82k, both are YES)
- Each strike is an independent liquidity pool
- **Current volume:** ~$555,663

**Key structural properties:**
- Time window (not a single point in time)
- Path-dependent resolution (depends on the entire price path, not just one point)
- Non-mutually-exclusive outcomes (many can resolve YES)
- Upside and downside strikes are logically related but traded independently
- Traders bet on *whether* a price level is touched, not *where* it lands

---

## 2. Why Distribution Markets Replace the Solana Market Naturally

The Solana market is a **single-point price prediction** with mutually exclusive buckets. A distribution market replaces this elegantly:

| Aspect | Polymarket (Discrete) | Distribution Market |
|--------|----------------------|---------------------|
| Market count | 11 separate binary pools | 1 continuous AMM |
| Trader expression | Pick one bucket | Submit `Normal(μ, σ)` |
| Liquidity | Fragmented 11 ways | Concentrated in 1 pool |
| Granularity | Fixed bucket widths (~$10) | Infinite (any real number) |
| Information | Probability mass in each bucket | Full PDF over all prices |
| Confidence | Can't express "unsure between $80-90" | σ naturally captures uncertainty |
| Edge cases | Exact boundary rules needed | Smooth PDF at all points |

**Implementation:** Use the existing `DistributionMarket.sol` with `MarketType = SPOT_PRICE` and resolution at a single timestamp.

---

## 3. The Bitcoin Touch Market: Structural Differences

The Bitcoin market is **fundamentally different** and cannot be replaced by a simple 1:1 mechanical substitution. Here's why:

### 3A. Multiple Simultaneous YES Outcomes
In the Solana market, if the price is $85, only the `$80-90` bucket wins. In the Bitcoin market, if BTC hits $82k, then the `$80k`, `$78k`, `$76k`, `$74k`, `$72k`, etc. markets *all* resolve YES (assuming it also hit those levels). This is a **cumulative** structure, not a **categorical** one.

### 3B. Path Dependence
The touch market depends on the **entire price path** during the week, not just the price at expiration. Even if BTC closes at $79k on April 26, if it hit $82k on April 22, the `↑ $82,000` market resolves YES.

### 3C. Liquidity Fragmentation Is Extreme
With 14 independent pools, a trader who believes BTC will be volatile must trade across many strikes. A view like "BTC will trade in a $70k-$85k range" requires 8 separate trades. There's no way to express a unified view efficiently.

### 3D. Asymmetric Strikes
The upside strikes ($80k, $82k, $84k, $86k, $88k) and downside strikes ($72k, $70k, $68k, ...) are spaced differently and traded independently, even though they're driven by the same underlying volatility process.

---

## 4. Four Alternative Designs for Replacing Touch Binaries

### Alternative 1: Direct Replacement — Distribution over the Maximum Price
**Question:** *"What will Bitcoin's highest price be during April 20-26?"*

**Mechanics:**
- Traders submit `Normal(μ, σ)` predicting the maximum BTC price during the window
- Oracle reports the highest 1-minute candle "High" during the date range
- Payout: `cost × (your_PDF(outcome) / market_PDF(outcome))` (existing mechanism)
- Can also run a paired market for the *minimum* price

**Advantages over Polymarket:**
- **One market, infinite granularity** — replaces 14 binary pools with 1 continuous AMM
- **No liquidity fragmentation** — all trading concentrates in a single pool
- **Expresses confidence** — σ captures uncertainty about weekly volatility
- **Composable** — from any Normal distribution, you can derive:
  - `P(touch ≥ $X) = 1 - CDF(X)` (the exact information Polymarket's touch binaries reveal)
  - Expected maximum, confidence intervals, etc.

**Code changes needed:**
- Minimal. Add a `MarketType` enum to `DistributionMarket.sol`:
  ```solidity
  enum MarketType { SPOT_PRICE, MAX_PRICE, MIN_PRICE, CLOSE_PRICE }
  ```
- Frontend: widen default σ (weekly volatility >> single-point volatility)
- Oracle adapter: fetch max/min over window instead of spot at timestamp

**Limitations:**
- Doesn't capture downside risk in the same market (need a paired MIN market)
- Doesn't capture path information (just the extreme value)

---

### Alternative 2: Joint Distribution over (High, Low, Close)
**Question:** *"What will Bitcoin's price range be during April 20-26?"*

**Mechanics:**
- Traders submit a **multivariate Normal** distribution:
  - `μ = [μ_high, μ_low, μ_close]` (3 means)
  - `Σ` = 3×3 covariance matrix (captures correlations)
- Oracle reports the actual `(high, low, close)` tuple at the end of the window
- Payout: multivariate PDF ratio at the realized vector

**What traders can express:**
- "BTC will be volatile but end flat": wide σ for high/low, narrow σ for close, negative covariance
- "BTC will trend up steadily": all μ shift up, high and close positively correlated
- "BTC will crash then recover": low and close negatively correlated

**Advantages:**
- Captures the entire price path summary in one trade
- Replaces both upside and downside touch markets simultaneously
- Correlations are tradeable (a new dimension of alpha)

**Code changes needed:**
- `DistributionMarket.sol`: `mu` becomes `int256[]`, `sigma` becomes `uint256[]` + covariance handling
- `NormalMath.sol`: multivariate PDF:
  ```
  PDF(x) = (2π)^(-k/2) |Σ|^(-1/2) exp(-½ (x-μ)^T Σ^(-1) (x-μ))
  ```
- L2 norm invariant: becomes Frobenius norm or similar over covariance matrix
- Frontend: 3 μ sliders + covariance matrix UI (or simplified correlation slider)

**Limitations:**
- Higher complexity for casual traders
- On-chain matrix operations are expensive
- Need to constrain Σ to be positive semi-definite

---

### Alternative 3: Path-Dependent Stochastic Process Market
**Question:** *"What will Bitcoin's price path look like during April 20-26?"*

**Mechanics:**
- Traders submit parameters of a stochastic process, e.g.:
  - Geometric Brownian Motion: drift `μ_drift`, volatility `σ_vol`
  - Or: mean-reverting Ornstein-Uhlenbeck parameters
  - Or: jump-diffusion parameters
- Oracle provides the actual 1-minute candle time series
- Payout based on **log-likelihood** of the realized path under trader's process vs. market's consensus process

**What traders can express:**
- "BTC will trend up with low vol" → positive drift, low σ
- "BTC will chop sideways with high vol" → zero drift, high σ
- "BTC will gap up on news" → jump-diffusion with high jump intensity

**Derived probabilities:**
- From GBM parameters, you can analytically compute:
  - Probability of touching any strike
  - Distribution of maximum/minimum
  - Distribution of close price
  - Expected time spent above/below a level

**Code changes needed:**
- Major redesign. Current parametric (μ, σ) over price becomes parametric (μ_drift, σ_vol) over returns
- Payout function: compute path log-likelihood (sum of log-PDFs for each return)
- Computationally heavy — likely needs ZK proofs or optimistic verification
- Oracle must provide full path data, not just a scalar

**Limitations:**
- Very high complexity
- Path log-likelihood computation is expensive on-chain
- Most traders don't think in stochastic process parameters

---

### Alternative 4: Cumulative Touch Probability Curve
**Question:** *"What is the probability that Bitcoin touches $X during April 20-26?"* (for all X)

**Mechanics:**
- Instead of a parametric Normal, traders submit a **non-parametric cumulative hazard function**:
  - `H(x) = P(touch ≥ x)` for upside
  - `H(x)` is monotonically decreasing from 1 to 0 as x increases
  - Or equivalently, submit a PDF `f(x)` over the maximum price
- The AMM maintains a consensus curve `H_market(x)`
- Resolution: Oracle reports the highest touched strike. Payout is computed by evaluating the trader's curve at the realized outcome.

**Advantages:**
- Directly models what the Polymarket touch market is trying to discover
- A trader's position is a full curve, not just two numbers
- Can use L2 norm invariants over function space (true to Paradigm's paper)
- No parametric assumptions (doesn't force Normal shape)

**Code changes needed:**
- Move from parametric to **discretized function** representation
- Discretize price axis into N points (e.g., 50 levels from $50k to $100k)
- Trader submits a vector of length N (probabilities or PDF values)
- AMM uses vector AMM mechanics (similar to existing L2 norm but in N dimensions)
- Payout = `Σ (your_f(x_i) / market_f(x_i))` weighted by realized outcome proximity

**Limitations:**
- High dimensional (N = 50+ parameters per trade)
- Gas costs scale with N
- Harder to visualize and reason about than a simple bell curve

---

## 5. Comparative Summary

| Approach | Complexity | Info Efficiency | Replaces Polymarket? | Fits Current Codebase? | Best For |
|----------|-----------|-----------------|---------------------|------------------------|----------|
| **Alt 1: Max Price Distribution** | Low | High | Partially | ✅ Minimal changes | Quick MVP, immediate improvement |
| **Alt 2: Joint (High, Low, Close)** | Medium | Very High | Fully | 🟡 Moderate changes | Sophisticated traders, range views |
| **Alt 3: Path/GBM Market** | Very High | Extreme | Fully + more | 🔴 Major redesign | DeFi quants, volatility trading |
| **Alt 4: Hazard Curve** | High | High | Directly | 🟡 New math library | Maximum flexibility, no parametric bias |

---

## 6. Recommended Roadmap

### Phase 1: Alternative 1 (Immediate)
1. Add `MarketType` enum to `DistributionMarket.sol`
2. Create a "weekly BTC max price" market using existing code
3. Add **implied touch probability** UI to frontend:
   - Below the bell curve, show: *"Implied probability of touching $88k: 12%"*
   - Compute as `1 - NormalCDF(strike)` from the user's distribution
   - This bridges continuous markets to discrete-thinking users

### Phase 2: Alternative 1 Enhanced (Short-term)
4. Support **paired markets** (MAX and MIN for the same window) displayed together
5. Add **log-normal** option for price markets (prices can't go negative):
   - Trader sets μ and σ over `ln(price)`
   - Display as log-normal curve
   - Prevents absurd negative-price tail probabilities

### Phase 3: Alternative 2 (Medium-term)
6. Extend to multivariate distributions for (High, Low, Close)
7. Start with simplified correlation structure (single correlation coefficient, not full Σ matrix)

### Phase 4: Alternative 4 (Long-term)
8. If demand exists, build non-parametric curve markets for maximum flexibility

---

## 7. Key Insights for Implementation

### 7A. Log-Normal vs. Normal for Prices
Prices are bounded below by zero. A Normal distribution assigns probability mass to negative prices, which is nonsensical for BTC. **Log-normal is the correct model for price levels.** Implementation:
- Trader sets `μ_ln` and `σ_ln` over `ln(price)`
- Display the transformed log-normal curve
- PDF: `f(x) = 1/(x·σ·√(2π)) · exp(-(ln(x)-μ)²/(2σ²))`
- All existing AMM mechanics work with this change

### 7B. Implied Touch Probability as a UI Bridge
Polymarket users think: *"What's the chance BTC hits $82k?"*
Distribution market users think: *"Where's the max price, and how uncertain am I?"*

To bridge this, compute and display:
```
P(touch ≥ X) = P(max ≥ X) = 1 - CDF_Normal(X; μ, σ)
```

For each major strike ($80k, $82k, etc.), show the implied probability. This turns a continuous market into a "better version" of the discrete touch binaries — all information is there, just computed from the curve rather than traded in separate pools.

### 7C. The Oracle Problem
Touch markets need different oracle logic than spot markets:
- **Spot:** Read one price at one timestamp
- **Max/Min:** Scan all 1-minute candles in the window and find extreme
- **Path:** Provide full time series

The oracle adapter must be configurable per `MarketType`.

### 7D. Why Distribution Markets Win on Liquidity
Polymarket's $555k volume on the Bitcoin touch market is split across 14 pools (~$40k average per pool). A distribution market concentrates all $555k into **one AMM**. For the same total volume:
- Tighter spreads (deeper liquidity per unit of price)
- Lower slippage
- Better price discovery
- More capital efficiency

---

## 8. Open Questions for Future Research

1. **How do you handle multi-asset correlation?** E.g., a market on BTC max and ETH max simultaneously
2. **Can you build options-like payoffs from distribution markets?** A trader who buys a "max ≥ $80k" view is effectively buying a digital call — can this be composed into vanilla call/put structures?
3. **What is the optimal discretization for non-parametric markets?** Fixed grid, adaptive grid, or basis function expansion?
4. **How do you prevent manipulation in max/min oracles?** Single-exchange oracles (Binance) are vulnerable to flash wicks. Multi-exchange TWAP of highs?
5. **Can AMM LP positions be separated from directional trading?** Currently, the AMM *is* the counterparty. Can external LPs provide liquidity and earn fees?

---

*Reference: Distribution Markets (2024) — https://www.paradigm.xyz/2024/12/distribution-markets*
