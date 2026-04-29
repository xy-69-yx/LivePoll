# live-poll-contract JS

This folder contains the generated TypeScript client used by the Vite app to
talk to the upgraded poll contract.

The contract ABI is regenerated from the local Wasm artifact, not from a live
network deployment. From [`live-poll-website`](../../), use:

```bash
npm run build:contracts
npm run refresh:contract-client
```

The application sets the RPC URL, network passphrase, and contract ID in
[`src/lib/pollClient.js`](../../src/lib/pollClient.js) and
[`.env.example`](../../.env.example). This generated package is only responsible
for the contract method surface.
