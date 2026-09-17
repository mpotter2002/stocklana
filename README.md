# Stocklana

Custom tokenized-equity baskets on Solana. Localnet prototype, not a live
trading product. There is **no hosted demo URL** and no mainnet path.

**Hackathon judges:** start at [JUDGES.md](./JUDGES.md) (one sitting: run from
**Run** below, then wallet → create/deposit → Pyth → Jupiter quote → PreStocks
recipe preview → theme).
Form copy and links: [SUBMISSION.md](./SUBMISSION.md). Recording checklist:
[DEMO.md](./DEMO.md). Submissions close **Friday 25 September 2026, 4:00 PM ET**.

## How to test the prototype

One sitting: local create/deposit, Pyth display quotes, the Jupiter
inventory/quote rail, PreStocks recipe previews, theme toggle, and a
usable UI. This is **localnet only**.
Judges can follow the shorter click path in [JUDGES.md](./JUDGES.md); the
sections below are the same flow with more detail.

### Before you start

- Node.js 24+, Solana CLI, Anchor CLI, and a browser with an injected Solana
  wallet (Phantom, Solflare, Backpack, or similar).
- Point that wallet at **Localnet** `http://127.0.0.1:8899` **before** connecting.
  The UI refuses any other RPC.
- A Hermes / Pyth API key is **optional**. Without it the UI still prices local
  test mints with labeled hermetic quotes. Same for `JUPITER_API_KEY`: the rail
  should load unauthenticated (rate-limited). Copy `.env.example` to gitignored
  `.env.local` only if you want those keys, then restart `npm run dev`.

### 1. Validator → deploy → UI

Two terminals. Copy the commands from **Run** below: `solana-test-validator
--reset` in the first; `anchor build` (basket with `local-testing`, then
mock-swap), `anchor deploy`, `npm ci`, `npm run dev` in the second.

Open `http://127.0.0.1:3000`. Header chips should settle to:

- `LOCAL TEST`
- Validator **Online** (slot number)
- Program **Deployed**
- Jupiter v6 **Not on localnet** — expected on a plain `solana-test-validator`
- Wallet **Ready** once the extension is detected, otherwise **Not detected**

If Program stays **Not deployed**, do not click through. Re-run the Terminal 2
build and deploy. A spinner is not proof the program is live.

### 2. Connect, issue test mints, create and deposit

These are real browser transactions against the local validator. After every
submit the UI waits for a confirmed signature and re-reads basket and token
accounts from RPC. Decline a wallet prompt and the UI must report failure, not
fixture success.

1. Click **Connect wallet**. Approve in the extension. The wallet chip shows a
   shortened address.
2. Ticket primary: **Issue local test tokens**. Approve. The first issue also
   airdrops SOL if the wallet is below 1 SOL. After confirmation you should see
   labeled local mints `USDCt`, `ALPHAt`, `BEACONt`, `CEDARt` — created on this
   validator, not taken from fixtures. Jupiter xStocks are a separate rail and
   are not these mints.
3. Select two or three assets. Leave or edit **Deposit** (USDCt). Ticket primary
   becomes **Create and deposit**. Approve. After confirmation:
   - **Open baskets** shows `1` with an **On chain** badge
   - **Basket custody** and **Wallet USDCt** update from RPC
   - Ticket shows `Phase idle`, a PDA, and a signature
4. Optional in the same sitting: **Deposit** more USDCt, then **Withdraw
   holdings**. Custody and wallet balances must move only after confirmation.

### 3. Pyth valuation

Look at **Valuation** (headline + hint) and the holdings **Quote** column. Those
dollars come from Pyth quotes, never from invented fixture prices.

- **No Hermes key** (the default): heading **Pyth local test quotes**, ticket
  **Pyth source: Local test**. Round hermetic marks are expected (`USDC` $1,
  `AAPL` $100, `MSFT` $200, `GOOGL` $50) and labeled as not live marks.
- **With `PYTH_API_KEY`**: ticket **Pyth source: Hermes**, heading **Pyth Hermes
  quotes**. Restart `npm run dev` after adding the key.
- Unmapped or failed feeds stay **Not priced**. An incomplete basket can show a
  **Partial** total. Reference quotes can appear before a wallet is connected.

Valuation is off-chain display only. This repo does not clone Pyth accounts onto
the local validator and does not do an on-chain Pyth CPI.

### 4. Jupiter inventory / quote rail

Scroll to **Jupiter xStocks and indexes**. Catalog and `/build` quotes load
independently of local test mints.

Source badge:

- **JUPITER LIVE** — Tokens API catalog loaded (indexes and xStocks listed)
- **JUPITER BLOCKED** — Jupiter unreachable; the UI will not invent mints
- **BACKPACK BACKUP** — Jupiter blocked; venue symbols only, no Solana mints

Then:

1. Confirm the rail says Jupiter v6 on this validator is **not present — CPI
   cannot land here**.
2. Select an index or xStock, enter a quote amount, click **Preview Jupiter
   route**.
3. A successful preview is labeled **Jupiter quote (not a fill)**. Min out is
   `otherAmountThreshold`, not a landed swap. Ticket **Execution rail** reads
   `Jupiter (quote only here)`.

**Localnet Jupiter CPI is N/A.** A plain validator does not host Jupiter v6 or
route AMMs, so a swap will not land here. Quotes are not fills. If a basket were
mid-operation, recovery is **Begin exit** then **Withdraw in kind** — in-kind
exit does not depend on Jupiter or Pyth.

### 5. PreStocks recipe rail

Scroll past Jupiter to **PreStocks recipes**. Same-origin
`GET /api/recipes/inventory` loads only the hackathon-documented PreStocks
catalog (`GET https://prestocks.com/api/prestocks`). Mints come from that
payload (or from a labeled recorded copy). The UI never invents a mint, a fill,
or a Pyth dollar from this rail.

**PreStocks bounty eligibility:** this path is PreStocks-only. Non-PreStocks
pre-IPO tokens, including Tessera, are **not** loaded into recipes. Tessera
appears only as a related link-out, not as a recipe, swap, or basket mint.

Badges:

- **PRESTOCKS LIVE** — PreStocks API responded
- **PRESTOCKS FIXTURE** — live path blocked or `STOCKLANA_RECIPE_SOURCE=fixture`;
  recorded PreStocks catalog, labeled not live
- **PRESTOCKS UNAVAILABLE** — empty; no invented rows

Select a 2–3 asset PreStocks recipe. The panel is **PreStocks recipe preview
(not a create, not a fill)**. Equal weights are the same `targetBps` helper
used for local baskets. Localnet create is **N/A**: these mints are not on the
validator. Local create/deposit keeps using issued `USDCt` / `ALPHAt` /
`BEACONt` / `CEDARt`. Issuer `tokenPrice` / `markPrice` fields are not shown
and are not Pyth marks.

### 6. UI and viewport

The brokerage layout (header status, valuation, holdings, ticket, Jupiter rail,
recipe rail) should be usable on a desktop window.

Narrow to about **390px** and check:

- Header chips wrap; refresh stays with the wallet actions
- Pyth quote rows stack so prices do not overlap symbols
- Jupiter inventory status URLs wrap; lists stay readable
- Recipe rail badges wrap; mint previews stay readable
- No horizontal overflow

**Appearance:** icon button on the wordmark row (sun / moon / monitor). It
cycles **System → Light → Dark**. Default is System (`prefers-color-scheme`).
The choice is stored in `localStorage` as `stocklana.theme`.

### Out of this sitting

- Creating a basket from PreStocks mints on localnet
- Mixing Tessera or other non-PreStocks pre-IPO tokens into a PreStocks recipe
- Treating a recipe preview, a Jupiter quote, or a spinner as a fill
- Mainnet, funded live wallets, or a hosted deploy
- Landing a Jupiter swap on localnet (quote/honest limits only; see
  [JUDGES.md](./JUDGES.md))

TypeScript checks without a validator: `npm run check`. Rust / Anchor tests are
separate (`cargo test --workspace`, `anchor test --skip-build`).

## Run

Requires Node.js 24 or newer.

Point an injected Solana wallet at **Localnet** `http://127.0.0.1:8899`
before connecting. The UI only submits transactions to that loopback RPC.
The one-sitting walkthrough is **How to test the prototype** above.

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

PreStocks recipes use same-origin `/api/recipes/inventory`. Optional:

```sh
# STOCKLANA_RECIPE_SOURCE=auto   # auto | live | fixture
# PRESTOCKS_API_URL=https://prestocks.com/api/prestocks
```

`auto` tries the PreStocks API, then a labeled recorded PreStocks catalog.
`live` leaves the rail empty if PreStocks is blocked. `fixture` never calls the
network. Tessera is not fetched.
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
- PreStocks recipe previews from the documented PreStocks catalog (live or
  labeled recorded fallback). PreStocks-only; not executable on localnet.

Not implemented: live Jupiter fills on the local validator, browser mock-leg
execution, basket create from PreStocks mints, basket closure, public
deployment, or funded live transactions. No real-world asset has been approved
for execution. Tessera pre-IPO tokens are a related link-out only and are not
part of the PreStocks recipe integration.

Verified locally on September 15, 2026 with Rust 1.98.1, Agave 2.3.0, and
Anchor 0.32.1. `Cargo.lock` intentionally pins several transitive crates to
versions compatible with Agave's SBF Rust 1.84 toolchain. See
`docs/toolchain.md` before updating Rust dependencies.

## Structure

- `lib/`: TypeScript helpers, including Pyth quote parsing and bigint valuation.
- `lib/jupiter/`: Jupiter inventory, `/build` parsing, and CPI remaining-account
  checks. Network calls stay in the same-origin API routes.
- `lib/recipes/`: PreStocks catalog parser, equal-weight PreStocks-only recipe
  composition, and labeled recorded fallback.
- `tests/*.test.ts`: Node's built-in test runner, no blockchain or wallet required.
- `tests/fixtures/jupiter/`: recorded Tokens API and `/swap/v2/build` payloads.
- `tests/integration/`: local-validator Anchor scenarios.
- `programs/basket/`: personal basket custody and operation program.
- `programs/mock-swap/`: local-only deterministic swap fixture.
- `app/` and `components/`: local demonstration UI, including `/api/pyth/latest`,
  the Jupiter rail, and the PreStocks recipe rail.
- `lib/solana/`: typed local RPC, PDA, account decoding, instruction builders,
  local transaction submission, and injected-wallet boundaries.
- `lib/pyth/`: official feed IDs, Hermes client, hermetic quotes, and holdings
  valuation.
- `docs/first-milestone.md`: completed milestone and next integration target.
- `JUDGES.md`: one-sitting hackathon judge path (localnet limits and click path).
- `SUBMISSION.md`: form copy, links, and bounty honesty for Stocklana.
- `DEMO.md`: short-video recording checklist. There is no hosted demo.

The product plan remains at `../Stocklana-Custom-Baskets-Plan.md`.

## Safety

No private keys, secrets, public deployment, or mainnet transaction paths
are committed. Optional `PYTH_API_KEY` belongs in gitignored `.env.local`.
The transaction runner refuses any RPC other than
`http://127.0.0.1:8899` or `http://localhost:8899`. Test tokens, mock
execution, and local-test Pyth quotes must always be labeled. Issuer
eligibility restrictions need review before any live demonstration. This
prototype is unaudited.
