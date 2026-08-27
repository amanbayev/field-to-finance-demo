#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
ROOT="/mnt/c/Users/user/field-to-finance-demo"
RPC="https://api.devnet.solana.com"
EXPECTED_GRAIN="71G4GdJVawxt5DCVxcghW96TaLDxDqNEA1mLybAuTU9Q"
EXPECTED_STEPPE="AJ7wcKJq368STkEWFDESGJKBSGvFbHDv749g9iAHZt63"
EXPECTED_AUTH="AYbJghAZ6r3VgjC8trRDgeAHmJjYhUHBZCKJfKYpW7ZD"
EXPECTED_PROGRAM="9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst"

echo "SOLANA_VERSION=$(solana --version 2>/dev/null || echo missing)"
echo "WSL_SOLANA_CONFIG_NAMES"
ls -1 "$HOME/.config/solana" 2>/dev/null || echo NONE

pubkey_of() {
  local file="$1"
  if [ -f "$file" ]; then
    solana-keygen pubkey "$file"
  else
    echo MISSING
  fi
}

GRAIN_FILE="$ROOT/solana/.wallets/grain-desk.json"
GRAIN_PUB=$(pubkey_of "$GRAIN_FILE")
echo "GRAIN_DESK_FILE_PUBKEY=$GRAIN_PUB"
if [ "$GRAIN_PUB" = "$EXPECTED_GRAIN" ]; then
  echo "GRAIN_DESK_MATCH=true"
else
  echo "GRAIN_DESK_MATCH=false"
fi

DEFAULT_PUB=$(pubkey_of "$HOME/.config/solana/id.json")
echo "DEFAULT_ID_PUBKEY=$DEFAULT_PUB"
if [ "$DEFAULT_PUB" = "$EXPECTED_AUTH" ]; then
  echo "UPGRADE_AUTH_MATCH=true"
  echo "DEMO_KZT_AUTH_MATCH=true"
else
  echo "UPGRADE_AUTH_MATCH=false"
  echo "DEMO_KZT_AUTH_MATCH=false"
fi

STEPPE_PUB=$(pubkey_of "$HOME/.config/solana/investor-0001.json")
echo "INVESTOR_0001_PUBKEY=$STEPPE_PUB"
if [ "$STEPPE_PUB" = "$EXPECTED_STEPPE" ]; then
  echo "STEPPE_MATCH=true"
else
  echo "STEPPE_MATCH=false"
fi

echo "ISSUER_SETTLEMENT_PUBKEY=$(pubkey_of "$HOME/.config/solana/issuer-settlement-001.json")"
echo "MARKET_PROGRAM_KEYPAIR_PUBKEY=$(pubkey_of "$HOME/.config/solana/agricultural_market-keypair.json")"

echo "PROGRAM_SHOW"
solana program show "$EXPECTED_PROGRAM" --url "$RPC"

echo "SLOT=$(solana slot --url "$RPC")"
