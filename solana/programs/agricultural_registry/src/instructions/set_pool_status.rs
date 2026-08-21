use anchor_lang::prelude::*;

use crate::constants::{POOL_SEED, REGISTRY_SEED};
use crate::error::RegistryError;
use crate::state::{ContractPoolAccount, PoolStatus, RegistryConfig};

#[derive(Accounts)]
pub struct SetPoolStatus<'info> {
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

pub fn handle_set_pool_status(ctx: Context<SetPoolStatus>, status: PoolStatus) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.authority.key(),
        ctx.accounts.pool.authority,
        RegistryError::UnauthorizedPoolAuthority
    );

    let current = ctx.accounts.pool.status;
    let allowed = matches!(
        (current, status),
        (PoolStatus::Draft, PoolStatus::Active)
            | (PoolStatus::Draft, PoolStatus::Closed)
            | (PoolStatus::Active, PoolStatus::Suspended)
            | (PoolStatus::Active, PoolStatus::Closed)
            | (PoolStatus::Suspended, PoolStatus::Active)
            | (PoolStatus::Suspended, PoolStatus::Closed)
    );
    require!(allowed, RegistryError::InvalidPoolStatusTransition);

    let pool = &mut ctx.accounts.pool;
    pool.status = status;
    pool.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
