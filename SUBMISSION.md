# Stocklana — hackathon submission notes

Packaging for the [Solana Stocklana](https://hackathons.solana.com/hackathons/stocklana) form. **Do not merge this as a claim that the app is hosted.**

- **Deadline:** Friday 25 September 2026, 4:00 PM ET
- **Judges sit here:** [JUDGES.md](./JUDGES.md)
- **How to run:** [README.md](./README.md)
- **Video shots:** [DEMO.md](./DEMO.md)

## Links to put on the form

Give judges at least one `https://` link. This prototype has **no hosted demo**.

| Field | Value |
| --- | --- |
| Project name | Stocklana |
| GitHub | `https://github.com/mpotter2002/stocklana` |
| Judge path (this repo) | [JUDGES.md](./JUDGES.md) |
| Live demo URL | **None.** Localnet only (`http://127.0.0.1:3000` after the README **Run** steps). Do not invent a Vercel/public URL. |
| Pitch / technical video | Optional. Record from [DEMO.md](./DEMO.md) and paste the public video URL here when you have one. |

Edits stay open until the deadline. Invite teammates from the submit form if anyone else should be listed.

## Suggested description (paste, then trim)

Stocklana is a personal tokenized-equity basket on Solana: one owner, one PDA, two or three assets, with deposit and in-kind withdraw. The job is to make custom baskets for tokenized stocks that already live on Solana feel closer to a brokerage console than a generic DeFi dump, without pooling receipts or pretending a quote is a fill.

The local prototype lets a judge run a validator, open `http://127.0.0.1:3000`, connect a wallet on Localnet, issue labeled test mints, and create/deposit with real browser transactions. After each submit the UI waits for a confirmed signature and re-reads basket and token accounts from RPC. Holdings dollars come from Pyth (Hermes when a key is set; otherwise labeled local-test quotes). Jupiter is the xStocks and index inventory rail; `/swap/v2/build` previews are labeled **not a fill**. A plain `solana-test-validator` does not host Jupiter v6 or route AMMs, so CPI cannot land here. Recovery is in-kind and does not depend on Jupiter or Pyth.

This is a local foundation, not a live trading product. No mainnet execution and no funded live wallets. PreStocks appears as labeled recipe previews from its documented catalog only; those mints are not created on localnet and previews are not fills. Tessera is a related link-out, not part of the PreStocks bounty recipe integration.

## Tracks / bounties

Claim only what this repo actually does.

| Track | This submission |
| --- | --- |
| Main Stocklana (custom baskets / investing wedge) | Yes — personal PDA baskets, local create/deposit/withdraw |
| Pyth market data | Display-only valuation from official Core feed IDs (Hermes or labeled local-test). Not an on-chain Pyth receiver. |
| PreStocks bounty | **Yes, PreStocks-only.** Recipe-preview rail from `GET https://prestocks.com/api/prestocks` (or labeled recorded PreStocks catalog). No Tessera or other non-PreStocks pre-IPO tokens in that integration. Not a live basket. |
| Tessera bounty | **No** — Tessera is a related link-out only; not loaded into recipes |
| Meteora DBC / Clawpump | **No** |

Open-source stack (say so on the form): Solana / Anchor, Next.js, Jupiter Tokens API + `/swap/v2/build`, Pyth Hermes, shadcn/ui.

## What not to write on the form

- A hosted demo, mainnet mint, or live fill
- “Jupiter swap works on localnet”
- A PreStocks create, swap, or fill on localnet
- A PreStocks bounty claim that includes Tessera or other non-PreStocks pre-IPO tokens
- Invented valuations, fixture success, or a public RPC other than the documented loopback
