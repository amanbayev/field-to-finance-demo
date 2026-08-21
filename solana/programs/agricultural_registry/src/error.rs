use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("contract_id must be non-empty")]
    ContractIdEmpty,
    #[msg("contract_id exceeds the 32-byte PDA seed limit")]
    ContractIdTooLong,
    #[msg("producer_reference must be non-empty")]
    ProducerReferenceEmpty,
    #[msg("producer_reference exceeds maximum length")]
    ProducerReferenceTooLong,
    #[msg("crop must be non-empty")]
    CropEmpty,
    #[msg("crop exceeds maximum length")]
    CropTooLong,
    #[msg("quality_class must be non-empty")]
    QualityClassEmpty,
    #[msg("quality_class exceeds maximum length")]
    QualityClassTooLong,
    #[msg("region must be non-empty")]
    RegionEmpty,
    #[msg("region exceeds maximum length")]
    RegionTooLong,
    #[msg("field_area_hectares must be greater than zero")]
    FieldAreaZero,
    #[msg("expected_volume_tonnes must be greater than zero")]
    VolumeZero,
    #[msg("season is outside the allowed demonstration range")]
    InvalidSeason,
    #[msg("only the configured verification authority may perform this action")]
    UnauthorizedVerifier,
    #[msg("contract is not pending verification")]
    InvalidVerifyTransition,
    #[msg("contract is already verified")]
    AlreadyVerified,
    #[msg("contract cannot be suspended from its current status")]
    InvalidSuspendTransition,
}
