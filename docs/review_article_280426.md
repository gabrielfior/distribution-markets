Here's the full review dump for the article writer:

---

📝 Final Review: Distribution Markets Proposal

Prepared for: Article writer
Date: April 28, 2026
Document reviewed: docs/distribution-markets-proposal.md

---

✅ What's Working Well

- Solvency proof is solid — algebraic identity holds; contract cannot become insolvent
- Problem framing is clear — Polymarket comparison and liquidity fragmentation examples are effective
- Honest about tradeoffs — the table in §5 explicitly acknowledges where implementation diverges from Paradigm's ideal
- Core mechanism is theoretically grounded — the f_i/f_m scoring rule against the capital-weighted mixture is strictly proper for information aggregation

---

🔴 Critical Issues

1. Aggregation Produces Multimodal Consensus — Users Need Clarity

The capital-weighted mixture f_m(x) = Σ w_i f_i(x) / Σ w_i is not a Normal distribution. It is a mixture of Normals and can be multimodal even when all traders submit unimodal distributions.

What happens: If traders cluster around different price levels (e.g., bears at $2,900 and bulls at $3,800), the mixture has two peaks with a "gap" between them. If ETH resolves in that gap, all traders simultaneously receive near-zero payout — even some who were directionally correct.

This is not a bug in the math — the solvency proof holds. But it is a fairness and UX problem that must be explicitly addressed in the article.

Recommended resolution:
- Accept multimodality as a legitimate market signal (genuine disagreement is real information)
- Display the mixture honestly — e.g., show the density curve with annotated modes, or flag "low-density zone between $X and $Y"
- Consider a hybrid scoring fallback in gap zones: when f_m(x*) falls below a threshold, transition from mixture scoring f_i/f_m to a distance-based scoring against a reference Normal. This prevents the "total loss in the gap" failure mode without breaking the proper scoring rule in normal conditions.

---

2. σ* Display Uses the Wrong Formula

The document computes σ* = Σ w_i σ_i / Σ w_i — the average of submitted σ values. This is not the market's confidence.

| What you show | What it actually measures |
|---|---|
| `σ*_avg = Σ w_i σ_i / Σ w_i` | Average trader self-confidence |
| `σ*_spr = (p84 − p16) / 2` from μ_i distribution | How much traders **disagree** |

For a price + confidence estimate, users need σ*_spr. Two markets can have identical σ*_avg but completely different σ*_spr — one might be unimodal and tight, the other bimodal with bulls and bears fighting.

Recommended resolution:
- Compute and display σ*_spr as the primary confidence number (the "±" in "$3,200 ± $200")
- Keep σ*_avg as an internal signal if needed, but don't show it to users
- Use capital-weighted percentiles to derive σ*_spr

---

3. σ_i Does Double Duty — Conflicting Incentives

The same σ_i submitted by a trader controls:
- Fee cost via L2 norm (narrow σ → expensive, anti-manipulation)
- Payout multiplier via f_i(x*) (narrow σ → massive payout if correct)

A trader with σ=$50 pays ~8× more fees than σ=$400 but also gets ~8× higher payout at the peak. The L2 fee roughly equilibrates EV across σ choices — but this means the fee doesn't actually prevent narrow σ submissions, it just prices them.

This isn't necessarily wrong (it's how the market prices confidence), but it should be explicitly explained in the article rather than leaving readers to discover it.

---

4. L2 Fee Formula is Unmotivated

Solidity

l2Fee = collateral × L2(σ) / L2(400) × 10

- Why σ = 400 as reference? No justification given.
- Why multiplier = 10? Arbitrary.
- For ETH at ~$3,000, σ = 400 implies the "reference confidence" is ~13% of price. On what empirical or theoretical basis?

Recommended resolution: (1/2)
- Calibrate σ_ref and multiplier against simulation: compute expected revenue vs. manipulation cost across a range of values
- The article should present this as a parameter to be tuned, not a fixed design choice
- Consider tying σ_ref to the typical price range of the asset (e.g., 5–10% of price for crypto)

---

✅ Issues Already Addressed (per Gabriel)

- Oracle design — noted as fixed; no longer a concern for this review

---

🟡 Suggested Additions for the Article

1. Explain σ_i double-duty explicitly — the reader should understand that narrow σ is both expensive AND high-reward, and why this is desirable
2. Add a worked example — walk through a 3-trader scenario showing exactly how f_m, f_i/f_m, and payouts compute at resolution
3. Address the "what does the market display?" question directly — the article describes the mechanism well but doesn't clearly answer: "what does a user actually see when they open the market?"
4. Discuss market vs. display consensus — the mixture is correct for scoring, but the displayed μ and σ should come from trader μ_i disagreement, not from the mixture parameters

---

📌 Confirmed Design Priorities (from conversation)

1. Price + confidence estimate — single scalar output (μ) plus confidence range (σ_spr)
2. Information aggregation efficiency — proper scoring rule alignment

This means:
- Keep the mixture scoring mechanism (it's properly aligned)
- Use the mixture only for payout scoring, not for display
- Use median of μ_i for μ and percentile spread for σ_spr
- No hard floor on σ — the L2 fee already makes extreme σ prohibitively expensive; minimum collateral is sufficient

---

End of review. (2/2)