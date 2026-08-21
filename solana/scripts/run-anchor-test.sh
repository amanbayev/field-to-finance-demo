#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/user/.cargo/bin:/home/user/.local/share/solana/install/active_release/bin:/usr/bin:/bin:$PATH"
echo START
mkdir -p /home/user/src/field-to-finance-demo
rsync -a --delete --exclude target /mnt/c/Users/user/field-to-finance-demo/solana/ /home/user/src/field-to-finance-demo/solana/
cd /home/user/src/field-to-finance-demo/solana
pwd
ls programs/agricultural_registry/src/instructions
anchor test
echo DONE
