#!/usr/bin/env bash
# Development-only toolchain bootstrap for WSL Ubuntu.
# Safe to re-run. Does not create or print wallet secrets.
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${HOME}/.cargo/bin:${HOME}/.local/share/solana/install/active_release/bin"

echo "=== gcc ==="
gcc --version | head -1

if ! command -v rustc >/dev/null 2>&1; then
  echo "=== installing rustup ==="
  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1091
. "${HOME}/.cargo/env"

if ! command -v solana >/dev/null 2>&1; then
  echo "=== installing Solana CLI 3.1.10 ==="
  sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)"
fi
export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

if ! grep -q "solana/install/active_release/bin" "${HOME}/.bashrc"; then
  echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "${HOME}/.bashrc"
fi
if ! grep -q '.cargo/env' "${HOME}/.bashrc"; then
  echo '. "$HOME/.cargo/env"' >> "${HOME}/.bashrc"
fi

echo "=== rustc ==="
rustc --version
echo "=== cargo ==="
cargo --version
echo "=== solana ==="
solana --version

if ! command -v avm >/dev/null 2>&1; then
  echo "=== installing AVM ==="
  cargo install avm --git https://github.com/solana-foundation/anchor --locked --force
fi

echo "=== avm ==="
avm --version

if ! command -v anchor >/dev/null 2>&1; then
  echo "=== installing latest Anchor via AVM ==="
  avm install latest
  avm use latest
else
  echo "=== ensuring latest Anchor ==="
  avm install latest
  avm use latest
fi

echo "=== anchor ==="
anchor --version
echo "=== avm list ==="
avm list || true
echo "=== node ==="
command -v node >/dev/null 2>&1 && node --version || echo "node: missing (LiteSVM tests do not require it)"
echo "=== npm ==="
command -v npm >/dev/null 2>&1 && npm --version || echo "npm: missing"
echo "=== yarn ==="
command -v yarn >/dev/null 2>&1 && yarn --version || echo "yarn: missing"
echo "BOOTSTRAP_OK"
