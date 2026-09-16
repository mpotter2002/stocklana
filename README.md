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

Basket and holdings dollars come from Pyth quotes, not fixture prices. See
**Pyth valuation** below. Without a Hermes API key the UI uses labeled
local-test Pyth-format quotes so local-dev still shows priced vs not-priced
honestly.

Jupiter xStocks/indexes load from same-origin `/api/jupiter/inventory` (Tokens
API, then search fallback). Route previews use `/api/jupiter/build`. Optional
`.env.local` (gitignored):

```sh
# JUPITER_API_KEY=          # forwarded server-side as x-api-key
# JUPITER_API_BASE=https://api.jup.ag
# STOCKLANA_INVENTORY_SOURCE=auto   # auto | jupiter | backpack
```

`auto` tries Jupiter first. Backpack `GET /api/v1/markets` is backup only when
Jupiter is blocked; those rows are venue symbols, not Solana mints. Mock-swap
stays the local-testing execution adapter (`anchor build -p basket -- --features local-testing`).
Jupiter CPI needs the documented v6 program and route AMMs on the same
validator as the basket; a plain local validator will not land those swaps.

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

## Pyth valuation

Holdings are valued from Pyth price quotes. The UI never fills missing quotes
with fixture dollars.

Local test mints are **stand-ins** for official Pyth Core feeds, not those
issuers:

| Local mint | Pyth feed | Feed ID |
| --- | --- | --- |
| USDCt | `Crypto.USDC/USD` | `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| ALPHAt | `Equity.US.AAPL/USD` | `49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688` |
| BEACONt | `Equity.US.MSFT/USD` | `d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1` |
| CEDARt | `Equity.US.GOOGL/USD` | `5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6` |

IDs were read from Hermes `GET /v2/price_feeds` (asset type `crypto` / `equity`).
Unknown mints stay **Not priced**.

The browser calls same-origin `GET /api/pyth/latest`. That route talks to
Hermes server-side so a Pyth API key is never shipped to the client.

### Hermes (optional live quotes)

Pyth Core’s Hermes `/v2/updates/price/latest` endpoint requires an API key
as of the 26 August 2026 upgrade. See
[Hermes](https://docs.pyth.network/price-feeds/core/how-pyth-works/hermes)
and [fetching price updates](https://docs.pyth.network/price-feeds/core/fetch-price-updates).

Copy `.env.example` to `.env.local` (gitignored) and restart `npm run dev`:

```sh
PYTH_API_KEY=your_key
# PYTH_HERMES_URL=https://hermes.pyth.network
# STOCKLANA_PYTH_SOURCE=auto
```

`STOCKLANA_PYTH_SOURCE`:

- `auto` (default): try Hermes; on failure use labeled local-test quotes
- `hermes`: Hermes only; failed or missing feeds stay not priced
- `local-test`: skip Hermes and use the hermetic quotes below

Point `PYTH_HERMES_URL` at a local Hermes instance if you run one. This repo
does not vendor Hermes or clone Pyth accounts onto the local validator.
Valuation is off-chain display only; it is not an on-chain Pyth receiver CPI.

### Local / hermetic quotes

When Hermes is unset or unreachable, `/api/pyth/latest` returns Pyth-format
quotes (`price`, `conf`, `expo`, `publish_time`) from `LocalTestPythQuotes`.
The UI labels this **Pyth local test**. The hermetic marks are round numbers
(`USDC` $1, `AAPL` $100, `MSFT` $200, `GOOGL` $50, expo `-8`), not live
markets. Unit tests parse a documented Hermes payload and do not call the
network.

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
- Basket and holdings valuation from Pyth Hermes when a key is configured,
  otherwise from labeled local-test Pyth-format quotes. Unmapped or failed
  feeds stay **Not priced**; incomplete baskets show a **Partial** total.
- Jupiter Tokens API inventory for xStocks and indexes, plus `/swap/v2/build`
  quotes and an `execute_jupiter_leg` CPI instruction. Quotes are labeled as
  quotes, not fills. Localnet still cannot land Jupiter AMMs.

Not implemented: live Jupiter fills on the local validator, browser mock-leg
execution, basket closure, public deployment, or funded live transactions.
No real-world asset has been approved for execution.

Verified locally on September 15, 2026 with Rust 1.98.1, Agave 2.3.0, and
Anchor 0.32.1. `Cargo.lock` intentionally pins several transitive crates to
versions compatible with Agave's SBF Rust 1.84 toolchain. See
`docs/toolchain.md` before updating Rust dependencies.

## Structure

- `lib/`: TypeScript helpers, including Pyth quote parsing and bigint valuation.
- `lib/jupiter/`: Jupiter inventory, `/build` parsing, and CPI remaining-account
  checks. Network calls stay in the same-origin API routes.
- `tests/*.test.ts`: Node's built-in test runner, no blockchain or wallet required.
- `tests/fixtures/jupiter/`: recorded Tokens API and `/swap/v2/build` payloads.
- `tests/integration/`: local-validator Anchor scenarios.
- `programs/basket/`: personal basket custody and operation program.
- `programs/mock-swap/`: local-only deterministic swap fixture.
- `app/` and `components/`: local demonstration UI, including `/api/pyth/latest`
  and the Jupiter rail.
- `lib/solana/`: typed local RPC, PDA, account decoding, instruction builders,
  local transaction submission, and injected-wallet boundaries.
- `lib/pyth/`: official feed IDs, Hermes client, hermetic quotes, and holdings
  valuation.
- `docs/first-milestone.md`: completed milestone and next integration target.

The product plan remains at `../Stocklana-Custom-Baskets-Plan.md`.

## Safety

No private keys, secrets, public deployment, or mainnet transaction paths
are committed. Optional `PYTH_API_KEY` belongs in gitignored `.env.local`.
The transaction runner refuses any RPC other than
`http://127.0.0.1:8899` or `http://localhost:8899`. Test tokens, mock
execution, and local-test Pyth quotes must always be labeled. Issuer
eligibility restrictions need review before any live demonstration. This
prototype is unaudited.
