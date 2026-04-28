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

### Why This Is Suboptimal

| Problem | Discrete Market | What We Lose |
|---------|----------------|--------------|
| **Liquidity fragmentation** | Each bucket/strike is its own pool | Tight spreads require deep pools; fragmentation dilutes liquidity |
| **Granularity ceiling** | Fixed bucket widths (e.g., $10) | Traders who think ETH will be $3,247.63 cannot express that precision |
| **No confidence signal** | You either buy Yes or No | A trader who is "80% sure ETH is $3,200" and one who is "51% sure" make the exact same trade |
| **Non-composable** | 11 separate binary markets | You cannot derive "P(ETH > $3,500)" from the market without summing bucket prices |

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

### The Multimodal Mixture Problem

The consensus distribution `f_m(x)` is a **mixture of Normals**, not a Normal distribution. When traders cluster around different price levels — for example, bears at $2,900 and bulls at $3,800 — the mixture develops two peaks with a low-density "gap" between them.

**The gap-zone fairness issue:** If ETH resolves in that gap, all traders simultaneously receive near-zero payout, even some who were directionally correct. This is not a bug — genuine disagreement is real information. But it creates a UX problem that must be addressed explicitly.

**Display recommendation:** Show the mixture density curve honestly, with annotated modes and a flag for "low-density zone between $X and $Y."

**Hybrid scoring fallback (optional enhancement):** When `f_m(x*)` falls below a threshold, transition from mixture scoring `f_i / f_m` to a distance-based scoring against a reference Normal centered at the market median. This prevents the "total loss in the gap" failure mode without breaking the proper scoring rule in normal conditions.

### What Users Actually See

The article describes the mechanism well, but a critical question remains: **what does a user see when they open the market?**

We separate **scoring** (how payouts work) from **display** (what the market shows):

| Display Element | Source | Meaning |
|---|---|---|
| **μ* (market estimate)** | Capital-weighted median of all trader μ_i | "Where do traders think the price will land?" |
| **σ*_spr (confidence)** | `(p84 − p16) / 2` from the μ_i distribution | "How much do traders disagree?" |
| **Consensus curve** | The mixture `f_m(x)` | Visual density with annotated modes |

**Why not derive μ and σ from the mixture?** Two markets can have identical mixture means but completely different trader disagreement. σ*_spr captures whether traders cluster tightly (unimodal consensus) or fight across price levels (bimodal disagreement). σ*_avg — the average of submitted σ_i — measures average trader self-confidence, not market-level disagreement. We keep σ*_avg as an internal signal but do not display it as the primary confidence metric.

#### Display Options: Trader Disagreement vs. Mixture Modes

We considered two approaches for displaying the market consensus:

| Approach | μ* Source | σ* Source | Best For |
|---|---|---|---|
| **A. Trader disagreement** (recommended) | Median of trader μ_i | Percentile spread of μ_i distribution | "How much do traders disagree?" Robust to outliers; clearly shows unimodal vs. bimodal disagreement |
| **B. Mixture modes** | Mode(s) of mixture `f_m(x)` | Width around dominant mode | "What is the most likely outcome according to the consensus density?" Matches the scoring curve visually |

**We recommend Option A** for the primary display because it separates the scoring mechanism (which must use the mixture for solvency) from the information signal (which should reflect genuine trader disagreement). However, the UI will show both: the trader-disagreement numbers as the headline "$3,200 ± $200" and the mixture curve as the visual density plot with annotated modes.

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

#### σ_i Does Double Duty

The same σ_i submitted by a trader controls two things simultaneously:

- **Fee cost:** Narrow σ → higher L2 fee (a trader with σ=$50 pays ~8× more in fees than one with σ=$400)
- **Payout multiplier:** Narrow σ → higher peak payout if correct (the same σ=$50 trader gets ~8× higher payout at the realized outcome than σ=$400)

The L2 fee roughly equilibrates expected value across σ choices — it **prices** extreme confidence rather than preventing it. This is intentional: the market explicitly charges for the right to make high-conviction bets. But it should be understood clearly — narrow σ is both expensive and high-reward.

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
Our fee formula uses two tunable parameters:

```
l2Fee = collateral × L2(σ) / L2(σ_reference) × multiplier
```

The reference σ and multiplier are **parameters to be calibrated via simulation**, not fixed design choices. For crypto assets, σ_ref might be set to 5–10% of the typical asset price (e.g., σ_ref ≈ $300–$600 for ETH at ~$3,000). The multiplier controls how aggressively the fee scales with confidence.

**Open questions:**
- What is the optimal fee schedule? Too high = discourages trading. Too low = manipulation remains profitable.
- How do we empirically calibrate expected revenue vs. manipulation cost across a range of values?
- Should σ_ref be dynamic (tied to recent price volatility) or static per market?

### 6C. Oracle Design
For spot price markets, a single Binance candle at resolution is simple. For max/min markets, the oracle must scan all 1-minute candles in a window. Is a single-exchange oracle acceptable? How do we handle flash wicks? Should we use a multi-exchange TWAP?

### 6D. Path-Dependent Events
See §9A for a deeper analysis of touch markets. Open questions: Can a single distribution over the maximum price truly replace a grid of touch binaries? What information is lost by compressing the entire price path into one scalar (the max)? Is a joint distribution over (high, low, close) worth the added complexity?

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

## 9. Future Work

### 9A. Touch Markets: A Path-Dependent Extension

The discrete markets discussed in §1 are structurally impoverished not just because they use buckets, but because certain questions are fundamentally about **paths**, not points. Consider Polymarket's "What price will Bitcoin hit April 20-26?" — a touch binary market with 14 separate strike prices and **$555,663 in volume split across 14 pools**.

#### Why Touch Binaries Are Different

In this market, the outcomes are **cumulative, not mutually exclusive**. If BTC hits $90k, then all lower strikes (`↑ $88k`, `↑ $86k`, etc.) resolve YES simultaneously:

```
Hit $90k  →  Hit $88k  →  Hit $86k  →  Hit $84k  →  ...
    YES         YES         YES         YES
```

The 14 binaries are not independent bets. They are samples from a single underlying object: **the probability that the price path reaches or exceeds each strike level** — a cumulative touch probability curve (hazard function):

```
T(K) = P(BTC price touches K or higher during the window)
```

This is structurally different from a single-point market. A touch binary asks about the **maximum of a stochastic process**, not the terminal price. The relevant distributional object is the **distribution of the running maximum**, which depends on path properties (volatility, trend, jump risk), not just the closing price.

#### Information Loss in Discrete Touch Markets

By splitting the cumulative curve into 14 separate pools, the market loses:

1. **Liquidity fragmentation:** A trader who believes "BTC will hit $82k but not $88k" must trade in two separate pools
2. **No confidence signal:** A trader cannot say "I'm 90% sure BTC hits $80k but only 10% sure it hits $88k"
3. **Path information discarded:** The market reveals nothing about *when* or *how* BTC hit a level

#### A Distribution Market Alternative

A Distribution Market over the **maximum price** during the window naturally encodes the same information as the entire grid:

```
P(max ≥ K) = 1 - CDF_market(K)
```

One continuous market over the maximum replaces 14 binary pools, with no liquidity fragmentation and full confidence signaling via σ. The correct distributional object is the distribution of the running maximum (not a Normal over terminal price), which is an open research direction for extending the MVP.

### 9B. Trader Simulation Studies

To validate the mechanism before mainnet deployment, we plan to run agent-based simulations that model how rational and behavioral traders interact with the market. These simulations will answer:

- **How does the consensus curve evolve** as traders with heterogeneous beliefs enter the market?
- **What do payouts look like in practice?** For example, simulate a 3-trader scenario where:
  - Trader A: μ = $3,000, σ = $100, collateral = $10,000
  - Trader B: μ = $3,400, σ = $200, collateral = $5,000
  - Trader C: μ = $3,200, σ = $400, collateral = $2,000
  - Resolution at x* = $3,150
  
  Show step-by-step: `f_m(x*)`, each `f_i(x*)`, the ratio `f_i / f_m`, and final payout. This makes the scoring rule concrete.

- **How does σ choice affect EV?** Traders can optimize σ to maximize expected payout. Does the L2 fee successfully align private optimization with truthful revelation?
- **What happens under manipulation?** Simulate a trader who submits an extreme μ or σ to distort the consensus. How much capital is required? Is the L2 fee sufficient deterrent?
- **Multimodal dynamics:** Simulate bulls vs. bears clustering at different price levels. How does the gap-zone payout distribution look? Does the hybrid scoring fallback improve fairness?

These simulations will be open-source and parameterizable, allowing the community to explore edge cases and inform fee calibration (§6B) before any real capital is at risk.

### 9C. Liquidity Sourcing from Existing Markets

A practical challenge for any new prediction market primitive is **cold-start liquidity**. Distribution Markets require traders to deposit collateral and submit distributions, but early markets may suffer from low participation and shallow consensus curves. Rather than relying solely on organic trader flow, we can explore **liquidity sourcing from existing prediction markets**:

- **Polymarket integration:** Can we algorithmically translate Polymarket's discrete bucket prices into continuous distributions? For example, if a bucket market shows P(ETH < $3,000) = 20%, P($3,000–$3,500) = 50%, P(> $3,500) = 30%, we could fit a Normal or log-normal distribution that matches these quantiles and use it as an "initial market maker" position in our Distribution Market. This bootstraps the consensus curve with real market-implied information.
- **AMM liquidity bridges:** Can passive LPs deposit capital into a Distribution Market by referencing existing AMM pools (e.g., Uniswap ETH/USDC)? The LP's position could be automatically converted into a wide σ distribution centered at the current spot price, providing initial depth without requiring the LP to manually choose μ and σ.
- **Cross-market arbitrage:** If a Distribution Market and a Polymarket bucket market coexist for the same event, arbitrageurs could trade discrepancies between the continuous CDF and discrete bucket prices, which naturally channels liquidity toward the more efficient market.

The core question is whether **imported liquidity** compromises the incentive alignment of the scoring rule. If the initial market maker is not a genuine belief holder but an algorithmic translation of external prices, does that distort payouts or create exploitable edge cases? This is an open design question for future research.
