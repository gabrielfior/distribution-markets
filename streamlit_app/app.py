import streamlit as st
import numpy as np
import plotly.graph_objects as go
from dataclasses import dataclass
from typing import Tuple

st.set_page_config(page_title="Distribution Markets Simulator", layout="wide")

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def normal_pdf(x: np.ndarray, mu: float, sigma: float) -> np.ndarray:
    """Standard normal probability density function."""
    return (1.0 / np.sqrt(2 * np.pi * sigma**2)) * np.exp(-((x - mu)**2) / (2 * sigma**2))

def l2_norm(f_vals: np.ndarray, dx: float) -> float:
    """Discrete L2 norm of a function sampled on a uniform grid."""
    return np.sqrt(np.trapezoid(f_vals**2, dx=dx))

def gaussian_l2_norm(sigma: float) -> float:
    """Analytical L2 norm of a Normal PDF with std sigma: ||p||_2 = (2σ√π)^{-1/2}."""
    return (2.0 * sigma * np.sqrt(np.pi)) ** (-0.5)

def gaussian_max_pdf(sigma: float) -> float:
    """Peak value of a Normal PDF: 1 / √(2πσ²)."""
    return 1.0 / np.sqrt(2.0 * np.pi * sigma * sigma)

def compute_k_from_gaussian(b: float, sigma: float, mu: float = 0.0) -> float:
    """
    Given backing b and an initial Gaussian with standard deviation sigma,
    scale it so that max(f) == b, then return its L2 norm k.
    Uses analytical formulas — no numerical integration needed.
    """
    lam = b / gaussian_max_pdf(sigma)
    k = lam * gaussian_l2_norm(sigma)
    return k

def compute_trader_distribution(k: float, mu: float, sigma: float,
                                 num_points: int = 2000) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Compute the trader's distribution g(x) = λ * p(x) such that ||g||_2 = k.
    Uses analytical L2 norm. Returns (xs, g_vals, lambda_used).
    """
    lam = k / gaussian_l2_norm(sigma)
    half_range = max(8.0 * sigma, 5.0)
    xs = np.linspace(mu - half_range, mu + half_range, num_points)
    g = lam * normal_pdf(xs, mu, sigma)
    return xs, g, lam

def eval_distribution_on_grid(k: float, mu: float, sigma: float,
                               xs: np.ndarray) -> np.ndarray:
    """
    Evaluate the trader distribution g(x) = λ * p(x) on a given grid.
    Uses the analytical L2 norm — no numerical integration needed.
    """
    lam = k / gaussian_l2_norm(sigma)
    return lam * normal_pdf(xs, mu, sigma)

def compute_payout(k: float, mu_prev: float, sigma_prev: float,
                   mu_new: float, sigma_new: float,
                   num_points: int = 5000) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Compute the payout g(x) - f(x) on a common grid that covers both distributions.
    Returns (xs, payout, collateral).
    """
    half_range = max(8.0 * sigma_prev, 8.0 * sigma_new, 5.0)
    x_center = (mu_prev + mu_new) / 2.0
    xs = np.linspace(x_center - half_range, x_center + half_range, num_points)
    f = eval_distribution_on_grid(k, mu_prev, sigma_prev, xs)
    g = eval_distribution_on_grid(k, mu_new, sigma_new, xs)
    payout = g - f
    collateral = -float(np.min(payout))
    return xs, payout, collateral

def compute_sigma_min(k: float, b: float) -> float:
    """
    Minimum standard deviation for an unshaved Gaussian.
    From the paper: sigma >= k^2 / (b^2 * sqrt(pi))
    """
    return (k**2) / (b**2 * np.sqrt(np.pi))

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Trade:
    trade_id: int
    mu: float
    sigma: float
    lam: float
    collateral: float

@dataclass
class LiquidityEvent:
    lp_id: int
    delta_b: float
    total_b_before: float
    total_b_after: float
    sigma_min_before: float
    sigma_min_after: float

# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

st.title("📊 Distribution Markets Simulator")
st.markdown(
    "Inspired by [Paradigm's Distribution Markets](https://www.paradigm.xyz/2024/12/distribution-markets). "
    "This simulator lets you initialize a Gaussian distribution market, trade against it, and visualize payouts."
)

# Session state initialization
if "market_initialized" not in st.session_state:
    st.session_state.market_initialized = False
if "trades" not in st.session_state:
    st.session_state.trades = []
if "current_mu" not in st.session_state:
    st.session_state.current_mu = 0.0
if "current_sigma" not in st.session_state:
    st.session_state.current_sigma = 5.0
if "b" not in st.session_state:
    st.session_state.b = 100.0
if "k" not in st.session_state:
    st.session_state.k = 0.0
if "trade_counter" not in st.session_state:
    st.session_state.trade_counter = 0
if "liquidity_events" not in st.session_state:
    st.session_state.liquidity_events = []
if "lp_counter" not in st.session_state:
    st.session_state.lp_counter = 0

# ---------------------------------------------------------------------------
# Sidebar: Market Initialization
# ---------------------------------------------------------------------------

st.sidebar.header("🔧 Market Initialization")

b_input = st.sidebar.number_input(
    "Backing $b$ (collateral)",
    min_value=1.0, max_value=10000.0,
    value=st.session_state.b, step=1.0
)
init_mu = st.sidebar.number_input("Initial market mean $\\mu_0$", value=0.0, step=0.5)
init_sigma = st.sidebar.number_input(
    "Initial market std $\\sigma_0$",
    min_value=0.1, max_value=100.0, value=5.0, step=0.1
)

if st.sidebar.button("🚀 Initialize Market"):
    st.session_state.b = float(b_input)
    st.session_state.current_mu = float(init_mu)
    st.session_state.current_sigma = float(init_sigma)
    st.session_state.k = compute_k_from_gaussian(
        st.session_state.b, st.session_state.current_sigma, st.session_state.current_mu
    )
    st.session_state.market_initialized = True
    st.session_state.trades = []
    st.session_state.trade_counter = 0
    st.session_state.liquidity_events = []
    st.session_state.lp_counter = 0
    st.sidebar.success(f"Market initialized!  \n$k = {st.session_state.k:.4f}$")

if not st.session_state.market_initialized:
    st.info("👈 Use the sidebar to initialize the market before trading.")
    st.stop()

# Compute effective backing b_eff from initial + all LP contributions
b_eff = st.session_state.b + sum(ev.delta_b for ev in st.session_state.liquidity_events)
sigma_min = compute_sigma_min(st.session_state.k, b_eff)

# ---------------------------------------------------------------------------
# Sidebar: Liquidity Provision
# ---------------------------------------------------------------------------

st.sidebar.header("🏦 Liquidity Provision")

col1, col2 = st.sidebar.columns(2)
with col1:
    st.metric("Total Backing $b$", f"${b_eff:.0f}")
with col2:
    st.metric("Min $\\sigma$", f"{sigma_min:.3f}")

lp_amount = st.sidebar.number_input(
    "Add collateral $\\Delta b$",
    min_value=1.0, max_value=10000.0,
    value=100.0, step=10.0,
    key="lp_delta_b"
)

if st.sidebar.button("💧 Add Liquidity"):
    y = lp_amount / b_eff
    sigma_min_before = compute_sigma_min(st.session_state.k, b_eff)
    b_new = b_eff + lp_amount
    sigma_min_after = compute_sigma_min(st.session_state.k, b_new)
    st.session_state.lp_counter += 1
    ev = LiquidityEvent(
        lp_id=st.session_state.lp_counter,
        delta_b=lp_amount,
        total_b_before=b_eff,
        total_b_after=b_new,
        sigma_min_before=sigma_min_before,
        sigma_min_after=sigma_min_after,
    )
    st.session_state.liquidity_events.append(ev)
    st.sidebar.success(
        f"LP #{ev.lp_id}: +${lp_amount:.0f} (y={y:.2f})\n"
        f"$\\sigma_{{\\min}}$: {sigma_min_before:.4f} → {sigma_min_after:.4f}"
    )
    st.rerun()

# ---------------------------------------------------------------------------
# Sidebar: Trading
# ---------------------------------------------------------------------------

st.sidebar.header("💱 Trade")

trade_mu = st.sidebar.number_input(
    "Trader mean $\\mu$",
    value=st.session_state.current_mu, step=0.5, key="trade_mu"
)
trade_sigma = st.sidebar.number_input(
    "Trader std $\\sigma$",
    min_value=0.1, max_value=100.0,
    value=st.session_state.current_sigma, step=0.1, key="trade_sigma"
)

st.sidebar.markdown(f"**Minimum allowed $\\sigma$:** `{sigma_min:.4f}`")

# Live collateral preview
if trade_sigma >= sigma_min:
    _, _, collateral_preview = compute_payout(
        st.session_state.k,
        st.session_state.current_mu, st.session_state.current_sigma,
        trade_mu, trade_sigma,
    )
    st.sidebar.info(f"💰 Estimated collateral required: **${collateral_preview:.2f}**")

trade_valid = trade_sigma >= sigma_min

if not trade_valid:
    st.sidebar.error(
        f"❌ Trade rejected: $\\sigma = {trade_sigma:.4f}$ is below the minimum `{sigma_min:.4f}$`. "
        f"Narrow distributions would exceed the backing $b$."
    )

if st.sidebar.button("📈 Execute Trade", disabled=not trade_valid):
    # Compute payout on a common grid to get correct collateral
    _, _, collateral = compute_payout(
        st.session_state.k,
        st.session_state.current_mu, st.session_state.current_sigma,
        trade_mu, trade_sigma,
    )
    _, _, lam = compute_trader_distribution(
        st.session_state.k, trade_mu, trade_sigma
    )

    st.session_state.trade_counter += 1
    trade = Trade(
        trade_id=st.session_state.trade_counter,
        mu=trade_mu,
        sigma=trade_sigma,
        lam=lam,
        collateral=collateral,
    )
    st.session_state.trades.append({
        "trade": trade,
        "prev_mu": st.session_state.current_mu,
        "prev_sigma": st.session_state.current_sigma,
    })
    # Update market state
    st.session_state.current_mu = trade_mu
    st.session_state.current_sigma = trade_sigma
    st.sidebar.success(f"Trade #{trade.trade_id} executed! Collateral: ${collateral:.2f}")
    st.rerun()

if st.sidebar.button("🔄 Reset Trades"):
    st.session_state.trades = []
    st.session_state.trade_counter = 0
    st.session_state.current_mu = init_mu
    st.session_state.current_sigma = init_sigma
    st.sidebar.success("Trades reset!")
    st.rerun()

# ---------------------------------------------------------------------------
# Main charts — two panels
# ---------------------------------------------------------------------------

st.header("Market Visualization")

left_col, right_col = st.columns(2)

# Determine x-range dynamically from all distributions
x_min = min(-20, st.session_state.current_mu - 5 * st.session_state.current_sigma)
x_max = max(20, st.session_state.current_mu + 5 * st.session_state.current_sigma)
for t in st.session_state.trades:
    x_min = min(x_min, t["trade"].mu - 5 * t["trade"].sigma)
    x_max = max(x_max, t["trade"].mu + 5 * t["trade"].sigma)
x_min -= 2
x_max += 2

xs = np.linspace(x_min, x_max, 2000)
dx = xs[1] - xs[0]

# ---------- LEFT PANEL: all distributions ----------
with left_col:
    st.subheader("Distributions")

    fig_dist = go.Figure()

    # Helper to add a distribution trace
    dist_colors = ['#34495e', '#e74c3c', '#2ecc71', '#3498db', '#9b59b6', '#f39c12', '#1abc9c']

    # Initial distribution (f_0)
    init_dist_y = eval_distribution_on_grid(
        st.session_state.k, init_mu, init_sigma, xs
    )
    fig_dist.add_trace(go.Scatter(
        x=xs, y=init_dist_y,
        mode='lines',
        name=f'Initial f₀ (μ={init_mu:.1f}, σ={init_sigma:.2f})',
        line=dict(color=dist_colors[0], width=2, dash='dash'),
    ))

    # Each trade's new distribution (which becomes the new market f)
    for idx, trade_data in enumerate(st.session_state.trades):
        trade = trade_data["trade"]
        color = dist_colors[(idx + 1) % len(dist_colors)]
        g_trade_y = eval_distribution_on_grid(
            st.session_state.k, trade.mu, trade.sigma, xs
        )
        fig_dist.add_trace(go.Scatter(
            x=xs, y=g_trade_y,
            mode='lines',
            name=f'After Trade #{trade.trade_id} (μ={trade.mu:.1f}, σ={trade.sigma:.2f})',
            line=dict(color=color, width=2),
        ))

    fig_dist.update_layout(
        xaxis_title="Outcome (x)",
        yaxis_title="Value ($)",
        template="plotly_white",
        height=550,
        hovermode='x unified',
        legend=dict(orientation="h", yanchor="bottom", y=-0.35, xanchor="center", x=0.5),
        margin=dict(b=100),
    )

    st.plotly_chart(fig_dist, use_container_width=True)

# ---------- RIGHT PANEL: all payouts ----------
with right_col:
    st.subheader("Trader Payouts (g − f)")

    fig_payout = go.Figure()

    payout_colors = ['#e74c3c', '#2ecc71', '#3498db', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22']

    for idx, trade_data in enumerate(st.session_state.trades):
        trade = trade_data["trade"]
        prev_mu = trade_data["prev_mu"]
        prev_sigma = trade_data["prev_sigma"]
        color = payout_colors[idx % len(payout_colors)]

        # Previous market f(x)
        f_prev_y = eval_distribution_on_grid(
            st.session_state.k, prev_mu, prev_sigma, xs
        )
        # Trader's g(x)
        g_trade_y = eval_distribution_on_grid(
            st.session_state.k, trade.mu, trade.sigma, xs
        )

        payout = g_trade_y - f_prev_y
        min_payout_idx = int(np.argmin(payout))
        min_payout_x = float(xs[min_payout_idx])
        min_payout_y = float(payout[min_payout_idx])

        # Payout curve
        fig_payout.add_trace(go.Scatter(
            x=xs, y=payout,
            mode='lines',
            name=f'Trade #{trade.trade_id} (μ={trade.mu:.1f}, σ={trade.sigma:.2f}, coll=${trade.collateral:.1f})',
            line=dict(color=color, width=2),
        ))

        # Collateral point annotation (worst-case loss)
        fig_payout.add_trace(go.Scatter(
            x=[min_payout_x],
            y=[min_payout_y],
            mode='markers',
            marker=dict(color=color, size=10, symbol='diamond'),
            showlegend=False,
            hovertemplate=f'Trade #{trade.trade_id} worst loss<br>x=%{{x:.2f}}<br>loss=%{{y:.2f}}<extra></extra>',
        ))

        # Positive payout (profit region) — semi-transparent fill
        fig_payout.add_trace(go.Scatter(
            x=xs, y=np.where(payout > 0, payout, np.nan),
            mode='lines',
            line=dict(color=color, width=0),
            fill='tozeroy',
            fillcolor=f'rgba{tuple(int(color[i:i+2], 16) for i in (1, 3, 5)) + (0.2,)}',
            showlegend=False,
            hoverinfo='skip',
        ))

    # Reference line at y=0
    fig_payout.add_hline(y=0, line_dash="dot", line_color="black", line_width=1)

    fig_payout.update_layout(
        xaxis_title="Outcome (x)",
        yaxis_title="Payout ($)",
        template="plotly_white",
        height=550,
        hovermode='x unified',
        legend=dict(orientation="h", yanchor="bottom", y=-0.35, xanchor="center", x=0.5),
        margin=dict(b=100),
    )

    st.plotly_chart(fig_payout, use_container_width=True)

# ---------------------------------------------------------------------------
# Trade details table
# ---------------------------------------------------------------------------

if st.session_state.trades:
    st.header("📋 Trade History")
    trade_rows = []
    for t in st.session_state.trades:
        tr = t["trade"]
        trade_rows.append({
            "Trade #": tr.trade_id,
            "Previous μ": f"{t['prev_mu']:.2f}",
            "Previous σ": f"{t['prev_sigma']:.4f}",
            "New μ": f"{tr.mu:.2f}",
            "New σ": f"{tr.sigma:.4f}",
            "λ": f"{tr.lam:.4f}",
            "Collateral ($)": f"{tr.collateral:.2f}",
        })
    st.table(trade_rows)

# ---------------------------------------------------------------------------
# Math explanation
# ---------------------------------------------------------------------------

with st.expander("📖 Mechanics & Formulas"):
    st.markdown(r"""
    ### Distribution Market Mechanics

    **1. Normal PDF:**
    $$p(x) = \frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}$$

    **2. L2 Norm of a Gaussian:**
    $$||p||_2 = \sqrt{\int_{-\infty}^{\infty} p(x)^2 \, dx} = \sqrt{\frac{1}{2\sigma\sqrt{\pi}}}$$

    **3. Market Invariant:**
    The AMM is initialized with backing $b$. The initial distribution $f_0(x)$ is scaled so that $\max(f_0) = b$.
    The L2 norm $k = ||f_0||_2$ becomes the market invariant — it stays constant across trades.

    **4. Trading:**
    A trader proposes a new distribution $g(x) = \lambda \cdot p_{new}(x)$ where $\lambda$ is chosen so that:
    $$||g||_2 = k \quad \Rightarrow \quad \lambda = \frac{k}{||p_{new}||_2}$$
    The trader's payout function is $g(x) - f_{old}(x)$.

    **5. Collateralization:**
    The trader must post collateral equal to their worst-case loss:
    $$\text{Collateral} = -\min_x \big(g(x) - f_{old}(x)\big)$$
    This is the amount the trader could lose if the worst outcome for them occurs.

    **6. Liquidity Provision:**
    An LP can add liquidity by contributing $\Delta b$ to the AMM. This increases the total backing:
    $$b_{\text{new}} = b + \Delta b$$
    The proportion added is $y = \Delta b / b$. The LP contributes $y(b - f) = \Delta b - yf$ to the AMM's position and keeps $yf$ as their personal position.
    Increasing $b$ reduces $\sigma_{\min}$, allowing narrower (more concentrated) trades:
    $$\sigma_{\min} = \frac{k^2}{b^2 \sqrt{\pi}}$$

    **8. Solvency Constraint (Lower Bound on σ):
    The maximum value of $g$ is:
    $$\max(g) = \lambda \cdot \max(p) = \frac{k}{\sqrt{\sigma\sqrt{\pi}}}$$
    To ensure the AMM remains solvent ($\max(g) \leq b$):
    $$\sigma \geq \frac{k^2}{b^2 \sqrt{\pi}}$$
    Trades with $\sigma$ below this minimum are **rejected** to prevent the market from being wiped out.
    """)

    st.markdown(f"""
    **Current Market Parameters:**
    - Total backing $b = {b_eff:.2f}$ (initial: ${st.session_state.b:.0f}$, LP added: ${sum(ev.delta_b for ev in st.session_state.liquidity_events):.0f}$)
    - Invariant $k = {st.session_state.k:.4f}$
    - Minimum allowed σ = {sigma_min:.4f}
    """)
