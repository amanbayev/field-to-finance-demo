#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd /mnt/c/Users/user/field-to-finance-demo/solana
echo "PWD=$(pwd)"
echo "ANCHOR=$(anchor --version || true)"
echo "DEPLOY=$(ls -l target/deploy 2>/dev/null || echo none)"
echo "BUILD"
anchor build --ignore-keys
echo "TEST"
cargo test -p agricultural_market --test market
echo "DONE"
