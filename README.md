# Distribution Markets

On-chain prediction markets where traders submit probability distributions over continuous outcomes, not discrete binary shares. Inspired by [Paradigm's Distribution Markets paper](https://www.paradigm.xyz/2024/12/distribution-markets).

Built with Scaffold-ETH 2 (NextJS, RainbowKit, Foundry, Wagmi, Viem).

## Architecture

### Smart Contracts (`packages/foundry/`)

- **DistributionMarket.sol** — L2 invariant AMM: create markets, trade with Gaussian distributions, resolve outcomes, claim payouts, add liquidity, withdraw fees
- **NormalDistribution.sol** — Math library (Normal PDF, L2 norm, sigma_min, k invariant) via PRB-Math fixed-point arithmetic

#### Contract model
- Market initialized with backing **b** (ETH), mean **μ**, std **σ**
- Invariant **k = ‖f₀‖₂** stays constant across trades
- Trade shifts the market distribution: **f_old → g_new** where **‖g‖₂ = k**
- Collateral **c = −min(g−f)** computed off-chain by client
- Payout at outcome **x\***: max(0, min(c + g(x\*) − f(x\*), c × 10))
- Solvency constraint: **σ ≥ k² / (b² √π)**

### Frontend

- Two-panel Streamlit-style charts (Recharts): Distributions + Trader Payouts
- Trade history table with batch-read from contract
- Create market form, market list, trade interface with μ/σ range sliders
- Wallet connection via RainbowKit (MetaMask, WalletConnect, burner wallet)

## Quickstart

### Prerequisites

- [Node >= v20](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)

### Local development

```bash
# Terminal 1: install dependencies
yarn install
cd packages/foundry && forge install

# Terminal 2: start local chain (Anvil)
cd packages/foundry && anvil

# Terminal 3: deploy contracts to local chain
cd packages/foundry
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Terminal 4: start frontend
yarn dev
```

Open http://localhost:3000. Connect your wallet (burner wallet for localhost, or MetaMask with `localhost:8545` network).

### Running tests

```bash
cd packages/foundry && forge test
```

27 tests covering:
- Normal PDF accuracy, symmetry, L2 norm
- Market creation, trading, solvency, resolution, claims
- LP liquidity provision, fee withdrawal
- Edge cases (reverts, double claims, expiry)

## Deployment

### Tenderly Virtual Testnet (current)

Contracts are deployed on Tenderly Polygon Virtual Testnet (chain 999137):

| Contract | Address |
|----------|---------|
| `DistributionMarket` | `0x087a81350ed3173E184da87E4F81601516102b80` |

To deploy an update:
```bash
cd packages/foundry
forge script script/Deploy.s.sol --rpc-url tenderly --broadcast
```

To fund accounts on Tenderly:
```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"tenderly_setBalance","params":["0x...", "0x8AC7230489E80000"],"id":1}' \
  https://virtual.polygon.eu.rpc.tenderly.co/5f02cc89-4f33-4376-ae33-96831393c9f1
```

### Adding a new network

1. Add RPC endpoint to `packages/foundry/foundry.toml`
2. Add chain definition to `scaffold.config.ts`
3. Add contract address + ABI to `contracts/externalContracts.ts`
4. Deploy: `forge script script/Deploy.s.sol --rpc-url <network> --broadcast`

## Project Structure

```
packages/foundry/
├── contracts/
│   ├── DistributionMarket.sol    # Main AMM contract
│   └── NormalDistribution.sol    # Math library
├── test/
│   ├── DistributionMarket.t.sol  # 18 integration tests
│   └── NormalDistribution.t.sol  # 9 unit tests
├── script/
│   └── Deploy.s.sol              # Deployment script
└── foundry.toml                  # Foundry config

app/
├── page.tsx                      # Home page (market list + create)
├── trade/[id]/page.tsx           # Trade interface
├── components/
│   ├── TradingInterface.tsx      # Trade UI + charts
│   ├── DistributionCurve.tsx     # Distribution line chart
│   ├── PayoutChart.tsx           # Payout curve chart
│   └── MarketCard.tsx            # Market preview card

contracts/externalContracts.ts    # Deployed contract ABIs + addresses
utils/distributionMath.ts         # JS mirror of Solidity math
```
