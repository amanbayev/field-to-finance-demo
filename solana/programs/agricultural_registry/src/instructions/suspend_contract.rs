use anchor_lang::prelude::*;

use crate::constants::{CONTRACT_SEED, REGISTRY_SEED};
use crate::error::RegistryError;
use crate::state::{ContractStatus, DigitalAgriculturalContractAccount, RegistryConfig};

#[derive(Accounts)]
pub struct SuspendContract<'info> {
    #[account(
        mut,
        seeds = [CONTRACT_SEED, contract.contract_id.as_bytes()],
        bump = contract.bump
    )]
    pub contract: Account<'info, DigitalAgriculturalContractAccount>,
    pub verification_authority: Signer<'info>,
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryConfig>,
}

pub fn handle_suspend_contract(ctx: Context<SuspendContract>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.verification_authority.key(),
        ctx.accounts.registry.verification_authority,
        RegistryError::UnauthorizedVerifier
    );

    let contract = &mut ctx.accounts.contract;
    require!(
        contract.status == ContractStatus::PendingVerification
            || contract.status == ContractStatus::Verified,
        RegistryError::InvalidSuspendTransition
    );

    contract.status = ContractStatus::Suspended;
    contract.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
