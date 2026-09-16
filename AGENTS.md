# Project Rules

- Read README.md and docs/first-milestone.md before implementation.
- This is a local prototype, not a live trading app.
- No mainnet execution, deployment, funded wallets, or remote repository
  creation without explicit user direction and eligibility review.
- Do not invent mint addresses, API response formats, fills, or valuations.
- Raw token arithmetic uses bigint/u64; never JavaScript Number.
- Onchain authorization must enforce owner, nonce, leg, mints, programs,
  destinations, spend bounds, and minimum outputs.
- UI progress is not proof a trade landed. Read chain state before retries.
- Keep in-kind recovery independent of Jupiter and valuation services.
- No pooled receipts, NFTs, charts, database, or leverage in the first milestone.
- Run npm run check after TypeScript changes. State Rust verification separately.
- Use http://127.0.0.1:<port> for local browser testing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
