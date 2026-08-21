use anchor_lang::prelude::*;

use crate::constants::{
    ALLOCATION_INDEX_SEED, ALLOCATION_SEED, CONTRACT_SEED, POOL_SEED, REGISTRY_SEED,
};
use crate::error::RegistryError;
use crate::state::{
    AllocationStatus, ContractAllocationAccount, ContractAllocationIndexAccount,
    ContractStatus, ContractPoolAccount, DigitalAgriculturalContractAccount, PoolStatus,
    RegistryConfig,
};

#[derive(Accounts)]
pub struct AddContractToPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_SEED, pool.pool_id.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ContractPoolAccount>,
    #[account(
        seeds = [CONTRACT_SEED, contract.contract_id.as_bytes()],
        bump = contract.bump
    )]
    pub contract: Account<'info, DigitalAgriculturalContractAccount>,
    #[account(
        init,
        payer = authority,
        space = 8 + ContractAllocationAccount::INIT_SPACE,
        seeds = [
            ALLOCATION_SEED,
            contract.contract_id.as_bytes(),
            pool.pool_id.as_bytes()
        ],
        bump
    )]
    pub allocation: Account<'info, ContractAllocationAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + ContractAllocationIndexAccount::INIT_SPACE,
        seeds = [ALLOCATION_INDEX_SEED, contract.contract_id.as_bytes()],
        bump
    )]
    pub allocation_index: Account<'info, ContractAllocationIndexAccount>,
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryConfig>,
    pub system_program: Program<'info, System>,
}

pub fn handle_add_contract_to_pool(
    ctx: Context<AddContractToPool>,
    allocated_volume_tonnes: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.authority.key(),
        ctx.accounts.pool.authority,
        RegistryError::UnauthorizedPoolAuthority
    );
    require!(
        ctx.accounts.pool.status == PoolStatus::Draft
            || ctx.accounts.pool.status == PoolStatus::Active,
        RegistryError::PoolNotAcceptingAllocations
    );
    require!(
        ctx.accounts.contract.status == ContractStatus::Verified,
        RegistryError::ContractNotVerified
    );
    require!(
        ctx.accounts.contract.crop == ctx.accounts.pool.crop,
        RegistryError::CropMismatch
    );
    require!(
        ctx.accounts.contract.season == ctx.accounts.pool.season,
        RegistryError::SeasonMismatch
    );
    require!(allocated_volume_tonnes > 0, RegistryError::AllocationZero);

    let index = &mut ctx.accounts.allocation_index;
    if index.contract_id.is_empty() {
        index.contract_id = ctx.accounts.contract.contract_id.clone();
        index.allocated_volume_tonnes = 0;
        index.allocation_count = 0;
        index.bump = ctx.bumps.allocation_index;
    } else {
        require!(
            index.contract_id == ctx.accounts.contract.contract_id,
            RegistryError::AlreadyAllocatedToPool
        );
    }

    let remaining = ctx
        .accounts
        .contract
        .expected_volume_tonnes
        .checked_sub(index.allocated_volume_tonnes)
        .ok_or(RegistryError::ArithmeticOverflow)?;
    require!(
        allocated_volume_tonnes <= remaining,
        RegistryError::AllocationExceedsRemaining
    );

    index.allocated_volume_tonnes = index
        .allocated_volume_tonnes
        .checked_add(allocated_volume_tonnes)
        .ok_or(RegistryError::ArithmeticOverflow)?;
    index.allocation_count = index
        .allocation_count
        .checked_add(1)
        .ok_or(RegistryError::ArithmeticOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    let allocation = &mut ctx.accounts.allocation;
    allocation.contract_id = ctx.accounts.contract.contract_id.clone();
    allocation.pool_id = ctx.accounts.pool.pool_id.clone();
    allocation.allocated_volume_tonnes = allocated_volume_tonnes;
    allocation.status = AllocationStatus::Active;
    allocation.created_at = now;
    allocation.bump = ctx.bumps.allocation;

    let pool = &mut ctx.accounts.pool;
    pool.gross_volume_tonnes = pool
        .gross_volume_tonnes
        .checked_add(allocated_volume_tonnes)
        .ok_or(RegistryError::ArithmeticOverflow)?;
    pool.contract_count = pool
        .contract_count
        .checked_add(1)
        .ok_or(RegistryError::ArithmeticOverflow)?;
    pool.updated_at = now;
    Ok(())
}
