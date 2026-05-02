# Polymarket Liquidity Bridge: Fractional Self-Funding Design

> **Date:** May 2, 2026
> **Status:** Design spec — ready for review
> **Project:** Distribution Markets (Paradigm-inspired continuous prediction market)

---

## 1. Problem

The distribution market faces a **cold-start liquidity problem**. Polymarket has existing capital deployed in discrete bucket markets for the same events. Traders have sunk cost in Polymarket YES/NO tokens and cannot directly use them in the continuous distribution market.

The core constraints:
- Traders must **not be required to post new capital** beyond their existing Polymarket position
- The distribution market must **remain solvent** regardless of outcome
- There must be a **financial incentive** for traders to bridge (not just altruism)

---

## 2. Proposed Solution: Fractional Self-Funding Bridge

A bridge contract that accepts Polymarket YES tokens, **sells a fraction at market price** to fund a distribution market position, and holds the remaining fraction as continued Polymarket exposure. The bridger ends up with a **hybrid position** — part Polymarket, part distribution market — funded entirely from the original token holding. **No new capital required.**

### 2.1 Core Mechanism

```
Bridger deposits:  N YES tokens for bucket [L, H), bought at price p

Bridge:
  1. Reads Polymarket oracle price p for the bucket
  2. Computes distribution position:
       μ = (L + H) / 2            (bucket midpoint)
       σ = (H - L) / 3            (≈99.7% density within bucket)
  3. Computes required collateral C from distribution market's scoring rule
  4. Computes fraction to sell:  f = C / (N × p)
  5. Sells f × N tokens on Polymarket → proceeds fund distribution position
  6. Holds (1-f) × N tokens as continued Polymarket position
  7. Opens distribution position with collateral C, parameters (μ, σ)
```

### 2.2 Resolution-Time Scoring Rule

The distribution market uses the resolution-time scoring rule (not the Paradigm continuous AMM):

```
f_m(x)  = Σ (collateral_j × f_j(x)) / Σ collateral_j    (consensus density)
payout  = collateral_i × f_i(x*) / f_m(x*)                (trader payout)
Σ payout_i = totalCollateral                              (solvency guarantee)
```

**Important:** The current distribution market implementation (Streamlit app) uses the Paradigm continuous AMM model with an L2-norm invariant. The bridge requires the resolution-time scoring rule variant instead. The scoring rule model has a simpler smart contract (no invariant computation) and is the design targeted by the proposal doc. The bridge is additive — it requires deploying a `DistributionMarket` contract using the scoring rule, distinct from the AMM-based simulator.

This is preferable to the continuous AMM because:
- No "worst-case loss" computation → collateral requirements are the trader's choice
- Multiple traders coexist without sequential AMM trades
- Lower capital requirements for tight-σ positions

### 2.3 Fraction Sold Calculation

```
Given:
  N = 111 YES tokens (for [80,90))
  p = $0.90  (current Polymarket price)
  μ = 85, σ = 3.33
  C = chosen collateral (trader picks risk level)

  f = C / (N × p)  = C / $100

  Example: C = $20 → sell 22 tokens (20%) → hold 89 YES
           C = $33 → sell 37 tokens (33%) → hold 74 YES
```

The bridger directly chooses their desired distribution market risk level (C). This sets the sell fraction automatically. No complex optimization needed.

**Bounds on C:**
- Minimum: `max($10, 0.05 × N × p)` — at least $10 or 5% of token value, to make the position meaningful
- Maximum: `0.80 × N × p` — at most 80% of token value, ensuring at least 20% of YES tokens remain for the Polymarket leg
- Default (recommended): `0.25 × N × p` — sell 25% by default, a balanced trade-off between upside and downside protection

---

## 3. Payout Mechanics

### 3.1 Combined Payout Function

At resolution `x*`, the bridger's total payout is:

```
P(x*) = YES_leg(x*) + Distribution_leg(x*)

where:
  YES_leg(x*)         = (1-f) × N                if x* ∈ [L, H)
                         0                        otherwise
  
  Distribution_leg(x*) = C × f_i(x*) / f_m(x*)
  
  f_i(x*) = N(x* | μ, σ)    (bridger's Normal PDF)
  f_m(x*) = consensus density at x*
```

### 3.2 Simulated Payouts (Example)

**Setup:** Consensus μ=85, σ=8, liquidity=$10k. Bridger: 111 YES [80,90) @ $0.90.

| Scenario | Cost | Payout at x=85 | ROI | Payout at x=80 |
|---|---|---|---|---|
| Polymarket only | $100 | $111 | +11% | $111 |
| Bridge sell 20% | $100 | **$137** | **+37%** | $108 |
| Bridge sell 33% | $100 | **$153** | **+53%** | $106 |
| Dist only (new capital) | $100 new | $240 | +140% | $95 |

The bridge converts Polymarket's **binary cliff** into a **smooth payout curve** while amplifying upside 23-42% over holding Polymarket alone, at **zero additional capital**.

### 3.3 Edge Case: Outside Bucket

If x* falls outside [L, H):
- YES leg: $0 (same as unsold Polymarket — no additional loss from selling)
- Distribution leg: smooth tail payout proportional to f_i(x*) / f_m(x*)
  - Near miss (e.g., x=78 when bucket=[80,90)): small positive payout
  - Far miss (e.g., x=70): near-zero payout

The downside is the same as or better than holding Polymarket alone. The bridger never loses MORE than the unsold case.

---

## 4. Solvency Analysis

### 4.1 Protocol Solvency

The distribution market's solvency guarantee `Σ payout_i = totalCollateral` is maintained because the bridge's position uses **USDC** as collateral (from the token sale). The YES tokens are simply held as a separate asset — they do not back the distribution market position.

### 4.2 Bridger Solvency

The bridger's downside risk is bounded:
- **Worst case:** Both legs pay $0 (outcome outside bucket and far from μ). Loss = original cost of YES tokens = sunk cost.
- **Near miss:** Distribution leg partially compensates even when bucket misses.

The bridge introduces no additional downside beyond the original Polymarket position.

---

## 5. Protocol Revenue

Revenue sources for the bridge operator:

1. **Spread on token sale:** Buy YES at bid price, sell at ask price on Polymarket (e.g., 0.5% spread)
2. **Distribution market fees:** L2 base fee + L2 norm fee on the bridger's position
3. **Optional bridge fee:** Fixed % of the bridged amount (e.g., 0.5% of collateral)

Revenue is collected in USDC at the time of bridging.

---

## 6. Risk Considerations

### 6.1 Polymarket Liquidity Risk

The bridge must be able to sell YES tokens on Polymarket without significant slippage. For buckets with low Polymarket volume ($0-50 in the example data), the bridge may need to:
- Accept a worse execution price (higher slippage)
- Batch sells across multiple bridgers
- Use a TWAP execution strategy

### 6.2 Oracle Dependency

The bridge relies on Polymarket's on-chain price feed for the YES token price. This price determines the sell fraction. If the Polymarket price is stale or manipulated, the fraction could be mispriced.

**Mitigation:** Use a TWAP price over the last N blocks, or a median across multiple on-chain sources.

### 6.3 Timing Risk

Between the time the bridger deposits and the bridge executes the sale, the YES token price could move. This changes the sell fraction.

**Mitigation:** Lock the fraction at deposit time using a snapshot of the Polymarket price. The bridge bears execution risk (which it can hedge).

---

## 7. Implementation Phases

### Phase 1: Bridge Contract (Smart Contract)

- `PolymarketBridge.sol`: Accepts Polymarket YES tokens, computes fraction, sells on Polymarket, opens distribution market position
- Integration with distribution market's `DistributionMarket.sol` (resolution-time scoring rule)
- Integration with Polymarket's CTF (Conditional Token Framework) for token sales

### Phase 2: Frontend Integration

- Bridge UI in the distribution market frontend
- Shows: "Deposit your Polymarket YES tokens → Get combined position"
- Displays: sell fraction, expected payouts, fee breakdown

### Phase 3: Multi-Bucket Aggregation

- Allow bridging across multiple Polymarket buckets simultaneously
- Aggregate into a single distribution market position (multi-modal mixture)
- Diversification reduces risk for the bridge operator

---

## 8. Open Questions

1. **Fraction optimization:** Is the sell fraction fixed at deposit time, or can the bridger choose? Current design: bridger chooses C (collateral), which sets f.

2. **Bridge fee structure:** Fixed % per bridge, or dynamic based on Polymarket liquidity? Recommendation: start with 0.5% fixed, adjust based on volume.

3. **Minimum bucket liquidity:** Should the bridge reject buckets with <$X Polymarket volume? Recommendation: reject buckets with <$50 volume to prevent execution failure.

4. **Multiple buckets per bridger:** Can one bridger deposit YES tokens for multiple buckets and get a combined position? Technically yes, but adds complexity.

5. **Gas costs:** Selling tokens on Polymarket + opening distribution position = 2+ transactions. Can be batched into one atomic transaction.
