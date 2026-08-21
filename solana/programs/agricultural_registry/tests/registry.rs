use {
    agricultural_registry::{
        accounts, constants, instruction,
        state::{ContractStatus, DigitalAgriculturalContractAccount, RegistryConfig},
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

fn create_ix(
    producer: Pubkey,
    contract_id: &str,
    producer_reference: &str,
    crop: &str,
    season: u16,
    field_area_hectares: u64,
    expected_volume_tonnes: u64,
    quality_class: &str,
    region: &str,
) -> anchor_lang::solana_program::instruction::Instruction {
    let contract = if contract_id.as_bytes().len() <= 32 {
        contract_pda(contract_id)
    } else {
        Pubkey::new_unique()
    };
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::CreateContract {
            contract_id: contract_id.to_string(),
            producer_reference: producer_reference.to_string(),
            crop: crop.to_string(),
            season,
            field_area_hectares,
            expected_volume_tonnes,
            quality_class: quality_class.to_string(),
            region: region.to_string(),
        }
        .data(),
        accounts::CreateContract {
            producer_authority: producer,
            contract,
            registry: registry_pda(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn demo_create_ix(
    producer: Pubkey,
    contract_id: &str,
) -> anchor_lang::solana_program::instruction::Instruction {
    create_ix(
        producer,
        contract_id,
        "PRODUCER-0001",
        "Wheat",
        2027,
        1240,
        2800,
        "Class 3",
        "Akmola",
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

fn load_contract(env: &Env, contract_id: &str) -> DigitalAgriculturalContractAccount {
    let account = env.svm.get_account(&contract_pda(contract_id)).unwrap();
    let mut data: &[u8] = &account.data;
    DigitalAgriculturalContractAccount::try_deserialize(&mut data).unwrap()
}

#[test]
fn create_contract_succeeds_and_stores_fields() {
    let mut env = setup();
    send(
        &mut env.svm,
        &env.producer,
        demo_create_ix(env.producer.pubkey(), "DAC-2027-0001"),
    );
    let contract = load_contract(&env, "DAC-2027-0001");
    assert_eq!(contract.contract_id, "DAC-2027-0001");
    assert_eq!(contract.producer_authority, env.producer.pubkey());
    assert_eq!(contract.producer_reference, "PRODUCER-0001");
    assert_eq!(contract.crop, "Wheat");
    assert_eq!(contract.season, 2027);
    assert_eq!(contract.field_area_hectares, 1240);
    assert_eq!(contract.expected_volume_tonnes, 2800);
    assert_eq!(contract.quality_class, "Class 3");
    assert_eq!(contract.region, "Akmola");
    assert_eq!(contract.status, ContractStatus::PendingVerification);
    assert_eq!(contract.created_at, 1_700_000_000);
    assert_eq!(contract.updated_at, 1_700_000_000);
    assert_eq!(contract.verification_authority, env.verifier.pubkey());
}

#[test]
fn pda_is_deterministic_and_differs_by_id() {
    let first = contract_pda("DAC-2027-0001");
    let again = contract_pda("DAC-2027-0001");
    let other = contract_pda("DAC-2027-0002");
    assert_eq!(first, again);
    assert_ne!(first, other);
}

#[test]
fn empty_contract_id_rejected() {
    let mut env = setup();
    let logs = send_err(
        &mut env.svm,
        &[&env.producer],
        create_ix(
            env.producer.pubkey(),
            "",
            "PRODUCER-0001",
            "Wheat",
            2027,
            1240,
            2800,
            "Class 3",
            "Akmola",
        ),
    );
    assert!(
        logs.contains("ContractIdEmpty") || logs.contains("contract_id must be non-empty"),
        "{logs}"
    );
}

#[test]
fn overly_long_contract_id_rejected() {
    let mut env = setup();
    let long_id = "A".repeat(33);
    let logs = send_err(
        &mut env.svm,
        &[&env.producer],
        create_ix(
            env.producer.pubkey(),
            &long_id,
            "PRODUCER-0001",
            "Wheat",
            2027,
            1240,
            2800,
            "Class 3",
            "Akmola",
        ),
    );
    assert!(
        logs.to_lowercase().contains("seed")
            || logs.contains("ContractIdTooLong")
            || logs.contains("32-byte"),
        "{logs}"
    );
}

#[test]
fn empty_crop_rejected() {
    let mut env = setup();
    let logs = send_err(
        &mut env.svm,
        &[&env.producer],
        create_ix(
            env.producer.pubkey(),
            "DAC-2027-0001",
            "PRODUCER-0001",
            "",
            2027,
            1240,
            2800,
            "Class 3",
            "Akmola",
        ),
    );
    assert!(
        logs.contains("CropEmpty") || logs.contains("crop must be non-empty"),
        "{logs}"
    );
}

#[test]
fn zero_field_area_rejected() {
    let mut env = setup();
    let logs = send_err(
        &mut env.svm,
        &[&env.producer],
        create_ix(
            env.producer.pubkey(),
            "DAC-2027-0001",
            "PRODUCER-0001",
            "Wheat",
            2027,
            0,
            2800,
            "Class 3",
            "Akmola",
        ),
    );
    assert!(
        logs.contains("FieldAreaZero") || logs.contains("field_area_hectares"),
        "{logs}"
    );
}

#[test]
fn zero_volume_rejected() {
    let mut env = setup();
    let logs = send_err(
        &mut env.svm,
        &[&env.producer],
        create_ix(
            env.producer.pubkey(),
            "DAC-2027-0001",
            "PRODUCER-0001",
            "Wheat",
            2027,
            1240,
            0,
            "Class 3",
            "Akmola",
        ),
    );
    assert!(
        logs.contains("VolumeZero") || logs.contains("expected_volume_tonnes"),
        "{logs}"
    );
}

#[test]
fn duplicate_contract_rejected() {
    let mut env = setup();
    send(
        &mut env.svm,
        &env.producer,
        demo_create_ix(env.producer.pubkey(), "DAC-2027-0001"),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.producer],
        demo_create_ix(env.producer.pubkey(), "DAC-2027-0001"),
    );
    assert!(
        logs.to_lowercase().contains("already in use")
            || logs.contains("already initialized")
            || logs.contains("AccountAlreadyInitialized"),
        "{logs}"
    );
}

#[test]
fn unauthorized_verifier_rejected() {
    let mut env = setup();
    send(
        &mut env.svm,
        &env.producer,
        demo_create_ix(env.producer.pubkey(), "DAC-2027-0001"),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.stranger],
        verify_ix("DAC-2027-0001", env.stranger.pubkey()),
    );
    assert!(
        logs.contains("UnauthorizedVerifier") || logs.contains("verification authority"),
        "{logs}"
    );
}

#[test]
fn authorized_verifier_succeeds_and_updates_timestamp() {
    let mut env = setup();
    send(
        &mut env.svm,
        &env.producer,
        demo_create_ix(env.producer.pubkey(), "DAC-2027-0001"),
    );
    let created = load_contract(&env, "DAC-2027-0001");
    set_clock(&mut env.svm, 1_700_000_500);
    send(
        &mut env.svm,
        &env.verifier,
        verify_ix("DAC-2027-0001", env.verifier.pubkey()),
    );
    let verified = load_contract(&env, "DAC-2027-0001");
    assert_eq!(verified.status, ContractStatus::Verified);
    assert_eq!(verified.created_at, created.created_at);
    assert!(verified.updated_at > created.updated_at);
    assert_eq!(verified.updated_at, 1_700_000_500);
}

#[test]
fn second_verification_rejected() {
    let mut env = setup();
    send(
        &mut env.svm,
        &env.producer,
        demo_create_ix(env.producer.pubkey(), "DAC-2027-0001"),
    );
    send(
        &mut env.svm,
        &env.verifier,
        verify_ix("DAC-2027-0001", env.verifier.pubkey()),
    );
    let logs = send_err(
        &mut env.svm,
        &[&env.verifier],
        verify_ix("DAC-2027-0001", env.verifier.pubkey()),
    );
    assert!(
        logs.contains("AlreadyVerified") || logs.contains("already verified"),
        "{logs}"
    );
}

#[test]
fn suspend_from_verified_succeeds() {
    let mut env = setup();
    send(
        &mut env.svm,
        &env.producer,
        demo_create_ix(env.producer.pubkey(), "DAC-2027-0001"),
    );
    send(
        &mut env.svm,
        &env.verifier,
        verify_ix("DAC-2027-0001", env.verifier.pubkey()),
    );
    let ix = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::SuspendContract {}.data(),
        accounts::SuspendContract {
            contract: contract_pda("DAC-2027-0001"),
            verification_authority: env.verifier.pubkey(),
            registry: registry_pda(),
        }
        .to_account_metas(None),
    );
    send(&mut env.svm, &env.verifier, ix);
    let contract = load_contract(&env, "DAC-2027-0001");
    assert_eq!(contract.status, ContractStatus::Suspended);
}

#[test]
fn registry_config_is_initialized() {
    let env = setup();
    let account = env.svm.get_account(&registry_pda()).unwrap();
    let mut data: &[u8] = &account.data;
    let registry = RegistryConfig::try_deserialize(&mut data).unwrap();
    assert_eq!(registry.verification_authority, env.verifier.pubkey());
    assert_eq!(registry.upgrade_authority, env.payer.pubkey());
}
