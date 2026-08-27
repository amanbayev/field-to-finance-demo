//! PDA seeds and bounded string sizes for market settlement.

pub const MARKET_CONFIG_SEED: &[u8] = b"market_config";
pub const PRIMARY_PLACEMENT_SEED: &[u8] = b"primary_placement";
pub const SECONDARY_SETTLEMENT_SEED: &[u8] = b"secondary_settlement";

pub const MAX_PLACEMENT_ID: usize = 32;
pub const MAX_ISSUANCE_ID: usize = 32;
pub const MAX_TRADE_ID: usize = 32;
pub const MAX_MARKET_ID: usize = 32;
