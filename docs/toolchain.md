# Toolchain

Verified September 14, 2026:

- Node.js 26.8.1
- TypeScript 7.0.2
- Rust 1.98.1
- Agave/Solana CLI 2.3.0
- Anchor CLI and crates 0.32.1

The Solana CLI is configured to `http://127.0.0.1:8899`, not mainnet.

## Shell Path

```sh
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
```

## Cargo Lock

Agave 2.3.0's SBF platform tools currently use Rust/Cargo 1.84. The latest
allowed releases of several transitive crates require newer Rust or Edition
2024 support. `Cargo.lock` therefore pins compatible versions, including:

- `blake3` 1.8.2
- `zeroize` 1.8.1
- `zeroize_derive` 1.4.2
- `indexmap` 2.13.0
- `proc-macro-crate` 3.3.0
- `unicode-segmentation` 1.12.0

Do not casually regenerate or delete `Cargo.lock`. After dependency changes,
run both native and SBF builds:

```sh
cargo test --workspace
anchor build -p basket -- --features local-testing
anchor build -p mock-swap
anchor test --skip-build
```

## JavaScript Audit

Rechecked September 15, 2026: `npm audit --omit=dev` reports seven affected
production packages (five moderate, two high), inherited through Anchor/web3.
The audit reports no available fix on these pinned paths. The earlier
zero-production-vulnerabilities note predated moving client dependencies into
production dependencies and is no longer valid. Do not run
`npm audit fix --force`; review dependency migration and runtime exposure
before any public deployment.
