# Review Handoff

Updated September 15, 2026.

## Current Evidence

- `npm run idl:check` passes: the committed browser IDL matches Anchor output.
- `npm run check` passes with 18 TypeScript tests.
- `npm run build` passes with Next.js 16.3.5.
- `cargo fmt --all -- --check` and `cargo test --workspace` pass.
- `anchor test --skip-local-validator` passes against the persistent validator.
- The browser reports the local validator online and the basket program deployed.
- Desktop at 1440 px and mobile at 390 px have no horizontal overflow.
- The browser console has no warnings or errors.

## Live Account Decode

The integration scenario's resulting basket was read through
`lib/solana/basket-client.ts` from actual local-validator account bytes:

- Address: `CEqa46Q9FLFocTL4HqcutypTXMcYajNNJF6SnasgqRnH`
- Basket ID: `1`
- Assets: `2`
- Operation nonce: `3`
- Phase: `exiting`
- Active legs: `0`

This verified that the current Anchor IDL decoder returns snake_case fields and
capitalized enum variants. The normalization boundary converts them to the
client's camelCase fields and lowercase phase union.

## Deliberate Boundaries

- UI basket execution remains a fixture simulation.
- Browser wallet discovery and connection exist, but no transaction is built,
  signed, submitted, or confirmed.
- No Jupiter request or CPI path exists yet.
- No mainnet/devnet deployment or live asset address is configured.
- The mock-swap program remains local-only.

## Review Risks

- `npm audit --omit=dev` reports seven inherited vulnerabilities in the pinned
  Anchor/web3 dependency tree: five moderate and two high.
- The high findings are in Anchor's transitive `toml` parser. The moderate
  findings are in `stream-json` and `uuid` through web3 RPC dependencies.
- npm reports no available fix for these pinned paths. Do not run
  `npm audit fix --force`; evaluate a dependency migration or containment plan
  before public deployment.
- The injected-wallet path was verified for missing-wallet behavior in the
  in-app browser. A real extension connection still needs manual wallet-prompt
  and account-change testing.
- The repository is initialized but all files are still untracked. No commit or
  remote has been created.

## Suggested Next Review

1. Review onchain authorization, nonce transitions, and account constraints.
2. Review the browser IDL boundary and dependency advisories.
3. Add typed instruction builders and transaction confirmation state for
   localnet only.
4. Replace fixture UI state incrementally with refreshed onchain snapshots.
5. Keep Jupiter and public-network work blocked until local wallet rejection,
   expiry, retry, and recovery paths are proven.
