#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/user/.cargo/bin:/home/user/.local/share/solana/install/active_release/bin:/usr/bin:/bin:$PATH"
export HOME=/home/user
cd /mnt/c/Users/user/field-to-finance-demo
echo "node $(node -v)"
node solana/scripts/phase2-devnet.mjs
