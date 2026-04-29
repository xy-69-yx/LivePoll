# Live Poll on Stellar Testnet

[![CI](https://github.com/rahul7686/LivePoll-Adv/actions/workflows/ci.yml/badge.svg)](https://github.com/rahul7686/LivePoll-Adv/actions/workflows/ci.yml)

Advanced poll dApp built with Soroban smart contracts and a React frontend.
The current public deployment stays compatible with the legacy poll contract,
while the repo now includes the upgraded reward-token contract, inter-contract
minting flow, CI automation, and a mobile-ready production dashboard.

## Project Links

- Live demo link: [live-poll-adv.vercel.app](https://live-poll-adv.vercel.app/)
- Demo video: [Google Drive recording](https://drive.google.com/file/d/1UR3PWTMgjcDsVdP7BnRU-rHqyRAdyuBA/view?usp=sharing)

## Advanced Submission Checklist

- Inter-contract call working: `vote_for` in the poll contract now mints reward points through the separate reward-token contract and is covered by local tests.
- Custom token included: `poll-reward-token` is part of the Soroban workspace and supports admin handoff plus mint tracking.
- CI/CD running: GitHub Actions now runs contract tests plus frontend lint/build on pushes and pull requests, and Vercel can deploy the root repo via [`vercel.json`](./vercel.json).
- Mobile responsive: the frontend layout now adapts across desktop and mobile with stacked action controls, responsive analytics cards, and an event feed that stays readable on small screens.
- Minimum 8+ meaningful commits: the repository history already exceeds this requirement.

## What Changed

- Legacy-safe contract detection: the frontend probes the deployed contract and falls back to `vote` when the advanced contract pair has not been redeployed yet.
- Advanced voting path: the upgraded poll contract adds `vote_for`, voter-level tallies, reward-rate reads, reward-balance reads, and reward-contract discovery.
- Separate reward token contract: the new token contract tracks balances, total supply, and admin handoff so the poll contract can become the minting authority after deployment.
- Real-time event feed: the app now streams both `voted` and `rewarded` Soroban events into a richer activity feed.
- Production readiness: GitHub Actions CI, Vite chunk splitting, wallet persistence fixes, and mobile-first layout refinements are all included in the repo.

## Architecture

- `live-poll-contract/contracts/hello-world/`
  Primary poll contract. Keeps legacy `vote(option)` support while adding advanced `vote_for(voter, option)` with reward-token minting.
- `live-poll-contract/contracts/poll-reward-token/`
  Reward token contract. Handles balance tracking, total supply, and admin handoff to the poll contract.
- `live-poll-website/`
  React + Vite frontend. Auto-detects advanced contract support, shows wallet-specific reward stats, and streams Soroban events.

## Current Public Deployment

- Frontend URL: [live-poll-adv.vercel.app](https://live-poll-adv.vercel.app/)
- Current public contract ID: `CC43GCB3LMRLKQ6JFJCPNT2QJXVOK73Y5HWAF7RZAYIMRL322I7WIZ6L`
- Deploy transaction hash: `d7a8f8f378e8813c45db34e28e0721c11758c990564fe6864eb61753edfbf418`
- Verified read transaction hash: `3c9004799722dc8dc79781602aef11f4e987b843d9d185183f45a478826f49dc`

The public contract above is still the legacy poll deployment. The upgraded
reward-token pair is implemented and locally verified in this repo, but it has
not been published to a new public contract ID from this snapshot yet. The
frontend is built to detect that case automatically and keep the legacy vote
flow working until the redeploy happens.

## Screenshots

- Mobile responsive view: add `docs/mobile-responsive.png` (take a screenshot with a mobile viewport, e.g. 390×844)

## Recorded Demo

- Demo video: [Google Drive recording](https://drive.google.com/file/d/1UR3PWTMgjcDsVdP7BnRU-rHqyRAdyuBA/view?usp=sharing)
- Local MP4 asset: [`docs/live-poll-demo.mp4`](./docs/live-poll-demo.mp4)

## Local Setup

### Contract workspace

```powershell
cd live-poll-contract
cargo test
stellar contract build --manifest-path Cargo.toml --out-dir dist
```

### Frontend

```powershell
cd live-poll-website
npm install
npm run prepare:contracts
npm run dev
```

If PowerShell blocks `npm.ps1`, use `npm.cmd install` and `npm.cmd run dev`
instead.

For local development, open `https://localhost:5173/` and accept the local
HTTPS warning once if your browser asks.

### Environment

Copy [`live-poll-website/.env.example`](./live-poll-website/.env.example) to a
local `.env` file when you want to point the frontend at a different poll
deployment.

## Smart Contract Surface

### Poll contract

- `vote(option: Symbol) -> u32`
- `vote_for(voter: Address, option: Symbol) -> u32`
- `get_votes(option: Symbol) -> u32`
- `get_total_votes() -> u32`
- `get_voter_votes(voter: Address) -> u32`
- `get_reward_balance(voter: Address) -> u32`
- `get_reward_rate() -> u32`
- `get_reward_contract() -> Address`
- `get_last_option() -> Symbol`
- `set_reward_rate(rate: u32)`

### Reward token contract

- `admin() -> Address`
- `set_admin(next: Address)`
- `mint(to: Address, amount: u32) -> u32`
- `balance(owner: Address) -> u32`
- `total_supply() -> u32`
- `name() -> Symbol`
- `symbol() -> Symbol`

## Tests and Verification

Contract tests now cover both contracts:

- Poll contract: 6 passing tests
- Reward token contract: 3 passing tests

Frontend verification:

```powershell
cd live-poll-contract
cargo test

cd ../live-poll-website
npm.cmd run lint
npm.cmd run build
```

## CI/CD

- CI workflow: [`/.github/workflows/ci.yml`](./.github/workflows/ci.yml)
- Vercel root deployment config: [`vercel.json`](./vercel.json)

The GitHub Actions workflow runs:

- Rust contract tests
- Release Wasm builds for both contracts
- Frontend `npm ci`
- Frontend `npm run lint`
- Frontend `npm run build`

Vercel can keep deploying the repo root from `main` using the existing
workspace-aware commands in `vercel.json`.

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
