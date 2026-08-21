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
    #[msg("pool_id must be non-empty")]
    PoolIdEmpty,
    #[msg("pool_id exceeds the 32-byte PDA seed limit")]
    PoolIdTooLong,
    #[msg("only the configured pool authority may perform this action")]
    UnauthorizedPoolAuthority,
    #[msg("contract must be verified before pool allocation")]
    ContractNotVerified,
    #[msg("contract crop does not match the pool")]
    CropMismatch,
    #[msg("contract season does not match the pool")]
    SeasonMismatch,
    #[msg("allocated volume must be greater than zero")]
    AllocationZero,
    #[msg("allocation exceeds remaining unallocated contract volume")]
    AllocationExceedsRemaining,
    #[msg("this contract is already allocated to this pool")]
    AlreadyAllocatedToPool,
    #[msg("pool cannot accept allocations in its current status")]
    PoolNotAcceptingAllocations,
    #[msg("eligible coverage cannot exceed gross pool volume")]
    EligibleExceedsGross,
    #[msg("coverage haircut cannot exceed 100%")]
    HaircutExceedsMaximum,
    #[msg("pool status transition is not allowed")]
    InvalidPoolStatusTransition,
    #[msg("arithmetic overflow")]
    ArithmeticOverflow,
}
