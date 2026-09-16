# Stocklana

Custom tokenized-stock baskets. Local foundation, not a live trading product.

## Run

Requires Node.js 24 or newer.

Point an injected Solana wallet at **Localnet** `http://127.0.0.1:8899`
before connecting. The UI only submits transactions to that loopback RPC.

```sh
# Terminal 1: local validator
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
solana-test-validator --reset

# Terminal 2: deploy programs, then start the UI
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
anchor build -p basket -- --features local-testing
anchor build -p mock-swap
anchor deploy
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Connect the wallet, issue local test tokens,
then create and deposit. The UI waits for a confirmed signature and re-reads
basket and token accounts from RPC before treating the submit as complete.

Checks without a validator:

```sh
npm run check
```

On-chain program tests:

```sh
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cargo test --workspace
anchor test --skip-build
```

After changing the Anchor interface, run the local builds above, `npm run idl:sync`,
and `npm run idl:check`. The committed IDL is the browser client's decoding
and instruction-encoding contract.

Default basket builds exclude mock execution. `local-testing` is an explicit
local-only opt-in. On an already running validator, use
`anchor test --skip-build --skip-local-validator` after the local builds.
Do not pass the basket feature to a workspace-wide Anchor build: Anchor also
forwards it to the mock-swap package, which does not declare that feature.

## Status

Implemented:

- Lossless raw-amount and allocation helpers.
- Recovery-action selection from observed operation state.
- Owner-derived personal basket PDA.
- Recipe validation for two or three distinct SPL/Token-2022 mints.
- Creation verifies actual mint accounts and their token-program owners.
  Only extension-free mints are admitted; scaled-UI support is still deferred.
- Owner deposits into PDA-controlled associated token accounts.
- Full owner withdrawal, including zero-balance custody-account closure.
  Unreviewed account extensions leave the custody account open so rent cleanup
  does not block a transfer; issuer transfer restrictions can still block exit.
- Nonced, expiring operation plans with committed per-leg input budgets,
  output mints, and minimum outputs.
- Atomic local mock legs with rollback on insufficient output, replay
  rejection, retry support, and explicit operation completion.
- `begin_exit` recovery that supersedes queued operations while preserving
  full in-kind withdrawal without a swap service.
- Local-validator tests for classic SPL and plain Token-2022 test mints.
- Rejection tests for another wallet, a substituted destination, and a mint
  outside the basket recipe.
- A responsive local UI for selecting two or three test assets and computing
  equal allocations.
- A browser-safe typed client boundary for exact PDA derivation, Anchor account
  decoding, instruction builders, and `bigint`-preserving basket snapshots.
- Live local-validator and program-deployment readiness checks.
- Discovery, connect, disconnect, and account-change handling for an injected
  Solana browser wallet.
- Local-only wallet transaction construction, signature, submission, and
  confirmation for create, deposit, withdraw, begin-exit, and finish.
- Wallet-funded local test mint issuance. Displayed balances and basket phase
  come from confirmed RPC reads, not fixture success.

Not implemented: Jupiter execution, live valuation, browser mock-leg
execution, basket closure, public deployment, or funded live transactions.
No real-world asset has been approved for execution.

Verified locally on September 15, 2026 with Rust 1.98.1, Agave 2.3.0, and
Anchor 0.32.1. `Cargo.lock` intentionally pins several transitive crates to
versions compatible with Agave's SBF Rust 1.84 toolchain. See
`docs/toolchain.md` before updating Rust dependencies.

## Structure

- `lib/`: pure, network-independent TypeScript.
- `tests/*.test.ts`: Node's built-in test runner, no blockchain or wallet required.
- `tests/integration/`: local-validator Anchor scenarios.
- `programs/basket/`: personal basket custody and operation program.
- `programs/mock-swap/`: local-only deterministic swap fixture.
- `app/` and `components/`: local demonstration UI.
- `lib/solana/`: typed local RPC, PDA, account decoding, instruction builders,
  local transaction submission, and injected-wallet boundaries.
- `docs/first-milestone.md`: completed milestone and next integration target.

The product plan remains at `../Stocklana-Custom-Baskets-Plan.md`.

## Safety

No private keys, secrets, public deployment, or mainnet transaction paths
are committed. The transaction runner refuses any RPC other than
`http://127.0.0.1:8899` or `http://localhost:8899`. Test tokens and mock
execution must always be labeled. Issuer eligibility restrictions need review
before any live demonstration. This prototype is unaudited.
