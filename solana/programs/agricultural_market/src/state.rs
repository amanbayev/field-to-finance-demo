use anchor_lang::prelude::*;

use crate::constants::{MAX_ISSUANCE_ID, MAX_PLACEMENT_ID};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum PlacementStatus {
    Settled,
}

/// One market configuration for the WHEAT-2027 primary-placement demonstrator.
/// PDA: `["market_config"]`
#[account]
#[derive(InitSpace)]
pub struct MarketConfig {
    pub registrar: Pubkey,
    pub instrument_mint: Pubkey,
    pub settlement_mint: Pubkey,
    /// Technical demo settlement owner (ISSUER-SETTLEMENT-001). Not a commercial
    /// beneficiary decision.
    pub issuer_settlement_owner: Pubkey,
    pub pool: Pubkey,
    #[max_len(MAX_ISSUANCE_ID)]
    pub issuance_id: String,
    /// Simulation-only unit price in DEMO settlement units. Not commercial terms.
    pub simulated_unit_price: u64,
    pub bump: u8,
}

/// On-chain receipt for one primary placement. PDA seeds:
/// `["primary_placement", placement_id.as_bytes()]`
#[account]
#[derive(InitSpace)]
pub struct PrimaryPlacementReceipt {
    #[max_len(MAX_PLACEMENT_ID)]
    pub placement_id: String,
    #[max_len(MAX_ISSUANCE_ID)]
    pub issuance_id: String,
    pub instrument_mint: Pubkey,
    pub investor_wallet: Pubkey,
    pub investor_reference_hash: [u8; 32],
    pub quantity: u64,
    pub settlement_mint: Pubkey,
    pub unit_price: u64,
    pub total_settlement_amount: u64,
    pub compliance_reference_hash: [u8; 32],
    pub registrar_authority: Pubkey,
    pub settled_at: i64,
    pub status: PlacementStatus,
    pub bump: u8,
}
