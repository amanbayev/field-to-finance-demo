//! String limits, PDA seeds, and account-space notes.
//!
//! # Why a PDA
//! Each Digital Agricultural Contract is addressed by a Program Derived Address
//! so the account address is deterministic from `contract_id` and this program.
//! Clients and explorers can recompute the same address without storing a
//! mapping. The same seeds cannot initialize a second account, so duplicate
//! `contract_id` values are rejected by `init`.
//!
//! Seeds: `[b"digital_ag_contract", contract_id.as_bytes()]`
//!
//! Solana PDA seeds are limited to 32 bytes each, so `contract_id` must be
//! 1..=32 bytes.
//!
//! # Account space
//! Anchor allocates `8 + T::INIT_SPACE` (8-byte discriminator + Borsh layout).
//! `InitSpace` is the source of truth. Conceptual breakdown:
//!
//! DigitalAgriculturalContractAccount
//! - contract_id:            4 + 32
//! - producer_authority:     32
//! - producer_reference:     4 + 32
//! - crop:                   4 + 32
//! - season:                 2
//! - field_area_hectares:    8
//! - expected_volume_tonnes: 8
//! - quality_class:          4 + 32
//! - region:                 4 + 32
//! - status:                 1
//! - created_at:             8
//! - updated_at:             8
//! - verification_authority: 32
//! - bump:                   1
//!
//! RegistryConfig
//! - upgrade_authority:      32
//! - verification_authority: 32
//! - bump:                   1
//!
//! ContractPoolAccount PDA: `[b"contract_pool", pool_id.as_bytes()]`
//! ContractAllocationAccount PDA: `[b"contract_allocation", contract_id, pool_id]`
//! ContractAllocationIndexAccount PDA: `[b"allocation_index", contract_id]`
//!
//! Allocation totals live on the index account, not on the Phase 1 contract
//! layout, so existing DigitalAgriculturalContractAccount records remain
//! readable after program upgrade.
//!
//! On-chain proof is not the full business record: no legal names, BIN/IIN,
//! KYC documents, or financial statements are stored. Coverage math stays
//! off-chain; only a 32-byte snapshot hash is anchored on the pool.

pub const CONTRACT_SEED: &[u8] = b"digital_ag_contract";
pub const REGISTRY_SEED: &[u8] = b"registry_config";
pub const POOL_SEED: &[u8] = b"contract_pool";
pub const ALLOCATION_SEED: &[u8] = b"contract_allocation";
pub const ALLOCATION_INDEX_SEED: &[u8] = b"allocation_index";

pub const MAX_CONTRACT_ID: usize = 32;
pub const MAX_POOL_ID: usize = 32;
pub const MAX_PRODUCER_REFERENCE: usize = 32;
pub const MAX_CROP: usize = 32;
pub const MAX_QUALITY_CLASS: usize = 32;
pub const MAX_REGION: usize = 32;

pub const MIN_SEASON: u16 = 2020;
pub const MAX_SEASON: u16 = 2040;
pub const MAX_HAIRCUT_BPS: u16 = 10_000;
