# Distribution Markets Simulator

A Streamlit application for simulating [Distribution Markets](https://www.paradigm.xyz/2024/12/distribution-markets) — a continuous prediction market mechanism introduced by Paradigm.

## Features

- **Initialize a market** with variable backing $b$ (default 100)
- **Initialize with a Gaussian distribution** — set mean $\mu$ and standard deviation $\sigma$
- **Trade against the market** by proposing a new Gaussian distribution
- **Visualize payout functions** $(g - f)$ for each trade in real-time
- **See previous trades** overlaid on the chart as new plots
- **Shaved Gaussian visualization** — observe how narrow Gaussians are capped at $b$ to ensure market solvency

## Running the App

### Option 1: Using the existing virtual environment

```bash
cd streamlit_app
source venv/bin/activate
streamlit run app.py
```

### Option 2: Fresh install

```bash
cd streamlit_app
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

The app will be available at `http://localhost:8501`.

## How It Works

### Market Initialization
1. Set the backing amount $b$ (collateral the AMM holds)
2. Set the initial market belief as a Gaussian $\mathcal{N}(\mu_0, \sigma_0)$
3. The system computes the L2 invariant $k = ||f_0||_2$ where $f_0$ is scaled so $\max(f_0) = b$

### Trading
1. A trader proposes a new Gaussian belief with parameters $(\mu, \sigma)$
2. The system computes the trader's distribution $g(x)$ such that $||g||_2 = k$
3. If $\sigma < \sigma_{min} = \frac{k^2}{b^2\sqrt{\pi}}$, the Gaussian is **shaved** (capped at $b$):
   $$g(x) = \min(b, \lambda \cdot p(x))$$
4. The trader's payout function is $g(x) - f_{old}(x)$

### Visualization
- **Gray curve**: Current market position $f(x)$
- **Green regions**: Profitable outcomes for each historical trade
- **Dashed curves**: Full payout functions $(g-f)$ for each trade (toggle in legend)

## Key Formulas

- **Normal PDF:** $p(x) = \frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}$
- **L2 norm:** $||p||_2 = \sqrt{\frac{1}{2\sigma\sqrt{\pi}}}$
- **Solvency constraint:** $\sigma \geq \frac{k^2}{b^2\sqrt{\pi}}$
