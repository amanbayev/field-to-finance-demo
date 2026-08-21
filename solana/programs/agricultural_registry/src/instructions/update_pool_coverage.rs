use anchor_lang::prelude::*;

use crate::constants::{MAX_HAIRCUT_BPS, POOL_SEED, REGISTRY_SEED};
use crate::error::RegistryError;
use crate::state::{ContractPoolAccount, RegistryConfig};

#[derive(Accounts)]
pub struct UpdatePoolCoverage<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_SEED, pool.pool_id.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ContractPoolAccount>,
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryConfig>,
}

pub fn handle_update_pool_coverage(
    ctx: Context<UpdatePoolCoverage>,
    eligible_volume_tonnes: u64,
    coverage_haircut_bps: u16,
    coverage_snapshot_hash: [u8; 32],
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.authority.key(),
        ctx.accounts.pool.authority,
        RegistryError::UnauthorizedPoolAuthority
    );
    require!(
        coverage_haircut_bps <= MAX_HAIRCUT_BPS,
        RegistryError::HaircutExceedsMaximum
    );
    require!(
        eligible_volume_tonnes <= ctx.accounts.pool.gross_volume_tonnes,
        RegistryError::EligibleExceedsGross
    );

    let pool = &mut ctx.accounts.pool;
    pool.eligible_volume_tonnes = eligible_volume_tonnes;
    pool.coverage_haircut_bps = coverage_haircut_bps;
    pool.coverage_snapshot_hash = coverage_snapshot_hash;
    pool.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
