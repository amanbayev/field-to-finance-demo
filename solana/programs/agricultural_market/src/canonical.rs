//! Canonical binding between an off-chain matched trade and on-chain settlement.
//!
//! The hash is computed from immutable matched-trade fields plus the wallets
//! and mints that will actually move. The programme recomputes it and stores it
//! on `SecondarySettlementReceipt`. The execution adapter must load the same
//! fields from authoritative DB/identity records — never from browser input.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

pub const CANONICAL_TRADE_HASH_DOMAIN: &[u8] = b"F2F_SECONDARY_DVP_V1";

pub fn canonical_trade_hash(
    trade_id: &str,
    market_id: &str,
    market_config: &Pubkey,
    seller: &Pubkey,
    buyer: &Pubkey,
    instrument_mint: &Pubkey,
    settlement_mint: &Pubkey,
    quantity: u64,
    unit_price: u64,
    notional: u64,
) -> [u8; 32] {
    hashv(&[
        CANONICAL_TRADE_HASH_DOMAIN,
        &(trade_id.len() as u32).to_le_bytes(),
        trade_id.as_bytes(),
        &(market_id.len() as u32).to_le_bytes(),
        market_id.as_bytes(),
        market_config.as_ref(),
        seller.as_ref(),
        buyer.as_ref(),
        instrument_mint.as_ref(),
        settlement_mint.as_ref(),
        &quantity.to_le_bytes(),
        &unit_price.to_le_bytes(),
        &notional.to_le_bytes(),
    ])
    .to_bytes()
}
