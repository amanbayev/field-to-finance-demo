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

    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: String,
        crop: String,
        season: u16,
    ) -> Result<()> {
        crate::instructions::create_pool::handle_create_pool(ctx, pool_id, crop, season)
    }

    pub fn add_contract_to_pool(
        ctx: Context<AddContractToPool>,
        allocated_volume_tonnes: u64,
    ) -> Result<()> {
        crate::instructions::add_contract_to_pool::handle_add_contract_to_pool(
            ctx,
            allocated_volume_tonnes,
        )
    }

    pub fn update_pool_coverage(
        ctx: Context<UpdatePoolCoverage>,
        eligible_volume_tonnes: u64,
        coverage_haircut_bps: u16,
        coverage_snapshot_hash: [u8; 32],
    ) -> Result<()> {
        crate::instructions::update_pool_coverage::handle_update_pool_coverage(
            ctx,
            eligible_volume_tonnes,
            coverage_haircut_bps,
            coverage_snapshot_hash,
        )
    }

    pub fn set_pool_status(ctx: Context<SetPoolStatus>, status: PoolStatus) -> Result<()> {
        crate::instructions::set_pool_status::handle_set_pool_status(ctx, status)
    }
}
