pub mod canonical;
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use canonical::*;
pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst");

#[program]
pub mod agricultural_market {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        issuance_id: String,
        simulated_unit_price: u64,
    ) -> Result<()> {
        crate::instructions::initialize_market::handle_initialize_market(
            ctx,
            issuance_id,
            simulated_unit_price,
        )
    }

    pub fn settle_primary_placement(
        ctx: Context<SettlePrimaryPlacement>,
        placement_id: String,
        issuance_id: String,
        quantity: u64,
        unit_price: u64,
        total_settlement_amount: u64,
        investor_reference_hash: [u8; 32],
        compliance_reference_hash: [u8; 32],
    ) -> Result<()> {
        crate::instructions::settle_primary_placement::handle_settle_primary_placement(
            ctx,
            placement_id,
            issuance_id,
            quantity,
            unit_price,
            total_settlement_amount,
            investor_reference_hash,
            compliance_reference_hash,
        )
    }

    pub fn settle_secondary_dvp(
        ctx: Context<SettleSecondaryDvp>,
        trade_id: String,
        market_id: String,
        quantity: u64,
        unit_price: u64,
        notional: u64,
        canonical_trade_hash: [u8; 32],
    ) -> Result<()> {
        crate::instructions::settle_secondary_dvp::handle_settle_secondary_dvp(
            ctx,
            trade_id,
            market_id,
            quantity,
            unit_price,
            notional,
            canonical_trade_hash,
        )
    }
}
