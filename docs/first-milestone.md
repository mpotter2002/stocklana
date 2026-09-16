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
  and withdraw. The public client does not build mock-swap legs.
- Local-only wallet sign/send/confirm, with chain state re-read after
  confirmation. Wallet rejection, blockhash expiry, and program errors are
  surfaced in the UI.

The onchain nonce and completed-leg state provide replay protection. The
TypeScript recovery helper remains a presentation/client decision aid and is
not a substitute for those program checks.

## Current Boundary

- Browser transactions are enabled only against the local validator.
- The mock-swap adapter is a test fixture, not a market venue or production
  dependency, and is not exposed in the public instruction client.
- Local test mints and USDCt balances are labeled test assets. There is no
  live valuation; portfolio value is shown as not priced.
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

## Next: Jupiter Integration

1. Prove one Jupiter `/build` CPI round trip under a permitted test setup using
   actual response schemas and tightly constrained privileged accounts.
2. Keep mock-swap evidence separate from Jupiter integration evidence, and do
   not assume a live devnet xStocks market exists.
3. Add Pyth valuation after the local transaction path is reviewed.
4. Add PreStocks/Tessera recipe options after valuation.

Local create, deposit, withdraw, and in-kind exit can now be signed in the
browser against a local validator. Mock-leg execution and Jupiter remain out
of the public client.

## Acceptance

An owner can deposit local SPL or plain Token-2022 fixtures, execute a
recoverable multi-leg operation, retry a failed leg or supersede the operation,
and fully withdraw the resulting holdings. Another owner cannot move the funds
or substitute a destination. Browser-driven create/deposit/withdraw against
localnet is in place. Jupiter buy/sell acceptance remains outstanding.

## Design References

- Plan: ../Stocklana-Custom-Baskets-Plan.md relative to repository root.
- Anchor: https://www.anchor-lang.com/docs
- Jupiter: https://developers.jup.ag/docs/swap
- Token amounts: https://solana.com/docs/tokens/extensions/scaled-ui-amount
