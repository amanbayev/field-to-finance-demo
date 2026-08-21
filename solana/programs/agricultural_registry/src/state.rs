use anchor_lang::prelude::*;

use crate::constants::{
    MAX_CONTRACT_ID, MAX_CROP, MAX_POOL_ID, MAX_PRODUCER_REFERENCE, MAX_QUALITY_CLASS,
    MAX_REGION,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum ContractStatus {
    PendingVerification,
    Verified,
    Suspended,
}

#[account]
#[derive(InitSpace)]
pub struct RegistryConfig {
    /// Can later be replaced by a governance/multisig PDA.
    pub upgrade_authority: Pubkey,
    pub verification_authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DigitalAgriculturalContractAccount {
    #[max_len(MAX_CONTRACT_ID)]
    pub contract_id: String,
    pub producer_authority: Pubkey,
    #[max_len(MAX_PRODUCER_REFERENCE)]
    pub producer_reference: String,
    #[max_len(MAX_CROP)]
    pub crop: String,
    pub season: u16,
    pub field_area_hectares: u64,
    pub expected_volume_tonnes: u64,
    #[max_len(MAX_QUALITY_CLASS)]
    pub quality_class: String,
    #[max_len(MAX_REGION)]
    pub region: String,
    pub status: ContractStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub verification_authority: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum PoolStatus {
    Draft,
    Active,
    Suspended,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum AllocationStatus {
    Active,
    Released,
}

#[account]
#[derive(InitSpace)]
pub struct ContractPoolAccount {
    #[max_len(MAX_POOL_ID)]
    pub pool_id: String,
    pub authority: Pubkey,
    #[max_len(MAX_CROP)]
    pub crop: String,
    pub season: u16,
    pub status: PoolStatus,
    pub gross_volume_tonnes: u64,
    pub eligible_volume_tonnes: u64,
    pub coverage_haircut_bps: u16,
    pub coverage_snapshot_hash: [u8; 32],
    pub created_at: i64,
    pub updated_at: i64,
    pub contract_count: u16,
    pub bump: u8,
}

/// One allocation of a contract into a specific pool.
/// PDA: `["contract_allocation", contract_id, pool_id]`
#[account]
#[derive(InitSpace)]
pub struct ContractAllocationAccount {
    #[max_len(MAX_CONTRACT_ID)]
    pub contract_id: String,
    #[max_len(MAX_POOL_ID)]
    pub pool_id: String,
    pub allocated_volume_tonnes: u64,
    pub status: AllocationStatus,
    pub created_at: i64,
    pub bump: u8,
}

/// Running total of active allocations for one contract.
/// PDA: `["allocation_index", contract_id]`
/// Kept off the Phase 1 contract account so DAC-2027-0001 layout stays readable.
#[account]
#[derive(InitSpace)]
pub struct ContractAllocationIndexAccount {
    #[max_len(MAX_CONTRACT_ID)]
    pub contract_id: String,
    pub allocated_volume_tonnes: u64,
    pub allocation_count: u16,
    pub bump: u8,
}
