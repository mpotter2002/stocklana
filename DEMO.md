# Stocklana — short demo recording

Checklist for a **2–4 minute** video. There is no hosted demo; record against localnet after the README **Run** steps. Judge click path: [JUDGES.md](./JUDGES.md).

Do not imply a public URL, a landed Jupiter swap, or live issuer tokens.

## Before record

- [ ] Terminal 1: `solana-test-validator` running (prefer a fresh `--reset` so the story is clean).
- [ ] Terminal 2: basket built with `local-testing`, mock-swap built, `anchor deploy`, `npm run dev`.
- [ ] Browser at `http://127.0.0.1:3000` (not a LAN/ngrok URL unless you say it is still your machine).
- [ ] Injected wallet on **Localnet** `http://127.0.0.1:8899` before connect. Hide seed phrases and any `.env.local` keys.
- [ ] Header chips: `LOCAL TEST`, Validator **Online**, Program **Deployed**, Jupiter v6 **Not on localnet**, Wallet **Ready**.
- [ ] Optional: `PYTH_API_KEY` only if you will say **Pyth Hermes**. Default sitting is **Pyth local test** and is enough.
- [ ] Desktop ~1440px. Optional second pass ~390px.

## Shot list

Say the limit out loud when it is on screen (localnet, quote not a fill, stand-in mints).

| # | Shot | On screen | Line to say |
| --- | --- | --- | --- |
| 1 | Product | Wordmark **Stocklana** / **Custom baskets**, `LOCAL TEST` | Personal tokenized-equity baskets on Solana. Localnet prototype, not a live brokerage. |
| 2 | Theme | Wordmark-row sun/moon/monitor | Theme cycles System, Light, Dark. Pick one look and stay there unless you show both. |
| 3 | Runtime | Validator **Online**, Program **Deployed**, Jupiter v6 **Not on localnet** | Program is on this validator. Jupiter v6 is not; that is expected. |
| 4 | Wallet | **Connect wallet** → shortened address | Wallet is pointed at localnet. Decline would show failure, not a fake success. |
| 5 | Mints | **Issue local test tokens** → `USDCt`, `ALPHAt`, `BEACONt`, `CEDARt` | These mints were created here. They are not Jupiter xStocks. |
| 6 | Basket tx | Select 2–3 assets → **Create and deposit** → **Open baskets** `1` **On chain** | Browser tx, confirmed signature, then RPC re-read. Custody is the PDA, not a pooled receipt. |
| 7 | Pyth | **Valuation** + holdings **Quote** + ticket **Pyth source** | Dollars are Pyth quotes. Local-test marks are labeled. Missing feeds stay not priced. |
| 8 | Jupiter | **Jupiter xStocks and indexes**, **JUPITER LIVE**, v6 **not present — CPI cannot land here** | Catalog is live metadata. This validator cannot land the CPI. |
| 9 | Quote | **Preview Jupiter route** → **Jupiter quote (not a fill)** | Min out is `otherAmountThreshold`. Ticket rail: `Jupiter (quote only here)`. |
| 10 | Recipes | **PreStocks and Tessera recipes**, LIVE or FIXTURE badges | Catalog from documented APIs. Preview is not a create. Issuers stay separate. |
| 11 | Recipe preview | Select OpenAI+Anthropic and T-OpenAI+T-Kalshi | Localnet create N/A. Not Pyth. Not a fill. |
| 12 | Optional recover | **Withdraw holdings** (or **Begin exit** then **Withdraw in kind** if mid-operation) | In-kind exit does not need Jupiter or Pyth. |

Skip shots 4–6 only if you cannot show a wallet; then say so and still show Pyth + Jupiter + recipe honesty (shots 7–11).

## Do not

- Call the quote a fill, a buy, or “Jupiter working on localnet”
- Show mainnet, a funded live wallet, or a claimed hosted URL
- Call a PreStocks/Tessera recipe preview a live basket or a fill
- Leave a spinner up and call the trade done
- Zoom past **Not priced**, **JUPITER BLOCKED**, **FIXTURE**, **UNAVAILABLE**, or **Not on localnet** as if they were errors to hide

## After record

- [ ] Upload somewhere judges can open with `https://` (YouTube, unlisted is fine).
- [ ] Paste that URL on the hackathon form ([SUBMISSION.md](./SUBMISSION.md)). Do not commit video binaries to git.
- [ ] Keep the GitHub repo as the source of truth: README **Run** + [JUDGES.md](./JUDGES.md).
