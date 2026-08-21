pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT");

#[program]
pub mod agricultural_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, verification_authority: Pubkey) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx, verification_authority)
    }

    pub fn create_contract(
        ctx: Context<CreateContract>,
        contract_id: String,
        producer_reference: String,
        crop: String,
        season: u16,
        field_area_hectares: u64,
        expected_volume_tonnes: u64,
        quality_class: String,
        region: String,
    ) -> Result<()> {
        crate::instructions::create_contract::handle_create_contract(
            ctx,
            contract_id,
            producer_reference,
            crop,
            season,
            field_area_hectares,
            expected_volume_tonnes,
            quality_class,
            region,
        )
    }

    pub fn verify_contract(ctx: Context<VerifyContract>) -> Result<()> {
        crate::instructions::verify_contract::handle_verify_contract(ctx)
    }

    pub fn suspend_contract(ctx: Context<SuspendContract>) -> Result<()> {
        crate::instructions::suspend_contract::handle_suspend_contract(ctx)
    }
}
