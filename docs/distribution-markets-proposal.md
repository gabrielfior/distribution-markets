# Distribution Markets: A Proposal for Continuous Prediction Markets

> **For review by prediction market experts**  
> **Date:** April 2026  
> **Authors:** Distribution Markets Team  
> **Status:** Design review — seeking feedback on mechanism, incentives, and implementation

---

## Abstract

We propose a new prediction market primitive called **Distribution Markets**, heavily inspired by Paradigm's [*Distribution Markets*](https://www.paradigm.xyz/2024/12/distribution-markets) paper (December 2024). In a Distribution Market, traders do not buy discrete binary shares ("Will X happen? Yes/No"). Instead, they submit a full **probability distribution** over a continuous outcome space — for example, a Normal distribution `N(μ, σ)` predicting the price of ETH on May 1.

The market maintains a **capital-weighted consensus distribution**. At resolution, each trader's payout is proportional to how much more probability density they assigned to the realized outcome compared to the market consensus. This design eliminates liquidity fragmentation, allows traders to express confidence (via σ), and produces a richer information signal than any discrete bucket market.

This document outlines the problem with current discrete markets, our proposed mechanism, its mathematical guarantees, and open questions where we seek expert feedback.

---

## 1. The Problem: Discrete Markets Are Informationally Impoverished

Current prediction markets like Polymarket overwhelmingly use **discrete bucket structures**. Consider two recent markets:

### Example A: Single-Point Bucket Market
**"Solana price on April 23?"** ([Polymarket](https://polymarket.com/event/solana-price-on-april-23))

- 11 discrete price buckets: `<$40`, `$40-50`, `$50-60`, ..., `$120-130`, `>$130`
- Each bucket is an independent binary market with its own liquidity pool
- Only one bucket resolves YES
- **$11,234 in volume split across 11 pools**

### Example B: Touch Binary Market
**"What price will Bitcoin hit April 20-26?"** ([Polymarket](https://polymarket.com/event/what-price-will-bitcoin-hit-april-20-26))

- 14 separate binary markets, each with a strike price (`↑ $88k`, `↑ $86k`, `↓ $72k`, etc.)
- Multiple outcomes can resolve YES simultaneously (if BTC hits $82k, then $80k, $78k, etc. also resolve YES)
- **$555,663 in volume split across 14 pools**

### Why This Is Suboptimal

| Problem | Discrete Market | What We Lose |
|---------|----------------|--------------|
| **Liquidity fragmentation** | Each bucket/strike is its own pool | Tight spreads require deep pools; fragmentation dilutes liquidity |
| **Granularity ceiling** | Fixed bucket widths (e.g., $10) | Traders who think ETH will be $3,247.63 cannot express that precision |
| **No confidence signal** | You either buy Yes or No | A trader who is "80% sure ETH is $3,200" and one who is "51% sure" make the exact same trade |
| **Non-composable** | 11 separate binary markets | You cannot derive "P(ETH > $3,500)" from the market without summing bucket prices |
| **Path dependence ignored** | Touch binaries are independent | A view like "BTC will be volatile but end flat" requires 8+ separate trades |
| **Edge case complexity** | "If exactly on boundary, round up" | Bucket boundaries are arbitrary and create resolution disputes |

In short: **discrete buckets force traders to approximate their beliefs, fragment liquidity, and discard the rich information contained in a full distribution.**

---

## 2. What Is a Distribution Market?

A Distribution Market is a prediction market where:

1. **The outcome space is continuous** (e.g., ETH price, temperature, vote share)
2. **Traders submit probability distributions**, not discrete bets
3. **The market maintains a consensus distribution** as a capital-weighted average of all traders' views
4. **Payouts are scoring-rule based**: you earn more if your distribution assigns higher probability density to the realized outcome than the market consensus did

### The Core Mechanic (Parametric Version)

For our MVP, traders submit a **Normal distribution** parameterized by:
- **μ (mean):** Where they think the price will land
- **σ (standard deviation):** How confident they are (narrow = confident, wide = uncertain)

The market's consensus distribution `f_m(x)` is the capital-weighted average of all individual PDFs:

```
f_m(x) = Σ (collateral_i × f_i(x)) / Σ collateral_i
```

At resolution, if the outcome is `x*`, trader `i`'s payout is:

```
payout_i = collateral_i × f_i(x*) / f_m(x*)
```

### Solvency Guarantee

The payout formula has a remarkable property: **the sum of all payouts exactly equals the total collateral in the pool.**

**Proof:**
```
Σ payout_i = Σ [collateral_i × f_i(x*) / f_m(x*)]
           = [Σ collateral_i × f_i(x*)] / f_m(x*)
           = totalCollateral × f_m(x*) / f_m(x*)
           = totalCollateral
```

This is not an approximation. It is an exact algebraic identity. **The contract can never become insolvent** as long as `f_m(x*)` is computed as the capital-weighted average.

### The L2 Norm: Paying for Confidence

Solvency alone is not enough. Without additional constraints, a trader could submit an absurdly narrow distribution (σ = 0.01) with $1 of collateral, essentially buying a lottery ticket that pays 100×+ if they get lucky.

We adopt Paradigm's insight: **the cost to trade should scale with the L2 norm of the distribution**, which measures how "concentrated" the probability mass is.

For a Normal PDF, the L2 norm is:

```
L2(σ) = 1 / √(2 × σ × √π)
```

**Key property:** As σ → 0 (more confident), L2 → ∞. A near-delta-function costs infinite money to submit.

In our design, traders pay a **protocol fee** that scales with L2(σ):

```
totalFee = baseFee + l2Fee
baseFee  = collateral × 1%
l2Fee    = collateral × L2(σ) / L2(σ_reference) × multiplier
```

This creates three effects:
1. **Anti-manipulation:** Extreme confidence is expensive
2. **Truthful revelation:** Traders are incentivized to report their true σ, not fake overconfidence
3. **Market quality:** The consensus distribution is stable and not dominated by noise

---

## 3. Advantages Over Discrete Markets

### 3A. Infinite Granularity
A trader who thinks ETH will be $3,247.63 simply submits μ = 3247.63. There are no bucket boundaries. The market price at every real number is simultaneously discoverable.

### 3B. No Liquidity Fragmentation
All trading concentrates in a single AMM. With the same $555k volume as the Bitcoin touch market, a Distribution Market has:
- Deeper liquidity at every price point
- Tighter spreads
- Better price discovery

### 3C. Confidence Is Tradeable
σ is not a side effect — it's a **first-class tradeable parameter**. A trader who believes "ETH will be near $3,200 but I'm very uncertain" submits a wide σ. A trader who believes "ETH will be exactly $3,200" submits a narrow σ and pays more for that precision. The market explicitly prices uncertainty.

### 3D. Composable Information
From any market distribution, you can derive:
- Probability of any event: `P(ETH > $3,500) = 1 - CDF(3500)`
- Expected value, confidence intervals, tail risks
- Touch probabilities (for path-dependent questions)

This replaces an entire grid of binary markets with a single curve.

### 3E. Smoother Resolution
No arbitrary bucket boundaries. No "if exactly on boundary, round up" rules. The realized outcome maps smoothly to a payout via the PDF ratio.

### 3F. Path-Dependent Events (Future Work)
For touch binaries ("Will BTC hit $X during the week?"), a Distribution Market over the **maximum price** during the window naturally encodes touch probabilities:

```
P(max ≥ X) = 1 - CDF_market(X)
```

A single market over the maximum replaces 14 separate touch binary pools.

---

## 4. How It Works: Technical Overview

### 4A. Trader Flow

1. **Create market** (anyone): Specify question, outcome type (spot price, max, min, close), time window, initial μ and σ. Send ETH as initial pool backing.
2. **Trade** (traders): Submit μ, σ, and ETH collateral. The contract:
   - Validates σ > 0
   - Enforces `collateral ≥ L2(σ) × MIN_BACKING` (anti-manipulation)
   - Computes base fee + L2 fee
   - Stores net collateral in the trader's position
   - Adds trader to the market's trader list
3. **Resolve** (oracle): After expiry, oracle reports the actual outcome. The contract:
   - Loops through all traders
   - Computes `f_i(x*)` for each
   - Calculates and caches `f_m(x*) = weighted average`
4. **Claim** (traders): Each trader calls claim. The contract:
   - Computes `payout = collateral × f_i(x*) / f_m(x*)`
   - Sends ETH to trader

### 4B. On-Chain Math

We use [**PRB-Math**](https://github.com/PaulRBerg/prb-math) (PaulRBerg) for fixed-point arithmetic. PRB-Math provides `SD59x18` (signed 59.18 fixed-point) and `UD60x18` (unsigned 60.18 fixed-point) types with gas-optimized `exp`, `ln`, `sqrt`, and `pow`.

**Normal PDF:**
```solidity
pdf(x, mu, sigma) = 1/(sigma * sqrt(2π)) * exp(-0.5 * ((x - mu)/sigma)^2)
```

All values scaled by `1e18`. PRB-Math handles overflow and precision automatically.

### 4C. Log-Normal for Prices

Prices cannot be negative. For BTC, ETH, SOL markets, traders submit distributions over `ln(price)`, and the market displays a **log-normal** curve. This prevents the absurd tail where the distribution assigns probability to negative prices.

---

## 5. Relationship to Paradigm's Paper

Our work is **heavily inspired by** Paradigm's [*Distribution Markets*](https://www.paradigm.xyz/2024/12/distribution-markets) (December 2024). We adopt their core insights:

- **Function-space markets** are superior to discrete buckets
- **L2 norm cost functions** incentivize truthful revelation
- **Scoring-rule payouts** (proper scoring rules under quadratic loss) align incentives

Our implementation makes two practical simplifications for an on-chain MVP:

| Paradigm Paper | Our Implementation | Rationale |
|----------------|-------------------|-----------|
| Non-parametric functions (arbitrary PDFs) | Parametric Normal distributions | Gas-efficiency. O(1) storage per trader. |
| Continuous function-space AMM | Capital-weighted PDF average at resolution | O(N) resolution loop is a one-time cost. Trade gas stays cheap. |
| Full L2 ball invariant | L2 norm used for fee scaling + minimum collateral | Maintains anti-manipulation without complex on-chain integration. |

We view our design as a **practical first step** toward the full vision Paradigm described. As ZK proving and on-chain computation improve, we intend to move closer to the non-parametric, continuous-function ideal.

---

## 6. Open Questions (Seeking Expert Feedback)

We would particularly value feedback on the following:

### 6A. Aggregation Method
Our consensus is a capital-weighted PDF average. Statistically, averaging Normal PDFs does **not** produce a Normal distribution. The result is a mixture model. Is this a problem for interpretation? Should we instead average parameters (μ, σ) and accept the solvency risk, or use a different aggregation entirely?

### 6B. L2 Fee Calibration
Our fee formula is:
```
l2Fee = collateral × L2(σ) / L2(400) × 10
```
We chose σ=400 as a reference and 10× multiplier somewhat arbitrarily. What is the optimal fee schedule? Too high = discourages trading. Too low = manipulation remains profitable.

### 6C. Oracle Design
For spot price markets, a single Binance candle at resolution is simple. For max/min markets, the oracle must scan all 1-minute candles in a window. Is a single-exchange oracle acceptable? How do we handle flash wicks? Should we use a multi-exchange TWAP?

### 6D. Path-Dependent Events
Can a single distribution over the maximum price truly replace a grid of touch binaries? What information is lost by compressing the entire price path into one scalar (the max)? Is a joint distribution over (high, low, close) worth the added complexity?

### 6E. Market Maker Incentives
In our design, there is no external LP. The "AMM" is just the pool of trader collateral. Is this sustainable? Should we allow passive LPs who deposit ETH and earn fees without taking directional risk?

### 6F. Front-Running and MEV
At resolution, the oracle's report is public. Could a trader front-run the resolution transaction by trading in the same block? Our mitigation: trading stops at `endTime`, and resolution requires `block.timestamp >= endTime`. Is this sufficient?

### 6G. Comparison to LMSR/CFMMs
How does our mechanism compare to logarithmic market scoring rules (LMSR) or constant function market makers (CFMMs) for continuous outcome spaces? Are there hybrid designs that combine the best of all three?

---

## 7. Implementation Status

| Component | Status |
|-----------|--------|
| Smart contract design | Complete (review pending) |
| PRB-Math integration | Planned |
| Foundry tests | Planned |
| Frontend (React + wagmi) | Partial (mock data) |
| Gnosis Chiado testnet deployment | Planned |
| Audit | Not yet scheduled |

We are building in public at [github.com/distribution-market-agent](https://github.com/distribution-market-agent) (repository name TBD).

---

## 8. References

1. **Paradigm, "Distribution Markets"** (December 2024) — https://www.paradigm.xyz/2024/12/distribution-markets
2. **PRB-Math** (PaulRBerg) — https://github.com/PaulRBerg/prb-math
3. **Polymarket** — https://polymarket.com
4. **Gnosis Chain** — https://gnosischain.com
5. **Scaffold-ETH 2** — https://scaffoldeth.io

---

*Thank you for reviewing this proposal. We welcome all feedback, corrections, and suggestions. Please open an issue or reach out directly.*
