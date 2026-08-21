use anchor_lang::prelude::*;

use crate::constants::{
    CONTRACT_SEED, MAX_CONTRACT_ID, MAX_CROP, MAX_PRODUCER_REFERENCE, MAX_QUALITY_CLASS,
    MAX_REGION, MAX_SEASON, MIN_SEASON, REGISTRY_SEED,
};
use crate::error::RegistryError;
use crate::state::{ContractStatus, DigitalAgriculturalContractAccount, RegistryConfig};

#[derive(Accounts)]
#[instruction(contract_id: String)]
pub struct CreateContract<'info> {
    #[account(mut)]
    pub producer_authority: Signer<'info>,
    #[account(
        init,
        payer = producer_authority,
        space = 8 + DigitalAgriculturalContractAccount::INIT_SPACE,
        seeds = [CONTRACT_SEED, contract_id.as_bytes()],
        bump
    )]
    pub contract: Account<'info, DigitalAgriculturalContractAccount>,
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryConfig>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_contract(
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
    require!(!contract_id.is_empty(), RegistryError::ContractIdEmpty);
    require!(
        contract_id.as_bytes().len() <= MAX_CONTRACT_ID,
        RegistryError::ContractIdTooLong
    );
    require!(
        !producer_reference.is_empty(),
        RegistryError::ProducerReferenceEmpty
    );
    require!(
        producer_reference.as_bytes().len() <= MAX_PRODUCER_REFERENCE,
        RegistryError::ProducerReferenceTooLong
    );
    require!(!crop.is_empty(), RegistryError::CropEmpty);
    require!(
        crop.as_bytes().len() <= MAX_CROP,
        RegistryError::CropTooLong
    );
    require!(!quality_class.is_empty(), RegistryError::QualityClassEmpty);
    require!(
        quality_class.as_bytes().len() <= MAX_QUALITY_CLASS,
        RegistryError::QualityClassTooLong
    );
    require!(!region.is_empty(), RegistryError::RegionEmpty);
    require!(
        region.as_bytes().len() <= MAX_REGION,
        RegistryError::RegionTooLong
    );
    require!(field_area_hectares > 0, RegistryError::FieldAreaZero);
    require!(expected_volume_tonnes > 0, RegistryError::VolumeZero);
    require!(
        (MIN_SEASON..=MAX_SEASON).contains(&season),
        RegistryError::InvalidSeason
    );

    let now = Clock::get()?.unix_timestamp;
    let contract = &mut ctx.accounts.contract;
    contract.contract_id = contract_id;
    contract.producer_authority = ctx.accounts.producer_authority.key();
    contract.producer_reference = producer_reference;
    contract.crop = crop;
    contract.season = season;
    contract.field_area_hectares = field_area_hectares;
    contract.expected_volume_tonnes = expected_volume_tonnes;
    contract.quality_class = quality_class;
    contract.region = region;
    contract.status = ContractStatus::PendingVerification;
    contract.created_at = now;
    contract.updated_at = now;
    contract.verification_authority = ctx.accounts.registry.verification_authority;
    contract.bump = ctx.bumps.contract;
    Ok(())
}
