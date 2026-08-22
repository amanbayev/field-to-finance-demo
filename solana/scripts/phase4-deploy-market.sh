#!/usr/bin/env bash
# Deploy agricultural_market only. Never upgrades agricultural_registry.
set -euo pipefail
export PATH="/home/user/.cargo/bin:/home/user/.local/share/solana/install/active_release/bin:/usr/bin:/bin:$PATH"
rsync -a --delete --exclude target /mnt/c/Users/user/field-to-finance-demo/solana/ /home/user/src/field-to-finance-demo/solana/
cd /home/user/src/field-to-finance-demo/solana
mkdir -p target/deploy
cp /home/user/.config/solana/agricultural_market-keypair.json target/deploy/agricultural_market-keypair.json
EXPECTED="$(solana-keygen pubkey target/deploy/agricultural_market-keypair.json)"
if [ "$EXPECTED" != "9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst" ]; then
  echo "Market program keypair does not match declare_id! $EXPECTED"
  exit 1
fi
anchor deploy --program-name agricultural_market --provider.cluster devnet --provider.wallet /home/user/.config/solana/id.json
echo DEPLOY_DONE
