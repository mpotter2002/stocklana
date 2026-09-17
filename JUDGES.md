# Stocklana — judge path

One sitting. Localnet only. There is **no hosted demo URL**.

This is the shortest honest path through the prototype: what the product is, how to run it from the README, what will not work on a plain validator, and what to click.

Hackathon: [Solana Stocklana](https://hackathons.solana.com/hackathons/stocklana). Submissions close **Friday 25 September 2026, 4:00 PM ET**. Form copy and links: [SUBMISSION.md](./SUBMISSION.md). Recording shots: [DEMO.md](./DEMO.md).

## Product job

Stocklana is a **personal tokenized-equity basket** on Solana: one owner, one PDA, two or three SPL / Token-2022 mints, deposit and withdraw in kind.

The user problem is the brokerage-app gap for tokenized stocks that already trade on Solana: assemble a small custom basket, keep custody on a program-owned account, and recover holdings without depending on a swap venue or a price service.

Why this belongs on Solana rather than a ported web app:

- Owner-derived basket PDA and on-chain authorization (owner, nonce, leg, mints, programs, destinations, spend bounds, minimum outputs).
- Browser-signed transactions against a local validator, with a confirmed signature and an RPC re-read before the UI treats the action as done.
- **Pyth** for off-chain holdings valuation (Hermes when a key is set; otherwise labeled local-test quotes). Missing feeds stay **Not priced**.
- **Jupiter** as the xStocks / index inventory and `/swap/v2/build` quote rail. Quotes are labeled as quotes, not fills.

This build does **not** include PreStocks or Tessera recipe options.

## How to run

Copy the commands from **Run** in [README.md](./README.md). Two terminals:

1. `solana-test-validator --reset`
2. `anchor build` (basket with `local-testing`, then mock-swap), `anchor deploy`, `npm ci`, `npm run dev`

Open **`http://127.0.0.1:3000`**. Point an injected Solana wallet at **Localnet** `http://127.0.0.1:8899` **before** connecting. The UI refuses any other RPC.

Header chips should settle to `LOCAL TEST`, Validator **Online**, Program **Deployed**, Jupiter v6 **Not on localnet**, Wallet **Ready** (or **Not detected** until the extension is found). If Program stays **Not deployed**, do not click through — rebuild and redeploy from Terminal 2.

A Hermes / Pyth key and a Jupiter API key are optional. Without them the UI still prices local test mints with labeled hermetic quotes, and the Jupiter rail should load unauthenticated (rate-limited).

TypeScript without a validator: `npm run check`. Rust / Anchor tests are separate (`cargo test --workspace`, `anchor test --skip-build`).

## Localnet limits (read before clicking)

| Surface | What you will see | What it is not |
| --- | --- | --- |
| Network | Loopback RPC only (`127.0.0.1:8899` / `localhost:8899`) | Hosted demo, devnet, or mainnet |
| Test mints | `USDCt`, `ALPHAt`, `BEACONt`, `CEDARt` created on this validator | Live issuers or Jupiter xStock mints |
| Pyth | Display quotes; **Pyth local test** without a key; **Pyth Hermes** with `PYTH_API_KEY` | On-chain Pyth CPI or cloned Pyth accounts |
| Jupiter | Tokens API catalog + `/build` quote labeled **Jupiter quote (not a fill)** | A landed swap on this validator |
| Jupiter v6 chip | **Not on localnet** on a plain `solana-test-validator` | A bug; CPI cannot land here |
| Recovery | **Begin exit** then **Withdraw in kind** | A Jupiter- or Pyth-dependent unwind |
| UI progress | Spinner / ticket text | Proof a trade landed — re-read chain first |

**Jupiter honesty:** a successful **Preview Jupiter route** is a quote. Min out is `otherAmountThreshold`, not a fill. Ticket **Execution rail** reads `Jupiter (quote only here)`. The rail itself says Jupiter v6 on this validator is **not present — CPI cannot land here**. Do not treat inventory `usdPrice` as a basket mark; valuation stays on Pyth.

## What to click (short demo)

After the header chips look healthy:

1. **Theme** — icon button on the wordmark row (sun / moon / monitor). Cycles **System → Light → Dark**. Default is System.
2. **Connect wallet** — approve in the extension. Wallet chip shows a shortened address.
3. **Issue local test tokens** — ticket primary. First issue may airdrop SOL if the wallet is below 1 SOL. After confirmation you should see labeled local mints, not fixture names from Jupiter.
4. Select two or three assets. Leave or edit **Deposit** (USDCt). **Create and deposit** — approve. After confirmation: **Open baskets** `1` with **On chain**, **Basket custody** and **Wallet USDCt** update from RPC, ticket shows `Phase idle`, a PDA, and a signature.
5. **Pyth** — **Valuation** headline + hint, holdings **Quote** column. Without a key: heading **Pyth local test quotes**, ticket **Pyth source: Local test**, round hermetic marks (`USDC` $1, `AAPL` $100, `MSFT` $200, `GOOGL` $50) labeled as not live markets. Unmapped feeds stay **Not priced**.
6. **Jupiter rail** — scroll to **Jupiter xStocks and indexes**. Badge **JUPITER LIVE** when the Tokens API catalog loaded (or **JUPITER BLOCKED** / **BACKPACK BACKUP** if Jupiter is unreachable — the UI will not invent mints). Confirm the v6 line is **not present — CPI cannot land here**. Select an index or xStock, enter a quote amount, **Preview Jupiter route**. Success is labeled **Jupiter quote (not a fill)**.
7. Optional in the same sitting: **Deposit** more USDCt, then **Withdraw holdings**. Balances move only after confirmation.

Decline a wallet prompt and the UI must report failure, not fixture success.

## Out of this sitting

- PreStocks / Tessera
- Mainnet, funded live wallets, or a hosted deploy
- Landing a Jupiter swap on localnet
- Treating a quote, a spinner, or a Pyth dollar as an on-chain fill
