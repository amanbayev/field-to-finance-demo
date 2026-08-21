use anchor_lang::prelude::*;

use crate::constants::REGISTRY_SEED;
use crate::state::RegistryConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + RegistryConfig::INIT_SPACE,
        seeds = [REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, RegistryConfig>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(
    ctx: Context<Initialize>,
    verification_authority: Pubkey,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    registry.upgrade_authority = ctx.accounts.payer.key();
    registry.verification_authority = verification_authority;
    registry.bump = ctx.bumps.registry;
    Ok(())
}
