use anchor_lang::prelude::*;

use crate::constants::{
    MAX_CROP, MAX_POOL_ID, MAX_SEASON, MIN_SEASON, POOL_SEED, REGISTRY_SEED,
};
use crate::error::RegistryError;
use crate::state::{ContractPoolAccount, PoolStatus, RegistryConfig};

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ContractPoolAccount::INIT_SPACE,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump
    )]
    pub pool: Account<'info, ContractPoolAccount>,
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryConfig>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_pool(
    ctx: Context<CreatePool>,
    pool_id: String,
    crop: String,
    season: u16,
) -> Result<()> {
    require!(!pool_id.is_empty(), RegistryError::PoolIdEmpty);
    require!(
        pool_id.as_bytes().len() <= MAX_POOL_ID,
        RegistryError::PoolIdTooLong
    );
    require!(!crop.is_empty(), RegistryError::CropEmpty);
    require!(crop.as_bytes().len() <= MAX_CROP, RegistryError::CropTooLong);
    require!(
        (MIN_SEASON..=MAX_SEASON).contains(&season),
        RegistryError::InvalidSeason
    );
    require_keys_eq!(
        ctx.accounts.authority.key(),
        ctx.accounts.registry.upgrade_authority,
        RegistryError::UnauthorizedPoolAuthority
    );

    let now = Clock::get()?.unix_timestamp;
    let pool = &mut ctx.accounts.pool;
    pool.pool_id = pool_id;
    pool.authority = ctx.accounts.authority.key();
    pool.crop = crop;
    pool.season = season;
    pool.status = PoolStatus::Draft;
    pool.gross_volume_tonnes = 0;
    pool.eligible_volume_tonnes = 0;
    pool.coverage_haircut_bps = 0;
    pool.coverage_snapshot_hash = [0u8; 32];
    pool.created_at = now;
    pool.updated_at = now;
    pool.contract_count = 0;
    pool.bump = ctx.bumps.pool;
    Ok(())
}
