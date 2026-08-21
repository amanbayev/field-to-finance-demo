use anchor_lang::prelude::*;

use crate::constants::{
    MAX_CONTRACT_ID, MAX_CROP, MAX_PRODUCER_REFERENCE, MAX_QUALITY_CLASS, MAX_REGION,
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
