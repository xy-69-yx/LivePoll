# Live Poll on Stellar Testnet

[![CI](https://github.com/xy-69-yx/LivePoll/actions/workflows/ci.yml/badge.svg)](https://github.com/xy-69-yx/LivePoll/actions/workflows/ci.yml)
[![Deploy](https://github.com/xy-69-yx/LivePoll/actions/workflows/deploy.yml/badge.svg)](https://github.com/xy-69-yx/LivePoll/actions/workflows/deploy.yml)

Advanced poll dApp built with Soroban smart contracts and a React frontend. This project includes a poll contract with voting rewards, a reward token contract, inter-contract minting, CI/CD automation, and a mobile-responsive production dashboard.

## 📑 Table of Contents

- [Quick Links](#-quick-links)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Smart Contracts](#-smart-contracts)
- [Current Deployment](#-current-deployment)
- [Testing & Verification](#-testing--verification)

## 🔗 Quick Links

- **Live Demo**: [live-poll-adv.vercel.app](https://live-poll-adv.vercel.app/)
- **Demo Video**: [Google Drive Recording](https://drive.google.com/file/d/1UR3PWTMgjcDsVdP7BnRU-rHqyRAdyuBA/view?usp=sharing)
- **Local MP4 Asset**: [`docs/live-poll-demo.mp4`](./docs/live-poll-demo.mp4)

## ✨ Features

- **Inter-contract Calls**: `vote_for` in the poll contract mints reward points through the separate reward-token contract with full test coverage
- **Custom Reward Token**: `poll-reward-token` contract with admin handoff and mint tracking
- **Responsive Design**: Adapts across desktop and mobile with stacked controls, responsive cards, and readable event feed
- **Legacy Support**: Frontend detects contract version and falls back to `vote` when advanced contract pair hasn't been redeployed
- **Real-time Events**: Streams both `voted` and `rewarded` Soroban events into activity feed
- **Production Ready**: GitHub Actions CI, Vite chunk splitting, wallet persistence fixes, and mobile-first layout

## 📦 Project Structure

```
live-poll-contract/          # Soroban Smart Contracts (Rust)
├── contracts/
│   ├── hello-world/         # Primary poll contract
│   └── poll-reward-token/   # Reward token contract
└── Cargo.toml

live-poll-website/           # React Frontend (Vite)
├── src/
├── public/
├── package.json
└── vite.config.js

.github/workflows/           # GitHub Actions CI/CD
├── ci.yml                   # Contract & website tests
├── deploy.yml               # Vercel deployment
└── validate-pr.yml          # PR validation

docs/                        # Documentation & assets
Makefile                     # Development commands
```

## 🏗️ Architecture

### Poll Contract (`live-poll-contract/contracts/hello-world/`)
Primary contract that manages voting and rewards:
- Keeps legacy `vote(option)` support
- Adds advanced `vote_for(voter, option)` with reward minting
- Tracks voter-level tallies and reward balances

### Reward Token Contract (`live-poll-contract/contracts/poll-reward-token/`)
Handles reward token management:
- Tracks balances and total supply
- Supports admin handoff to poll contract
- Mints tokens on successful votes

### Frontend (`live-poll-website/`)
React + Vite application:
- Auto-detects advanced contract support
- Shows wallet-specific reward stats
- Streams Soroban events in real-time
- Mobile-responsive layout

## 🚀 Getting Started

### Quick Start

```bash
# Clone repository
git clone https://github.com/xy-69-yx/LivePoll.git
cd LivePoll

# Install everything
make setup

# (Optional) Install pre-commit hooks for local validation
make pre-commit-setup
```

### Contract Development

```bash
cd live-poll-contract

# Run tests
cargo test

# Build contracts
stellar contract build --manifest-path Cargo.toml --out-dir dist

# Or use make commands
make test
make build-contracts
```

### Frontend Development

```bash
cd live-poll-website

# Install dependencies
npm install

# Build contracts and generate TypeScript bindings
npm run prepare:contracts

# Start development server
npm run dev
```

Development server runs at `https://localhost:5173/` (accept HTTPS warning once)

### Environment Configuration

Copy environment template to use custom deployment:

```bash
cp live-poll-website/.env.example live-poll-website/.env
```

Edit `.env` to point at different poll deployment if needed.

## 📋 Smart Contracts

### Poll Contract Interface

```rust
vote(option: Symbol) -> u32
vote_for(voter: Address, option: Symbol) -> u32
get_votes(option: Symbol) -> u32
get_total_votes() -> u32
get_voter_votes(voter: Address) -> u32
get_reward_balance(voter: Address) -> u32
get_reward_rate() -> u32
get_reward_contract() -> Address
get_last_option() -> Symbol
set_reward_rate(rate: u32)
```

### Reward Token Contract Interface

```rust
admin() -> Address
set_admin(next: Address)
mint(to: Address, amount: u32) -> u32
balance(owner: Address) -> u32
total_supply() -> u32
name() -> Symbol
symbol() -> Symbol
```

## 🌐 Current Deployment

- **Frontend URL**: [live-poll-adv.vercel.app](https://live-poll-adv.vercel.app/)
- **Contract ID**: `CC43GCB3LMRLKQ6JFJCPNT2QJXVOK73Y5HWAF7RZAYIMRL322I7WIZ6L`
- **Deploy TX**: `d7a8f8f378e8813c45db34e28e0721c11758c990564fe6864eb61753edfbf418`
- **Verified TX**: `3c9004799722dc8dc79781602aef11f4e987b843d9d185183f45a478826f49dc`

**Note**: Current public contract is legacy poll deployment. The upgraded reward-token pair is implemented and locally verified but not yet published. Frontend automatically detects this and maintains backward compatibility.

## ✅ Testing & Verification

### Run All Tests

```bash
# Test contracts
cd live-poll-contract && cargo test

# Test website build
cd live-poll-website && npm run lint && npm run build
```

### Test Coverage

- **Poll Contract**: 6+ passing tests
- **Reward Token Contract**: 3+ passing tests
- **Website**: ESLint validation + build verification

---

**Project Status**: Production-ready with comprehensive smart contract features and mobile responsiveness.

## Deployment Flow for the Advanced Pair

1. Deploy `poll-reward-token` with an operator wallet as the temporary admin.
2. Deploy the upgraded poll contract with the reward-token contract ID and your desired reward rate.
3. Call `set_admin` on the reward token so the poll contract address becomes the minting admin.
4. Update `VITE_POLL_CONTRACT_ID` to the new poll contract ID and redeploy the frontend.

Because the app keeps the legacy `vote` path, the current live demo can stay up
while the advanced contracts are being rolled out.

### Advanced Deployment Records (fill after deploying)

- Reward token contract ID: `TODO`
- Reward token deploy transaction hash: `TODO`
- Advanced poll contract ID: `TODO`
- Advanced poll deploy transaction hash: `TODO`

## Key Files

- Poll contract: [`live-poll-contract/contracts/hello-world/src/lib.rs`](./live-poll-contract/contracts/hello-world/src/lib.rs)
- Poll contract tests: [`live-poll-contract/contracts/hello-world/src/test.rs`](./live-poll-contract/contracts/hello-world/src/test.rs)
- Reward token contract: [`live-poll-contract/contracts/poll-reward-token/src/lib.rs`](./live-poll-contract/contracts/poll-reward-token/src/lib.rs)
- Reward token tests: [`live-poll-contract/contracts/poll-reward-token/src/test.rs`](./live-poll-contract/contracts/poll-reward-token/src/test.rs)
- Frontend app: [`live-poll-website/src/App.jsx`](./live-poll-website/src/App.jsx)
- Frontend styles: [`live-poll-website/src/App.css`](./live-poll-website/src/App.css)
- Frontend contract client helpers: [`live-poll-website/src/lib/pollClient.js`](./live-poll-website/src/lib/pollClient.js)
- Frontend contract bindings: [`live-poll-website/packages/live-poll-contract/src/index.ts`](./live-poll-website/packages/live-poll-contract/src/index.ts)
- Wallet integration: [`live-poll-website/src/lib/walletKit.js`](./live-poll-website/src/lib/walletKit.js)
- CI workflow: [`/.github/workflows/ci.yml`](./.github/workflows/ci.yml)
