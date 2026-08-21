use {
    agricultural_registry::{
        accounts, constants, instruction,
        state::{
            AllocationStatus, ContractAllocationAccount, ContractAllocationIndexAccount,
            ContractPoolAccount, PoolStatus,
        },
        ID as PROGRAM_ID,
    },
    anchor_lang::{
        prelude::Pubkey, solana_program::system_program, AccountDeserialize, InstructionData,
        ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const LAMPORTS: u64 = 10_000_000_000;
const POOL_ID: &str = "POOL-WHEAT-2027-01";
const OTHER_POOL_ID: &str = "POOL-WHEAT-2027-02";

struct Env {
    svm: LiteSVM,
    payer: Keypair,
    producer: Keypair,
    verifier: Keypair,
    stranger: Keypair,
}

fn program_bytes() -> &'static [u8] {
    include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/agricultural_registry.so"
    ))
}

fn registry_pda() -> Pubkey {
    Pubkey::find_program_address(&[constants::REGISTRY_SEED], &PROGRAM_ID).0
}

fn contract_pda(contract_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[constants::CONTRACT_SEED, contract_id.as_bytes()],
        &PROGRAM_ID,
    )
    .0
}

fn pool_pda(pool_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[constants::POOL_SEED, pool_id.as_bytes()], &PROGRAM_ID).0
}

fn allocation_pda(contract_id: &str, pool_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[
            constants::ALLOCATION_SEED,
            contract_id.as_bytes(),
            pool_id.as_bytes(),
        ],
        &PROGRAM_ID,
    )
    .0
}

fn allocation_index_pda(contract_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[constants::ALLOCATION_INDEX_SEED, contract_id.as_bytes()],
        &PROGRAM_ID,
    )
    .0
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ix: anchor_lang::solana_program::instruction::Instruction,
) {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).expect("transaction should succeed");
    svm.expire_blockhash();
}

fn send_err(
    svm: &mut LiteSVM,
    signers: &[&Keypair],
    ix: anchor_lang::solana_program::instruction::Instruction,
) -> String {
    svm.expire_blockhash();
    let fee_payer = signers[0];
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&fee_payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    let err = svm
        .send_transaction(tx)
        .expect_err("transaction should fail");
    format!("{:?} {:?}", err.err, err.meta.logs)
}

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&clock);
}

fn setup() -> Env {
    let payer = Keypair::new();
    let producer = Keypair::new();
    let verifier = Keypair::new();
    let stranger = Keypair::new();
    let mut svm = LiteSVM::new();
    svm.add_program(PROGRAM_ID, program_bytes()).unwrap();
    svm.airdrop(&payer.pubkey(), LAMPORTS).unwrap();
    svm.airdrop(&producer.pubkey(), LAMPORTS).unwrap();
    svm.airdrop(&verifier.pubkey(), LAMPORTS).unwrap();
    svm.airdrop(&stranger.pubkey(), LAMPORTS).unwrap();
    set_clock(&mut svm, 1_700_000_000);

    let ix = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::Initialize {
            verification_authority: verifier.pubkey(),
        }
        .data(),
        accounts::Initialize {
            payer: payer.pubkey(),
            registry: registry_pda(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(&mut svm, &payer, ix);

    Env {
        svm,
        payer,
        producer,
        verifier,
        stranger,
    }
}

fn create_contract_ix(
    producer: Pubkey,
    contract_id: &str,
    crop: &str,
    season: u16,
    volume: u64,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::CreateContract {
            contract_id: contract_id.to_string(),
            producer_reference: "PRODUCER-0001".to_string(),
            crop: crop.to_string(),
            season,
            field_area_hectares: 1240,
            expected_volume_tonnes: volume,
            quality_class: "Class 3".to_string(),
            region: "Akmola".to_string(),
        }
        .data(),
        accounts::CreateContract {
            producer_authority: producer,
            contract: contract_pda(contract_id),
            registry: registry_pda(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn verify_ix(
    contract_id: &str,
    verification_authority: Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::VerifyContract {}.data(),
        accounts::VerifyContract {
            contract: contract_pda(contract_id),
            verification_authority,
            registry: registry_pda(),
        }
        .to_account_metas(None),
    )
}

fn create_verified(
    env: &mut Env,
    contract_id: &str,
    crop: &str,
    season: u16,
    volume: u64,
) {
    send(
        &mut env.svm,
        &env.producer,
        create_contract_ix(env.producer.pubkey(), contract_id, crop, season, volume),
    );
    send(
        &mut env.svm,
        &env.verifier,
        verify_ix(contract_id, env.verifier.pubkey()),
    );
}

fn create_pool_ix(
    authority: Pubkey,
    pool_id: &str,
    crop: &str,
    season: u16,
) -> anchor_lang::solana_program::instruction::Instruction {
    let pool = if pool_id.as_bytes().len() <= 32 {
        pool_pda(pool_id)
    } else {
        Pubkey::new_unique()
    };
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::CreatePool {
            pool_id: pool_id.to_string(),
            crop: crop.to_string(),
            season,
        }
        .data(),
        accounts::CreatePool {
            authority,
            pool,
            registry: registry_pda(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn add_ix(
    authority: Pubkey,
    contract_id: &str,
    pool_id: &str,
    volume: u64,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::AddContractToPool {
            allocated_volume_tonnes: volume,
        }
        .data(),
        accounts::AddContractToPool {
            authority,
            pool: pool_pda(pool_id),
            contract: contract_pda(contract_id),
            allocation: allocation_pda(contract_id, pool_id),
            allocation_index: allocation_index_pda(contract_id),
            registry: registry_pda(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn coverage_ix(
    authority: Pubkey,
    pool_id: &str,
    eligible: u64,
    haircut_bps: u16,
    hash: [u8; 32],
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::UpdatePoolCoverage {
            eligible_volume_tonnes: eligible,
            coverage_haircut_bps: haircut_bps,
            coverage_snapshot_hash: hash,
        }
        .data(),
        accounts::UpdatePoolCoverage {
            authority,
            pool: pool_pda(pool_id),
            registry: registry_pda(),
        }
        .to_account_metas(None),
    )
}

fn status_ix(
    authority: Pubkey,
    pool_id: &str,
    status: PoolStatus,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::SetPoolStatus { status }.data(),
        accounts::SetPoolStatus {
            authority,
            pool: pool_pda(pool_id),
            registry: registry_pda(),
        }
        .to_account_metas(None),
    )
}

fn load_pool(env: &Env, pool_id: &str) -> ContractPoolAccount {
    let account = env.svm.get_account(&pool_pda(pool_id)).unwrap();
    let mut data: &[u8] = &account.data;
    ContractPoolAccount::try_deserialize(&mut data).unwrap()
}

fn load_allocation(env: &Env, contract_id: &str, pool_id: &str) -> ContractAllocationAccount {
    let account = env
        .svm
        .get_account(&allocation_pda(contract_id, pool_id))
        .unwrap();
    let mut data: &[u8] = &account.data;
    ContractAllocationAccount::try_deserialize(&mut data).unwrap()
}

fn load_index(env: &Env, contract_id: &str) -> ContractAllocationIndexAccount {
    let account = env
        .svm
        .get_account(&allocation_index_pda(contract_id))
        .unwrap();
    let mut data: &[u8] = &account.data;
    ContractAllocationIndexAccount::try_deserialize(&mut data).unwrap()
}

fn ready_pool(env: &mut Env) {
    send(
        &mut env.svm,
        &env.payer,
        create_pool_ix(env.payer.pubkey(), POOL_ID, "Wheat", 2027),
    );
}

fn ready_verified_wheat(env: &mut Env, contract_id: &str, volume: u64) {
    create_verified(env, contract_id, "Wheat", 2027, volume);
}

#[test]
fn create_pool_succeeds_and_stores_fields() {
    let mut env = setup();
    ready_pool(&mut env);
    let pool = load_pool(&env, POOL_ID);
    assert_eq!(pool.pool_id, POOL_ID);
    assert_eq!(pool.authority, env.payer.pubkey());
    assert_eq!(pool.crop, "Wheat");
    assert_eq!(pool.season, 2027);
    assert_eq!(pool.status, PoolStatus::Draft);
    assert_eq!(pool.gross_volume_tonnes, 0);
    assert_eq!(pool.eligible_volume_tonnes, 0);
    assert_eq!(pool.coverage_haircut_bps, 0);
    assert_eq!(pool.coverage_snapshot_hash, [0u8; 32]);
    assert_eq!(pool.contract_count, 0);
    assert_eq!(pool.created_at, 1_700_000_000);
}

#[test]
fn pool_pda_is_deterministic() {
    let first = pool_pda(POOL_ID);
    let again = pool_pda(POOL_ID);
    let other = pool_pda(OTHER_POOL_ID);
    assert_eq!(first, again);
    assert_ne!(first, other);
}

#[test]
fn duplicate_pool_rejected() {
    let mut env = setup();
    ready_pool(&mut env);
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        create_pool_ix(env.payer.pubkey(), POOL_ID, "Wheat", 2027),
    );
    assert!(
        logs.to_lowercase().contains("already in use")
            || logs.contains("already initialized")
            || logs.contains("AccountAlreadyInitialized"),
        "{logs}"
    );
}

#[test]
fn unauthorized_pool_create_rejected() {
    let mut env = setup();
    let logs = send_err(
        &mut env.svm,
        &[&env.stranger],
        create_pool_ix(env.stranger.pubkey(), POOL_ID, "Wheat", 2027),
    );
    assert!(
        logs.contains("UnauthorizedPoolAuthority") || logs.contains("pool authority"),
        "{logs}"
    );
}

#[test]
fn empty_pool_id_rejected() {
    let mut env = setup();
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        create_pool_ix(env.payer.pubkey(), "", "Wheat", 2027),
    );
    assert!(
        logs.contains("PoolIdEmpty") || logs.contains("pool_id must be non-empty"),
        "{logs}"
    );
}

#[test]
fn contract_allocation_succeeds() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    let allocation = load_allocation(&env, "DAC-2027-0001", POOL_ID);
    assert_eq!(allocation.contract_id, "DAC-2027-0001");
    assert_eq!(allocation.pool_id, POOL_ID);
    assert_eq!(allocation.allocated_volume_tonnes, 2800);
    assert_eq!(allocation.status, AllocationStatus::Active);
    let pool = load_pool(&env, POOL_ID);
    assert_eq!(pool.gross_volume_tonnes, 2800);
    assert_eq!(pool.contract_count, 1);
    let index = load_index(&env, "DAC-2027-0001");
    assert_eq!(index.allocated_volume_tonnes, 2800);
    assert_eq!(index.allocation_count, 1);
}

#[test]
fn same_volume_cannot_be_allocated_again() {
    let mut env = setup();
    ready_pool(&mut env);
    send(
        &mut env.svm,
        &env.payer,
        create_pool_ix(env.payer.pubkey(), OTHER_POOL_ID, "Wheat", 2027),
    );
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", OTHER_POOL_ID, 2800),
    );
    assert!(
        logs.contains("AllocationExceedsRemaining") || logs.contains("remaining unallocated"),
        "{logs}"
    );
}

#[test]
fn duplicate_allocation_to_same_pool_rejected() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2500),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 300),
    );
    assert!(
        logs.to_lowercase().contains("already in use")
            || logs.contains("already initialized")
            || logs.contains("AccountAlreadyInitialized")
            || logs.contains("AlreadyAllocatedToPool"),
        "{logs}"
    );
}

#[test]
fn allocation_exceeding_remaining_fails() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2500),
    );
    send(
        &mut env.svm,
        &env.payer,
        create_pool_ix(env.payer.pubkey(), OTHER_POOL_ID, "Wheat", 2027),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", OTHER_POOL_ID, 400),
    );
    assert!(
        logs.contains("AllocationExceedsRemaining") || logs.contains("remaining unallocated"),
        "{logs}"
    );
}

#[test]
fn partial_allocation_leaves_remaining_volume() {
    let mut env = setup();
    ready_pool(&mut env);
    send(
        &mut env.svm,
        &env.payer,
        create_pool_ix(env.payer.pubkey(), OTHER_POOL_ID, "Wheat", 2027),
    );
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2500),
    );
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", OTHER_POOL_ID, 300),
    );
    let index = load_index(&env, "DAC-2027-0001");
    assert_eq!(index.allocated_volume_tonnes, 2800);
    assert_eq!(index.allocation_count, 2);
    assert_eq!(load_pool(&env, POOL_ID).gross_volume_tonnes, 2500);
    assert_eq!(load_pool(&env, OTHER_POOL_ID).gross_volume_tonnes, 300);
}

#[test]
fn unverified_contract_cannot_be_added() {
    let mut env = setup();
    ready_pool(&mut env);
    send(
        &mut env.svm,
        &env.producer,
        create_contract_ix(env.producer.pubkey(), "DAC-2027-0001", "Wheat", 2027, 2800),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    assert!(
        logs.contains("ContractNotVerified") || logs.contains("must be verified"),
        "{logs}"
    );
}

#[test]
fn wrong_crop_fails() {
    let mut env = setup();
    ready_pool(&mut env);
    create_verified(&mut env, "DAC-2027-0001", "Barley", 2027, 2800);
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    assert!(
        logs.contains("CropMismatch") || logs.contains("crop does not match"),
        "{logs}"
    );
}

#[test]
fn wrong_season_fails() {
    let mut env = setup();
    ready_pool(&mut env);
    create_verified(&mut env, "DAC-2027-0001", "Wheat", 2026, 2800);
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    assert!(
        logs.contains("SeasonMismatch") || logs.contains("season does not match"),
        "{logs}"
    );
}

#[test]
fn unauthorized_pool_authority_fails() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    let logs = send_err(
        &mut env.svm,
        &[&env.stranger],
        add_ix(env.stranger.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    assert!(
        logs.contains("UnauthorizedPoolAuthority") || logs.contains("pool authority"),
        "{logs}"
    );
}

#[test]
fn different_contracts_can_be_allocated_and_totals_remain_correct() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    ready_verified_wheat(&mut env, "DAC-2027-0002", 2400);
    ready_verified_wheat(&mut env, "DAC-2027-0003", 3100);
    ready_verified_wheat(&mut env, "DAC-2027-0004", 1700);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0002", POOL_ID, 2400),
    );
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0003", POOL_ID, 3100),
    );
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0004", POOL_ID, 1700),
    );
    let pool = load_pool(&env, POOL_ID);
    assert_eq!(pool.gross_volume_tonnes, 10_000);
    assert_eq!(pool.contract_count, 4);
}

#[test]
fn zero_allocation_rejected() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 0),
    );
    assert!(
        logs.contains("AllocationZero") || logs.contains("greater than zero"),
        "{logs}"
    );
}

#[test]
fn coverage_update_stores_snapshot_hash() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    let hash = [7u8; 32];
    send(
        &mut env.svm,
        &env.payer,
        coverage_ix(env.payer.pubkey(), POOL_ID, 2324, 1700, hash),
    );
    let pool = load_pool(&env, POOL_ID);
    assert_eq!(pool.eligible_volume_tonnes, 2324);
    assert_eq!(pool.coverage_haircut_bps, 1700);
    assert_eq!(pool.coverage_snapshot_hash, hash);
}

#[test]
fn eligible_exceeding_gross_rejected() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        coverage_ix(env.payer.pubkey(), POOL_ID, 2801, 0, [0u8; 32]),
    );
    assert!(
        logs.contains("EligibleExceedsGross") || logs.contains("cannot exceed gross"),
        "{logs}"
    );
}

#[test]
fn haircut_over_100_percent_rejected() {
    let mut env = setup();
    ready_pool(&mut env);
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    send(
        &mut env.svm,
        &env.payer,
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        coverage_ix(env.payer.pubkey(), POOL_ID, 0, 10_001, [0u8; 32]),
    );
    assert!(
        logs.contains("HaircutExceedsMaximum") || logs.contains("cannot exceed 100%"),
        "{logs}"
    );
}

#[test]
fn unauthorized_coverage_update_rejected() {
    let mut env = setup();
    ready_pool(&mut env);
    let logs = send_err(
        &mut env.svm,
        &[&env.stranger],
        coverage_ix(env.stranger.pubkey(), POOL_ID, 0, 0, [0u8; 32]),
    );
    assert!(
        logs.contains("UnauthorizedPoolAuthority") || logs.contains("pool authority"),
        "{logs}"
    );
}

#[test]
fn pool_status_draft_to_active() {
    let mut env = setup();
    ready_pool(&mut env);
    send(
        &mut env.svm,
        &env.payer,
        status_ix(env.payer.pubkey(), POOL_ID, PoolStatus::Active),
    );
    assert_eq!(load_pool(&env, POOL_ID).status, PoolStatus::Active);
}

#[test]
fn invalid_pool_status_transition_rejected() {
    let mut env = setup();
    ready_pool(&mut env);
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        status_ix(env.payer.pubkey(), POOL_ID, PoolStatus::Suspended),
    );
    assert!(
        logs.contains("InvalidPoolStatusTransition") || logs.contains("status transition"),
        "{logs}"
    );
}

#[test]
fn closed_pool_rejects_allocation() {
    let mut env = setup();
    ready_pool(&mut env);
    send(
        &mut env.svm,
        &env.payer,
        status_ix(env.payer.pubkey(), POOL_ID, PoolStatus::Closed),
    );
    ready_verified_wheat(&mut env, "DAC-2027-0001", 2800);
    let logs = send_err(
        &mut env.svm,
        &[&env.payer],
        add_ix(env.payer.pubkey(), "DAC-2027-0001", POOL_ID, 2800),
    );
    assert!(
        logs.contains("PoolNotAcceptingAllocations") || logs.contains("current status"),
        "{logs}"
    );
}
