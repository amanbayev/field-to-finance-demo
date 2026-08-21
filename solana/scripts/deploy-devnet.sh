#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/user/.cargo/bin:/home/user/.local/share/solana/install/active_release/bin:/usr/bin:/bin:$PATH"
rsync -a --delete --exclude target /mnt/c/Users/user/field-to-finance-demo/solana/ /home/user/src/field-to-finance-demo/solana/
cd /home/user/src/field-to-finance-demo/solana
anchor deploy --provider.cluster devnet --provider.wallet /home/user/.config/solana/id.json
