# First Milestone

## Completed: Local Custody and Recovery

- Lossless amount parsing/display with unsigned token-range checks.
- Deterministic two/three-asset equal weights and conserving allocations.
- Pure next-action selection from an observed operation snapshot.
- Owner-derived basket PDA with two/three-asset recipe validation.
- Deposits to PDA-controlled associated token accounts.
- Full raw-balance withdrawal and custody-account closure.
- Nonced, expiring operation plans with committed leg inputs and outputs.
- Atomic per-leg completion through an isolated local mock-swap adapter.
- Rollback when a leg produces less than its committed minimum output.
- Rejection of stale operations, duplicate legs, and unauthorized owners.
- Retry after partial execution without losing earlier fills or residual USDC.
- `begin_exit` supersession followed by swap-independent in-kind recovery.
- Local-validator coverage for classic SPL and plain Token-2022 test mints.
- Rejection coverage for cross-owner withdrawal, destination substitution,
  and a mint outside the stored recipe.
- A responsive local UI for selecting two or three test assets and showing
  confirmed basket custody after wallet submission.
- Exact owner/basket PDA derivation and Anchor account decoding from the
  committed browser IDL.
- `bigint`-safe normalization of basket IDs, operation nonces, slots, budgets,
  and minimum outputs.
- Browser-visible checks for the local validator and deployed basket program.
- Injected-wallet discovery, connection, disconnection, and account changes.
- Typed local instruction builders for create, deposit, start, finish, exit,
  withdraw, and Jupiter legs. Mock-swap legs stay out of the public client.
- Local-only wallet sign/send/confirm, with chain state re-read after
  confirmation. Wallet rejection, blockhash expiry, and program errors are
  surfaced in the UI.
- Off-chain Pyth valuation for local test holdings. Hermes when a key is
  configured; otherwise labeled hermetic Pyth-format quotes.
- Jupiter Tokens API inventory for xStocks and indexes, `/swap/v2/build` quote
  parsing, and an on-chain `execute_jupiter_leg` CPI that constrains the
  documented Jupiter v6 program, basket custody, spend, and minimum output.
- PreStocks and Tessera recipe previews from documented issuer catalogs, with
  labeled recorded fallback when an API is blocked. Previews are not creates.

The onchain nonce and completed-leg state provide replay protection. The
TypeScript recovery helper remains a presentation/client decision aid and is
not a substitute for those program checks.

## Current Boundary

- Browser transactions are enabled only against the local validator.
- The mock-swap adapter is a test fixture, not a market venue or production
  dependency, and is not exposed in the public instruction client.
- Local test mints and USDCt balances are labeled test assets. Basket
  valuation uses Pyth quotes (Hermes or labeled local-test). Unmapped mints
  stay not priced; a missing feed is never filled with fixture dollars.
- Jupiter catalog and `/build` quotes are labeled live-metadata / quote-only.
  They are not fills and are not Pyth marks. Local test mints are not Jupiter
  markets.
- PreStocks and Tessera recipe previews use documented issuer catalogs (live or
  labeled recorded fallback). They are not localnet creates, not fills, and not
  Pyth marks. The two issuers are never mixed in one recipe.
- Default basket builds now exclude `local-testing`; only explicitly opted-in
  local builds contain mock execution. Follow the commands in README.md.
- Creation now requires remaining accounts in exact order: funding mint, then
  recipe mints. Each account must match its declared token program and be an
  initialized, extension-free mint. This is a token-compatibility check, not
  issuer verification or a live-asset allowlist.
- Deposits and mock legs recheck mint policy; withdrawals intentionally do not
  apply admission policy, preserving recovery for pre-existing custody.
- Empty custody accounts can be closed. Accounts with extensions other than
  ImmutableOwner are left open after transfer for separate rent cleanup.

## Next: Jupiter CPI landing and live-asset admission

1. A Jupiter CPI round trip still needs a permitted validator that hosts
   Jupiter v6 and the route AMMs. Do not assume a live devnet xStocks market
   exists. Keep mock-swap evidence separate from Jupiter evidence.
2. Do not treat Jupiter `usdPrice` as a basket mark; valuation stays on Pyth.
3. PreStocks/Tessera recipe previews are in the UI. Creating those baskets still
   needs a live-asset eligibility review, mint-extension policy, and mints that
   actually exist on the target cluster.

Local create, deposit, withdraw, and in-kind exit can now be signed in the
browser against a local validator. Jupiter inventory and `/build` quotes are
in the public client. Jupiter buy/sell on localnet remains blocked until those
programs are present. Pyth valuation is display-only and independent of
in-kind recovery.

## Acceptance

An owner can deposit local SPL or plain Token-2022 fixtures, execute a
recoverable multi-leg operation, retry a failed leg or supersede the operation,
and fully withdraw the resulting holdings. Another owner cannot move the funds
or substitute a destination. Browser-driven create/deposit/withdraw against
localnet is in place. Jupiter inventory and `/build` quotes are in the public
client; Jupiter buy/sell on localnet remains outstanding until the aggregator
and AMMs are present.

## Design References

- Plan: ../Stocklana-Custom-Baskets-Plan.md relative to repository root.
- Anchor: https://www.anchor-lang.com/docs
- Jupiter: https://developers.jup.ag/docs/swap
- Pyth Hermes: https://docs.pyth.network/price-feeds/core/fetch-price-updates
- Token amounts: https://solana.com/docs/tokens/extensions/scaled-ui-amount
- PreStocks catalog: https://prestocks.com/api/prestocks
- Tessera token details: https://rest-api.tessera.pe/v1/public/token-details
- Tessera on-chain programs: https://docs.tessera.pe/technicals/on-chain-programs
