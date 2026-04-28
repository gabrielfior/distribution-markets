# Distribution Markets: Why Prediction Markets Should Think in Curves, Not Buckets

> **tl;dr:** We propose a new prediction market primitive where traders submit full probability distributions over continuous outcomes (e.g., "ETH will be $3,200 ± $200"), rather than buying discrete Yes/No shares in fixed buckets. This eliminates liquidity fragmentation, captures trader confidence, and produces a richer, more composable information signal.

---

## The Problem: Discrete Markets Waste Information

If you've used Polymarket, you've seen markets like this:

**"Solana price on April 23?"**
- 11 discrete buckets: `<$40`, `$40-50`, `$50-60`, ..., `$120-130`, `>$130`
- **$11,234 in volume split across 11 separate liquidity pools**
- Only one bucket resolves YES

This design is simple, but it discards almost everything interesting about what traders actually believe.

| What discrete markets destroy | What we lose |
|---|---|
| **Precision** | A trader who thinks ETH = $3,247.63 must round to the nearest bucket |
| **Confidence** | Someone "80% sure" and someone "51% sure" make the exact same trade |
| **Liquidity** | Each bucket is its own tiny AMM; spreads are wide everywhere |
| **Composability** | You cannot derive "P(ETH > $3,500)" without summing bucket prices manually |

In short: **discrete buckets force traders to approximate their beliefs, fragment liquidity, and throw away the rich information contained in a full distribution.**

---

## The Idea: Trade Distributions, Not Binary Shares

In a **Distribution Market**, traders don't buy Yes/No shares. They submit a full **probability distribution** over a continuous outcome — for example, a Normal distribution `N(μ, σ)` predicting the price of ETH on May 1.

- **μ (mean):** Where they think the price will land
- **σ (standard deviation):** How confident they are (narrow = confident, wide = uncertain)

The market maintains a **capital-weighted consensus distribution** — a mixture of every trader's view, weighted by how much capital they put behind it.

At resolution, if ETH lands at `x*`, your payout depends on one simple ratio:

```
payout = your_collateral × your_density(x*) / market_density(x*)
```

If you assigned more probability to the realized outcome than the market consensus did, you earn more than your collateral. If you assigned less, you earn less. This is a **proper scoring rule**: it is mathematically optimal for you to report your true beliefs.

**Most importantly, the sum of all payouts always equals the total collateral.** This is not an approximation — it is an exact algebraic identity. The contract can never become insolvent.

---

## Three Immediate Advantages

### 1. Infinite Granularity
There are no bucket boundaries. A trader submits μ = 3247.63, and the market price at *every* real number is simultaneously discoverable.

### 2. Confidence Is Tradeable
σ is not a side effect — it's a **first-class tradeable parameter**. A trader who is highly confident submits a narrow σ and pays more for that precision. A trader who is uncertain submits a wide σ and pays less. The market **explicitly prices uncertainty**.

### 3. No Liquidity Fragmentation
All trading concentrates in a single pool. With the same total volume as a discrete market, a Distribution Market has deeper liquidity at every price point, tighter spreads, and better price discovery.

---

## The Multimodal Mixture (And Why It's a Feature)

A natural question: if traders disagree — say, bears cluster at $2,900 and bulls at $3,800 — the consensus distribution becomes **multimodal** with a low-density "gap" between them.

If ETH resolves in that gap, everyone gets near-zero payout. This looks like a bug, but it's not. **Genuine disagreement is real information.** The market should display the consensus honestly — two peaks, a flag for "low-confidence zone between $X and $Y" — rather than forcing a false unimodal consensus.

We are also exploring a **hybrid scoring fallback**: when the market density falls below a threshold in gap zones, transition to a distance-based scoring against a reference Normal. This prevents the "total loss in the gap" failure mode without breaking the proper scoring rule under normal conditions.

---

## Scaling: Merkle Proofs for Gas Efficiency

The resolution step requires computing each trader's probability density at the realized outcome — an O(N) loop. This is a **one-time cost paid by the resolver**; trade gas stays cheap.

For very large markets, we can move computation off-chain and verify it on-chain with a **Merkle proof**: the resolver submits a Merkle root of all `(trader, density)` pairs, and each trader claims by providing a Merkle path proving their individual value. Resolution gas becomes constant regardless of participant count.

---

## Where This Fits

Our work is heavily inspired by Paradigm's [*Distribution Markets*](https://www.paradigm.xyz/2024/12/distribution-markets) paper (December 2024). We adopt their core insights — function-space markets, L2 norm cost functions, and proper scoring rules — but make two practical simplifications for an on-chain MVP:

| Paradigm's Vision | Our MVP |
|---|---|
| Non-parametric functions (any PDF) | Parametric Normal distributions (O(1) storage) |
| Continuous function-space AMM | Capital-weighted average at resolution + Merkle proofs |
| Full L2 ball invariant | L2 norm used for fee scaling + minimum collateral |

### Paradigm's Continuous AMM vs. Our Resolution-Time Average

The biggest architectural difference is **when and how the consensus updates**.

**Paradigm's approach: A continuous function-space AMM.**
Imagine a Uniswap-style AMM, but instead of trading tokens, you trade *functions*. The market maintains an invariant — a "ball" in L2 function space — and every trade moves the market distribution along a geodesic. The consensus updates **continuously** with each trade. If you think the market is wrong, you trade against it immediately, shifting the consensus in real time. This is elegant, instantaneous, and theoretically beautiful. It is also extraordinarily complex to implement on-chain: you need to enforce geometric invariants over infinite-dimensional function spaces, and every trade recomputes integrals over the entire outcome space.

**Our approach: A capital-weighted average at resolution.**
Traders submit distributions and collateral. Nothing changes until the oracle resolves the market. At that single moment, the contract computes the weighted average of all PDFs, evaluates each trader's density at the realized outcome, and pays out. There is **no continuous price discovery** — you cannot "trade against the market" mid-event and immediately profit from shifting the consensus. You simply stake your view and wait.

| Dimension | Paradigm AMM | Our Resolution Average |
|---|---|---|
| **Price discovery** | Continuous; market updates per trade | Discrete; one consensus at resolution |
| **Trading experience** | Like a DEX: immediate feedback, continuous liquidity | Like a vault: submit view, wait for outcome |
| **On-chain complexity** | Very high (function-space invariants, geometric updates) | Low (store μ, σ, collateral; compute average once) |
| **Gas per trade** | High (recompute integrals, enforce invariant) | Low (~50k gas; just store parameters) |
| **MEV / front-running** | Significant (continuous state changes) | Minimal (no mid-market trading after submission) |
| **Capital efficiency** | Capital rotates continuously | Capital locked until resolution |

**Why we chose this tradeoff:** Our MVP prioritizes **shipability**. A resolution-time average preserves the core mechanism (proper scoring, solvency guarantee, information aggregation) while reducing on-chain complexity by 10×. The gas savings make it feasible on L2s like Gnosis today. And critically, it gives us a working foundation to iterate toward Paradigm's continuous ideal as ZK proving and on-chain computation mature. The continuous AMM is the destination; the resolution-time average is the on-ramp.

We view this as a **practical first step** toward the full vision. As ZK proving and on-chain computation improve, we intend to move closer to non-parametric, continuous-function markets.

---

## What's Next

We are currently building in three parallel tracks:

1. **Agent-based simulations** — to validate the scoring rule, stress-test fee calibration, and generate concrete worked examples
2. **Solidity implementation** — Foundry + PRB-Math, with both O(N) resolution and Merkle-proof variants
3. **Testnet deployment** — Gnosis Chiado pilot with a single ETH spot-price market

If you're a prediction market researcher, mechanism designer, or smart contract engineer, we'd love your feedback.

**→ Read the full technical proposal:** [`docs/distribution-markets-proposal.md`](./distribution-markets-proposal.md)

---

*Built with [Scaffold-ETH 2](https://scaffoldeth.io). Targeting Gnosis Chain for testnet launch.*
