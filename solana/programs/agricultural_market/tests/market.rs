use {
    agricultural_market::{
        accounts as market_accounts, constants as market_constants, instruction as market_ix,
        state::{
            MarketConfig, PlacementStatus, PrimaryPlacementReceipt, SecondarySettlementReceipt,
            SecondarySettlementStatus,
        },
        ID as MARKET_ID,
    },
    agricultural_registry::{
        accounts, constants, instruction,
        state::{ContractPoolAccount, DigitalAgriculturalContractAccount, PoolStatus},
        ID as REGISTRY_ID,
    },
    anchor_lang::{
        prelude::Pubkey, solana_program::system_instruction, solana_program::system_program,
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{
            get_associated_token_address_with_program_id,
            spl_associated_token_account,
            ID as ASSOCIATED_TOKEN_PROGRAM_ID,
        },
        token_2022::{spl_token_2022, ID as TOKEN_2022_ID},
    },
    litesvm::LiteSVM,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    std::path::PathBuf,
};

const LAMPORTS: u64 = 10_000_000_000;
const POOL_ID: &str = "POOL-WHEAT-2027-01";
const CONTRACT_ID: &str = "DAC-2027-0001";
const ISSUANCE_ID: &str = "ISS-001";
const PLACEMENT_ID: &str = "PL-ISS001-0001";
const UNIT_PRICE: u64 = 100_000;
const QUANTITY: u64 = 10;
const SETTLEMENT_TOTAL: u64 = 1_000_000;
const MINT_SUPPLY: u64 = 1_000;
const ELIGIBLE: u64 = 8_300;
const INVESTOR_KZT: u64 = 2_000_000;
const TRADE_ID: &str = "TRD-SEED-001";
const SECONDARY_QTY: u64 = 2;
const SECONDARY_PRICE: u64 = 105_000;
const SECONDARY_NOTIONAL: u64 = 210_000;
const BUYER_KZT: u64 = 500_000;

struct Env {
    svm: LiteSVM,
    registrar: Keypair,
    #[allow(dead_code)]
    verifier: Keypair,
    #[allow(dead_code)]
    producer: Keypair,
    investor: Keypair,
    settlement_owner: Keypair,
    stranger: Keypair,
    buyer: Keypair,
    instrument_mint: Pubkey,
    settlement_mint: Pubkey,
}

fn registry_bytes() -> &'static [u8] {
    include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/agricultural_registry.so"
    ))
}

fn market_bytes() -> &'static [u8] {
    include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/agricultural_market.so"
    ))
}

fn find_elf(filename: &str) -> Vec<u8> {
    let cargo_home = std::env::var("CARGO_HOME").unwrap_or_else(|_| {
        format!(
            "{}/.cargo",
            std::env::var("HOME").expect("HOME or CARGO_HOME")
        )
    });
    let mut stack = vec![PathBuf::from(cargo_home).join("registry/src")];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.file_name().and_then(|name| name.to_str()) == Some(filename) {
                return std::fs::read(&path).unwrap_or_else(|err| {
                    panic!("failed to read {}: {err}", path.display())
                });
            }
        }
    }
    panic!("missing LiteSVM ELF {filename}");
}

fn registry_pda() -> Pubkey {
    Pubkey::find_program_address(&[constants::REGISTRY_SEED], &REGISTRY_ID).0
}

fn contract_pda(contract_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[constants::CONTRACT_SEED, contract_id.as_bytes()],
        &REGISTRY_ID,
    )
    .0
}

fn pool_pda(pool_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[constants::POOL_SEED, pool_id.as_bytes()], &REGISTRY_ID).0
}

fn allocation_pda(contract_id: &str, pool_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[
            constants::ALLOCATION_SEED,
            contract_id.as_bytes(),
            pool_id.as_bytes(),
        ],
        &REGISTRY_ID,
    )
    .0
}

fn allocation_index_pda(contract_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[constants::ALLOCATION_INDEX_SEED, contract_id.as_bytes()],
        &REGISTRY_ID,
    )
    .0
}

fn market_config_pda() -> Pubkey {
    Pubkey::find_program_address(&[market_constants::MARKET_CONFIG_SEED], &MARKET_ID).0
}

fn placement_pda(placement_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[
            market_constants::PRIMARY_PLACEMENT_SEED,
            placement_id.as_bytes(),
        ],
        &MARKET_ID,
    )
    .0
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, &TOKEN_2022_ID)
}

fn send(
    svm: &mut LiteSVM,
    signers: &[&Keypair],
    ix: anchor_lang::solana_program::instruction::Instruction,
) {
    svm.expire_blockhash();
    let fee_payer = signers[0];
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&fee_payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).expect("transaction should succeed");
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
    let tx = match VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers) {
        Ok(tx) => tx,
        Err(err) => return format!("{err:?}"),
    };
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

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, authority: &Pubkey) -> Pubkey {
    let mint = Keypair::new();
    send(
        svm,
        &[payer, &mint],
        system_instruction::create_account(
            &payer.pubkey(),
            &mint.pubkey(),
            1_000_000_000,
            82,
            &TOKEN_2022_ID,
        ),
    );
    send(
        svm,
        &[payer],
        spl_token_2022::instruction::initialize_mint2(
            &TOKEN_2022_ID,
            &mint.pubkey(),
            authority,
            Some(authority),
            0,
        )
        .unwrap(),
    );
    mint.pubkey()
}

fn create_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Pubkey, mint: &Pubkey) {
    send(
        svm,
        &[payer],
        spl_associated_token_account::instruction::create_associated_token_account(
            &payer.pubkey(),
            owner,
            mint,
            &TOKEN_2022_ID,
        ),
    );
}

fn mint_to(
    svm: &mut LiteSVM,
    authority: &Keypair,
    mint: &Pubkey,
    destination: &Pubkey,
    amount: u64,
) {
    send(
        svm,
        &[authority],
        spl_token_2022::instruction::mint_to(
            &TOKEN_2022_ID,
            mint,
            destination,
            &authority.pubkey(),
            &[],
            amount,
        )
        .unwrap(),
    );
}

fn token_amount(svm: &LiteSVM, account: &Pubkey) -> u64 {
    let data = svm.get_account(account).expect("token account").data;
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

fn mint_supply(svm: &LiteSVM, mint: &Pubkey) -> u64 {
    let data = svm.get_account(mint).expect("mint").data;
    u64::from_le_bytes(data[36..44].try_into().unwrap())
}

fn hashes() -> ([u8; 32], [u8; 32]) {
    ([1u8; 32], [2u8; 32])
}

fn setup() -> Env {
    let registrar = Keypair::new();
    let verifier = Keypair::new();
    let producer = Keypair::new();
    let investor = Keypair::new();
    let settlement_owner = Keypair::new();
    let stranger = Keypair::new();
    let buyer = Keypair::new();
    let mut svm = LiteSVM::new();
    svm.add_program(REGISTRY_ID, registry_bytes()).unwrap();
    svm.add_program(MARKET_ID, market_bytes()).unwrap();
    svm.add_program(TOKEN_2022_ID, &find_elf("spl_token_2022-10.0.0.so"))
        .unwrap();
    svm.add_program(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        &find_elf("spl_associated_token_account-1.1.1.so"),
    )
    .unwrap();
    for key in [
        registrar.pubkey(),
        verifier.pubkey(),
        producer.pubkey(),
        investor.pubkey(),
        settlement_owner.pubkey(),
        stranger.pubkey(),
        buyer.pubkey(),
    ] {
        svm.airdrop(&key, LAMPORTS).unwrap();
    }
    set_clock(&mut svm, 1_700_000_000);

    send(
        &mut svm,
        &[&registrar],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::Initialize {
                verification_authority: verifier.pubkey(),
            }
            .data(),
            accounts::Initialize {
                payer: registrar.pubkey(),
                registry: registry_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
    );

    send(
        &mut svm,
        &[&producer],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::CreateContract {
                contract_id: CONTRACT_ID.to_string(),
                producer_reference: "PRODUCER-0001".to_string(),
                crop: "Wheat".to_string(),
                season: 2027,
                field_area_hectares: 1240,
                expected_volume_tonnes: 10_000,
                quality_class: "Class 3".to_string(),
                region: "Akmola".to_string(),
            }
            .data(),
            accounts::CreateContract {
                producer_authority: producer.pubkey(),
                contract: contract_pda(CONTRACT_ID),
                registry: registry_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
    );
    send(
        &mut svm,
        &[&verifier],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::VerifyContract {}.data(),
            accounts::VerifyContract {
                contract: contract_pda(CONTRACT_ID),
                verification_authority: verifier.pubkey(),
                registry: registry_pda(),
            }
            .to_account_metas(None),
        ),
    );
    send(
        &mut svm,
        &[&registrar],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::CreatePool {
                pool_id: POOL_ID.to_string(),
                crop: "Wheat".to_string(),
                season: 2027,
            }
            .data(),
            accounts::CreatePool {
                authority: registrar.pubkey(),
                pool: pool_pda(POOL_ID),
                registry: registry_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
    );
    send(
        &mut svm,
        &[&registrar],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::AddContractToPool {
                allocated_volume_tonnes: 10_000,
            }
            .data(),
            accounts::AddContractToPool {
                authority: registrar.pubkey(),
                pool: pool_pda(POOL_ID),
                contract: contract_pda(CONTRACT_ID),
                allocation: allocation_pda(CONTRACT_ID, POOL_ID),
                allocation_index: allocation_index_pda(CONTRACT_ID),
                registry: registry_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
    );
    send(
        &mut svm,
        &[&registrar],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::UpdatePoolCoverage {
                eligible_volume_tonnes: ELIGIBLE,
                coverage_haircut_bps: 1_700,
                coverage_snapshot_hash: [4u8; 32],
            }
            .data(),
            accounts::UpdatePoolCoverage {
                authority: registrar.pubkey(),
                pool: pool_pda(POOL_ID),
                registry: registry_pda(),
            }
            .to_account_metas(None),
        ),
    );
    send(
        &mut svm,
        &[&registrar],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::SetPoolStatus {
                status: PoolStatus::Active,
            }
            .data(),
            accounts::SetPoolStatus {
                authority: registrar.pubkey(),
                pool: pool_pda(POOL_ID),
                registry: registry_pda(),
            }
            .to_account_metas(None),
        ),
    );

    let instrument_mint = create_mint(&mut svm, &registrar, &registrar.pubkey());
    let settlement_mint = create_mint(&mut svm, &registrar, &registrar.pubkey());
    create_ata(&mut svm, &registrar, &registrar.pubkey(), &instrument_mint);
    create_ata(&mut svm, &registrar, &investor.pubkey(), &settlement_mint);
    mint_to(
        &mut svm,
        &registrar,
        &instrument_mint,
        &ata(&registrar.pubkey(), &instrument_mint),
        MINT_SUPPLY,
    );
    mint_to(
        &mut svm,
        &registrar,
        &settlement_mint,
        &ata(&investor.pubkey(), &settlement_mint),
        INVESTOR_KZT,
    );

    send(
        &mut svm,
        &[&registrar],
        initialize_ix(
            registrar.pubkey(),
            instrument_mint,
            settlement_mint,
            settlement_owner.pubkey(),
            ISSUANCE_ID,
            UNIT_PRICE,
        ),
    );

    Env {
        svm,
        registrar,
        verifier,
        producer,
        investor,
        settlement_owner,
        stranger,
        buyer,
        instrument_mint,
        settlement_mint,
    }
}

fn initialize_ix(
    registrar: Pubkey,
    instrument_mint: Pubkey,
    settlement_mint: Pubkey,
    issuer_settlement_owner: Pubkey,
    issuance_id: &str,
    simulated_unit_price: u64,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        MARKET_ID,
        &market_ix::InitializeMarket {
            issuance_id: issuance_id.to_string(),
            simulated_unit_price,
        }
        .data(),
        market_accounts::InitializeMarket {
            registrar,
            market_config: market_config_pda(),
            pool: pool_pda(POOL_ID),
            instrument_mint,
            settlement_mint,
            issuer_settlement_owner,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn settle_ix(
    env: &Env,
    registrar: Pubkey,
    investor: Pubkey,
    placement_id: &str,
    issuance_id: &str,
    quantity: u64,
    unit_price: u64,
    total: u64,
    instrument_mint: Pubkey,
    settlement_mint: Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    let (investor_ref, compliance_ref) = hashes();
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        MARKET_ID,
        &market_ix::SettlePrimaryPlacement {
            placement_id: placement_id.to_string(),
            issuance_id: issuance_id.to_string(),
            quantity,
            unit_price,
            total_settlement_amount: total,
            investor_reference_hash: investor_ref,
            compliance_reference_hash: compliance_ref,
        }
        .data(),
        market_accounts::SettlePrimaryPlacement {
            registrar,
            investor,
            market_config: market_config_pda(),
            placement: placement_pda(placement_id),
            pool: pool_pda(POOL_ID),
            instrument_mint,
            settlement_mint,
            registrar_instrument_ata: ata(&env.registrar.pubkey(), &instrument_mint),
            investor_instrument_ata: ata(&investor, &instrument_mint),
            investor_settlement_ata: ata(&investor, &settlement_mint),
            issuer_settlement_ata: ata(&env.settlement_owner.pubkey(), &settlement_mint),
            issuer_settlement_owner: env.settlement_owner.pubkey(),
            token_program: TOKEN_2022_ID,
            associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn default_settle(env: &Env) -> anchor_lang::solana_program::instruction::Instruction {
    settle_ix(
        env,
        env.registrar.pubkey(),
        env.investor.pubkey(),
        PLACEMENT_ID,
        ISSUANCE_ID,
        QUANTITY,
        UNIT_PRICE,
        SETTLEMENT_TOTAL,
        env.instrument_mint,
        env.settlement_mint,
    )
}

fn load_placement(env: &Env, placement_id: &str) -> PrimaryPlacementReceipt {
    let account = env.svm.get_account(&placement_pda(placement_id)).unwrap();
    let mut data: &[u8] = &account.data;
    PrimaryPlacementReceipt::try_deserialize(&mut data).unwrap()
}

fn load_pool(env: &Env) -> ContractPoolAccount {
    let account = env.svm.get_account(&pool_pda(POOL_ID)).unwrap();
    let mut data: &[u8] = &account.data;
    ContractPoolAccount::try_deserialize(&mut data).unwrap()
}

fn load_contract(env: &Env) -> DigitalAgriculturalContractAccount {
    let account = env.svm.get_account(&contract_pda(CONTRACT_ID)).unwrap();
    let mut data: &[u8] = &account.data;
    DigitalAgriculturalContractAccount::try_deserialize(&mut data).unwrap()
}

fn load_config(env: &Env) -> MarketConfig {
    let account = env.svm.get_account(&market_config_pda()).unwrap();
    let mut data: &[u8] = &account.data;
    MarketConfig::try_deserialize(&mut data).unwrap()
}

fn settle_ok(env: &mut Env) {
    let ix = default_settle(env);
    send(&mut env.svm, &[&env.registrar, &env.investor], ix);
}

fn settle_fail(env: &mut Env) -> String {
    let ix = default_settle(env);
    send_err(&mut env.svm, &[&env.registrar, &env.investor], ix)
}

fn secondary_settlement_pda(trade_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[
            market_constants::SECONDARY_SETTLEMENT_SEED,
            trade_id.as_bytes(),
        ],
        &MARKET_ID,
    )
    .0
}

fn transfer_tokens(
    svm: &mut LiteSVM,
    authority: &Keypair,
    mint: &Pubkey,
    from: &Pubkey,
    to: &Pubkey,
    amount: u64,
) {
    send(
        svm,
        &[authority],
        spl_token_2022::instruction::transfer_checked(
            &TOKEN_2022_ID,
            from,
            mint,
            to,
            &authority.pubkey(),
            &[],
            amount,
            0,
        )
        .unwrap(),
    );
}

fn freeze_ata(svm: &mut LiteSVM, authority: &Keypair, mint: &Pubkey, account: &Pubkey) {
    send(
        svm,
        &[authority],
        spl_token_2022::instruction::freeze_account(
            &TOKEN_2022_ID,
            account,
            mint,
            &authority.pubkey(),
            &[],
        )
        .unwrap(),
    );
}

fn settle_secondary_ix(
    env: &Env,
    seller: Pubkey,
    buyer: Pubkey,
    trade_id: &str,
    quantity: u64,
    unit_price: u64,
    notional: u64,
    instrument_mint: Pubkey,
    settlement_mint: Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        MARKET_ID,
        &market_ix::SettleSecondaryDvp {
            trade_id: trade_id.to_string(),
            quantity,
            unit_price,
            notional,
        }
        .data(),
        market_accounts::SettleSecondaryDvp {
            seller,
            buyer,
            market_config: market_config_pda(),
            settlement: secondary_settlement_pda(trade_id),
            instrument_mint,
            settlement_mint,
            seller_instrument_ata: ata(&seller, &instrument_mint),
            buyer_instrument_ata: ata(&buyer, &instrument_mint),
            buyer_settlement_ata: ata(&buyer, &settlement_mint),
            seller_settlement_ata: ata(&seller, &settlement_mint),
            token_program: TOKEN_2022_ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn default_secondary(env: &Env) -> anchor_lang::solana_program::instruction::Instruction {
    settle_secondary_ix(
        env,
        env.investor.pubkey(),
        env.buyer.pubkey(),
        TRADE_ID,
        SECONDARY_QTY,
        SECONDARY_PRICE,
        SECONDARY_NOTIONAL,
        env.instrument_mint,
        env.settlement_mint,
    )
}

fn prepare_secondary(env: &mut Env) {
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.investor.pubkey(),
        &env.instrument_mint,
    );
    transfer_tokens(
        &mut env.svm,
        &env.registrar,
        &env.instrument_mint,
        &ata(&env.registrar.pubkey(), &env.instrument_mint),
        &ata(&env.investor.pubkey(), &env.instrument_mint),
        10,
    );
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.buyer.pubkey(),
        &env.instrument_mint,
    );
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.buyer.pubkey(),
        &env.settlement_mint,
    );
    mint_to(
        &mut env.svm,
        &env.registrar,
        &env.settlement_mint,
        &ata(&env.buyer.pubkey(), &env.settlement_mint),
        BUYER_KZT,
    );
}

fn load_secondary(env: &Env, trade_id: &str) -> SecondarySettlementReceipt {
    let account = env
        .svm
        .get_account(&secondary_settlement_pda(trade_id))
        .unwrap();
    let mut data: &[u8] = &account.data;
    SecondarySettlementReceipt::try_deserialize(&mut data).unwrap()
}

fn secondary_ok(env: &mut Env) {
    let ix = default_secondary(env);
    send(&mut env.svm, &[&env.investor, &env.buyer], ix);
}

fn secondary_fail(env: &mut Env) -> String {
    let ix = default_secondary(env);
    send_err(&mut env.svm, &[&env.investor, &env.buyer], ix)
}

#[test]
fn valid_primary_placement_succeeds() {
    let mut env = setup();
    settle_ok(&mut env);
    let receipt = load_placement(&env, PLACEMENT_ID);
    assert_eq!(receipt.placement_id, PLACEMENT_ID);
    assert_eq!(receipt.issuance_id, ISSUANCE_ID);
    assert_eq!(receipt.quantity, QUANTITY);
    assert_eq!(receipt.unit_price, UNIT_PRICE);
    assert_eq!(receipt.total_settlement_amount, SETTLEMENT_TOTAL);
    assert_eq!(receipt.status, PlacementStatus::Settled);
    assert_eq!(receipt.investor_wallet, env.investor.pubkey());
    assert_eq!(receipt.registrar_authority, env.registrar.pubkey());
    assert_eq!(receipt.instrument_mint, env.instrument_mint);
    assert_eq!(receipt.settlement_mint, env.settlement_mint);
}

#[test]
fn token_2022_supply_unchanged_after_placement() {
    let mut env = setup();
    assert_eq!(mint_supply(&env.svm, &env.instrument_mint), MINT_SUPPLY);
    settle_ok(&mut env);
    assert_eq!(mint_supply(&env.svm, &env.instrument_mint), MINT_SUPPLY);
}

#[test]
fn registrar_inventory_decreases_by_quantity() {
    let mut env = setup();
    let registrar_ata = ata(&env.registrar.pubkey(), &env.instrument_mint);
    assert_eq!(token_amount(&env.svm, &registrar_ata), MINT_SUPPLY);
    settle_ok(&mut env);
    assert_eq!(
        token_amount(&env.svm, &registrar_ata),
        MINT_SUPPLY - QUANTITY
    );
}

#[test]
fn investor_wheat_balance_increases_by_quantity() {
    let mut env = setup();
    settle_ok(&mut env);
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.instrument_mint)
        ),
        QUANTITY
    );
}

#[test]
fn investor_demo_kzt_decreases_by_total() {
    let mut env = setup();
    let investor_kzt = ata(&env.investor.pubkey(), &env.settlement_mint);
    assert_eq!(token_amount(&env.svm, &investor_kzt), INVESTOR_KZT);
    settle_ok(&mut env);
    assert_eq!(
        token_amount(&env.svm, &investor_kzt),
        INVESTOR_KZT - SETTLEMENT_TOTAL
    );
}

#[test]
fn settlement_destination_demo_kzt_increases() {
    let mut env = setup();
    settle_ok(&mut env);
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.settlement_owner.pubkey(), &env.settlement_mint)
        ),
        SETTLEMENT_TOTAL
    );
}

#[test]
fn placement_receipt_created() {
    let mut env = setup();
    settle_ok(&mut env);
    let receipt = load_placement(&env, PLACEMENT_ID);
    assert_eq!(receipt.status, PlacementStatus::Settled);
    assert_eq!(receipt.settled_at, 1_700_000_000);
}

#[test]
fn placement_pda_is_deterministic() {
    let first = placement_pda(PLACEMENT_ID);
    let again = placement_pda(PLACEMENT_ID);
    let other = placement_pda("PL-ISS001-0002");
    assert_eq!(first, again);
    assert_ne!(first, other);
}

#[test]
fn duplicate_placement_id_rejected() {
    let mut env = setup();
    settle_ok(&mut env);
    let logs = settle_fail(&mut env);
    assert!(
        logs.to_lowercase().contains("already in use")
            || logs.contains("already initialized")
            || logs.contains("AccountAlreadyInitialized"),
        "{logs}"
    );
}

#[test]
fn insufficient_wheat_inventory_rejected_after_drain() {
    let mut env = setup();
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.investor.pubkey(),
        &env.instrument_mint,
    );
    send(
        &mut env.svm,
        &[&env.registrar],
        spl_token_2022::instruction::transfer_checked(
            &TOKEN_2022_ID,
            &ata(&env.registrar.pubkey(), &env.instrument_mint),
            &env.instrument_mint,
            &ata(&env.investor.pubkey(), &env.instrument_mint),
            &env.registrar.pubkey(),
            &[],
            MINT_SUPPLY - 5,
            0,
        )
        .unwrap(),
    );
    let logs = settle_fail(&mut env);
    assert!(
        logs.contains("InsufficientInstrumentInventory") || logs.contains("insufficient"),
        "{logs}"
    );
}

#[test]
fn insufficient_demo_kzt_rejected() {
    let mut env = setup();
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.stranger.pubkey(),
        &env.settlement_mint,
    );
    send(
        &mut env.svm,
        &[&env.investor],
        spl_token_2022::instruction::transfer_checked(
            &TOKEN_2022_ID,
            &ata(&env.investor.pubkey(), &env.settlement_mint),
            &env.settlement_mint,
            &ata(&env.stranger.pubkey(), &env.settlement_mint),
            &env.investor.pubkey(),
            &[],
            INVESTOR_KZT - 500,
            0,
        )
        .unwrap(),
    );
    let logs = settle_fail(&mut env);
    assert!(
        logs.contains("InsufficientSettlementBalance") || logs.contains("insufficient"),
        "{logs}"
    );
}

#[test]
fn wrong_instrument_mint_rejected() {
    let mut env = setup();
    let other = create_mint(&mut env.svm, &env.registrar, &env.registrar.pubkey());
    create_ata(&mut env.svm, &env.registrar, &env.registrar.pubkey(), &other);
    mint_to(
        &mut env.svm,
        &env.registrar,
        &other,
        &ata(&env.registrar.pubkey(), &other),
        MINT_SUPPLY,
    );
    let ix = settle_ix(
            &env,
            env.registrar.pubkey(),
            env.investor.pubkey(),
            PLACEMENT_ID,
            ISSUANCE_ID,
            QUANTITY,
            UNIT_PRICE,
            SETTLEMENT_TOTAL,
            other,
            env.settlement_mint,
        );
    let logs = send_err(
        &mut env.svm,
        &[&env.registrar, &env.investor],
        ix,
    );
    assert!(
        logs.contains("WrongInstrumentMint") || logs.contains("has one constraint"),
        "{logs}"
    );
}

#[test]
fn wrong_settlement_mint_rejected() {
    let mut env = setup();
    let other = create_mint(&mut env.svm, &env.registrar, &env.registrar.pubkey());
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.investor.pubkey(),
        &other,
    );
    mint_to(
        &mut env.svm,
        &env.registrar,
        &other,
        &ata(&env.investor.pubkey(), &other),
        INVESTOR_KZT,
    );
    let ix = settle_ix(
            &env,
            env.registrar.pubkey(),
            env.investor.pubkey(),
            PLACEMENT_ID,
            ISSUANCE_ID,
            QUANTITY,
            UNIT_PRICE,
            SETTLEMENT_TOTAL,
            env.instrument_mint,
            other,
        );
    let logs = send_err(
        &mut env.svm,
        &[&env.registrar, &env.investor],
        ix,
    );
    assert!(
        logs.contains("WrongSettlementMint") || logs.contains("has one constraint"),
        "{logs}"
    );
}

#[test]
fn unauthorized_registrar_rejected() {
    let mut env = setup();
    let ix = settle_ix(
            &env,
            env.stranger.pubkey(),
            env.investor.pubkey(),
            PLACEMENT_ID,
            ISSUANCE_ID,
            QUANTITY,
            UNIT_PRICE,
            SETTLEMENT_TOTAL,
            env.instrument_mint,
            env.settlement_mint,
        );
    let logs = send_err(
        &mut env.svm,
        &[&env.stranger, &env.investor],
        ix,
    );
    assert!(
        logs.contains("UnauthorizedRegistrar")
            || logs.contains("has one constraint")
            || logs.contains("ConstraintHasOne"),
        "{logs}"
    );
}

#[test]
fn missing_investor_signature_rejected() {
    let mut env = setup();
    let ix = default_settle(&env);
    let logs = send_err(&mut env.svm, &[&env.registrar], ix);
    assert!(
        logs.to_lowercase().contains("signature")
            || logs.to_lowercase().contains("signer")
            || logs.contains("MissingRequiredSignature")
            || logs.contains("NotEnoughSigners"),
        "{logs}"
    );
}

#[test]
fn quantity_zero_rejected() {
    let mut env = setup();
    let ix = settle_ix(
            &env,
            env.registrar.pubkey(),
            env.investor.pubkey(),
            PLACEMENT_ID,
            ISSUANCE_ID,
            0,
            UNIT_PRICE,
            0,
            env.instrument_mint,
            env.settlement_mint,
        );
    let logs = send_err(
        &mut env.svm,
        &[&env.registrar, &env.investor],
        ix,
    );
    assert!(
        logs.contains("QuantityZero") || logs.contains("greater than zero"),
        "{logs}"
    );
}

#[test]
fn mismatched_price_rejected() {
    let mut env = setup();
    let ix = settle_ix(
            &env,
            env.registrar.pubkey(),
            env.investor.pubkey(),
            PLACEMENT_ID,
            ISSUANCE_ID,
            QUANTITY,
            99_000,
            990_000,
            env.instrument_mint,
            env.settlement_mint,
        );
    let logs = send_err(
        &mut env.svm,
        &[&env.registrar, &env.investor],
        ix,
    );
    assert!(
        logs.contains("PriceMismatch") || logs.contains("unit price"),
        "{logs}"
    );
}

#[test]
fn mismatched_total_rejected() {
    let mut env = setup();
    let ix = settle_ix(
            &env,
            env.registrar.pubkey(),
            env.investor.pubkey(),
            PLACEMENT_ID,
            ISSUANCE_ID,
            QUANTITY,
            UNIT_PRICE,
            999_999,
            env.instrument_mint,
            env.settlement_mint,
        );
    let logs = send_err(
        &mut env.svm,
        &[&env.registrar, &env.investor],
        ix,
    );
    assert!(
        logs.contains("SettlementAmountMismatch") || logs.contains("does not equal"),
        "{logs}"
    );
}

#[test]
fn atomic_rollback_if_payment_leg_fails() {
    let mut env = setup();
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.stranger.pubkey(),
        &env.settlement_mint,
    );
    send(
        &mut env.svm,
        &[&env.investor],
        spl_token_2022::instruction::transfer_checked(
            &TOKEN_2022_ID,
            &ata(&env.investor.pubkey(), &env.settlement_mint),
            &env.settlement_mint,
            &ata(&env.stranger.pubkey(), &env.settlement_mint),
            &env.investor.pubkey(),
            &[],
            INVESTOR_KZT,
            0,
        )
        .unwrap(),
    );
    let registrar_before = token_amount(
        &env.svm,
        &ata(&env.registrar.pubkey(), &env.instrument_mint),
    );
    let _ = settle_fail(&mut env);
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.registrar.pubkey(), &env.instrument_mint)
        ),
        registrar_before
    );
    assert!(env.svm.get_account(&placement_pda(PLACEMENT_ID)).is_none());
}

#[test]
fn atomic_rollback_if_token_leg_fails() {
    let mut env = setup();
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.investor.pubkey(),
        &env.instrument_mint,
    );
    send(
        &mut env.svm,
        &[&env.registrar],
        spl_token_2022::instruction::transfer_checked(
            &TOKEN_2022_ID,
            &ata(&env.registrar.pubkey(), &env.instrument_mint),
            &env.instrument_mint,
            &ata(&env.investor.pubkey(), &env.instrument_mint),
            &env.registrar.pubkey(),
            &[],
            MINT_SUPPLY,
            0,
        )
        .unwrap(),
    );
    let investor_kzt_before = token_amount(
        &env.svm,
        &ata(&env.investor.pubkey(), &env.settlement_mint),
    );
    let _ = settle_fail(&mut env);
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.settlement_mint)
        ),
        investor_kzt_before
    );
    assert!(env.svm.get_account(&placement_pda(PLACEMENT_ID)).is_none());
}

#[test]
fn existing_dac_and_pool_remain_readable() {
    let mut env = setup();
    settle_ok(&mut env);
    let pool = load_pool(&env);
    let contract = load_contract(&env);
    assert_eq!(pool.pool_id, POOL_ID);
    assert_eq!(pool.eligible_volume_tonnes, ELIGIBLE);
    assert_eq!(pool.status, PoolStatus::Active);
    assert_eq!(contract.contract_id, CONTRACT_ID);
    assert_eq!(contract.expected_volume_tonnes, 10_000);
}

#[test]
fn existing_instrument_mint_remains_intact() {
    let mut env = setup();
    let mint = env.instrument_mint;
    settle_ok(&mut env);
    assert_eq!(env.instrument_mint, mint);
    assert_eq!(mint_supply(&env.svm, &mint), MINT_SUPPLY);
}

#[test]
fn total_supply_stays_one_thousand() {
    let mut env = setup();
    settle_ok(&mut env);
    assert_eq!(mint_supply(&env.svm, &env.instrument_mint), 1_000);
}

#[test]
fn suspended_pool_blocks_placement() {
    let mut env = setup();
    send(
        &mut env.svm,
        &[&env.registrar],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::SetPoolStatus {
                status: PoolStatus::Suspended,
            }
            .data(),
            accounts::SetPoolStatus {
                authority: env.registrar.pubkey(),
                pool: pool_pda(POOL_ID),
                registry: registry_pda(),
            }
            .to_account_metas(None),
        ),
    );
    let logs = settle_fail(&mut env);
    assert!(
        logs.contains("InstrumentNotEligible") || logs.contains("not eligible"),
        "{logs}"
    );
}

#[test]
fn market_config_records_simulation_price() {
    let env = setup();
    let config = load_config(&env);
    assert_eq!(config.simulated_unit_price, UNIT_PRICE);
    assert_eq!(config.issuance_id, ISSUANCE_ID);
    assert_eq!(config.registrar, env.registrar.pubkey());
}

#[test]
fn coverage_breach_blocks_placement() {
    let mut env = setup();
    send(
        &mut env.svm,
        &[&env.registrar],
        anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            REGISTRY_ID,
            &instruction::UpdatePoolCoverage {
                eligible_volume_tonnes: 500,
                coverage_haircut_bps: 1_700,
                coverage_snapshot_hash: [5u8; 32],
            }
            .data(),
            accounts::UpdatePoolCoverage {
                authority: env.registrar.pubkey(),
                pool: pool_pda(POOL_ID),
                registry: registry_pda(),
            }
            .to_account_metas(None),
        ),
    );
    let logs = settle_fail(&mut env);
    assert!(
        logs.contains("CoverageBreach") || logs.contains("exceeds eligible"),
        "{logs}"
    );
}

#[test]
fn secondary_dvp_success_moves_wheat_and_demo_kzt() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let registrar_wheat = token_amount(
        &env.svm,
        &ata(&env.registrar.pubkey(), &env.instrument_mint),
    );
    secondary_ok(&mut env);
    let receipt = load_secondary(&env, TRADE_ID);
    assert_eq!(receipt.trade_id, TRADE_ID);
    assert_eq!(receipt.seller, env.investor.pubkey());
    assert_eq!(receipt.buyer, env.buyer.pubkey());
    assert_eq!(receipt.quantity, SECONDARY_QTY);
    assert_eq!(receipt.unit_price, SECONDARY_PRICE);
    assert_eq!(receipt.notional, SECONDARY_NOTIONAL);
    assert_eq!(receipt.status, SecondarySettlementStatus::Settled);
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.instrument_mint)
        ),
        8
    );
    assert_eq!(
        token_amount(&env.svm, &ata(&env.buyer.pubkey(), &env.instrument_mint)),
        2
    );
    assert_eq!(
        token_amount(&env.svm, &ata(&env.buyer.pubkey(), &env.settlement_mint)),
        BUYER_KZT - SECONDARY_NOTIONAL
    );
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.settlement_mint)
        ),
        INVESTOR_KZT + SECONDARY_NOTIONAL
    );
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.registrar.pubkey(), &env.instrument_mint)
        ),
        registrar_wheat
    );
    assert_eq!(mint_supply(&env.svm, &env.instrument_mint), MINT_SUPPLY);
}

#[test]
fn secondary_does_not_use_primary_simulation_price() {
    let mut env = setup();
    prepare_secondary(&mut env);
    secondary_ok(&mut env);
    let config = load_config(&env);
    assert_eq!(config.simulated_unit_price, UNIT_PRICE);
    assert_ne!(SECONDARY_PRICE, UNIT_PRICE);
}

#[test]
fn secondary_after_primary_leaves_registrar_inventory_unchanged() {
    let mut env = setup();
    settle_ok(&mut env);
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.buyer.pubkey(),
        &env.instrument_mint,
    );
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.buyer.pubkey(),
        &env.settlement_mint,
    );
    mint_to(
        &mut env.svm,
        &env.registrar,
        &env.settlement_mint,
        &ata(&env.buyer.pubkey(), &env.settlement_mint),
        BUYER_KZT,
    );
    let registrar_wheat = token_amount(
        &env.svm,
        &ata(&env.registrar.pubkey(), &env.instrument_mint),
    );
    secondary_ok(&mut env);
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.registrar.pubkey(), &env.instrument_mint)
        ),
        registrar_wheat
    );
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.instrument_mint)
        ),
        8
    );
    assert_eq!(
        token_amount(&env.svm, &ata(&env.buyer.pubkey(), &env.instrument_mint)),
        2
    );
}

#[test]
fn initialize_market_still_works_with_secondary_instruction_present() {
    let env = setup();
    let config = load_config(&env);
    assert_eq!(config.issuance_id, ISSUANCE_ID);
    assert_eq!(config.simulated_unit_price, UNIT_PRICE);
}

#[test]
fn secondary_insufficient_seller_wheat_is_atomic() {
    let mut env = setup();
    prepare_secondary(&mut env);
    transfer_tokens(
        &mut env.svm,
        &env.investor,
        &env.instrument_mint,
        &ata(&env.investor.pubkey(), &env.instrument_mint),
        &ata(&env.registrar.pubkey(), &env.instrument_mint),
        9,
    );
    let seller_wheat_before = token_amount(
        &env.svm,
        &ata(&env.investor.pubkey(), &env.instrument_mint),
    );
    let buyer_kzt_before = token_amount(
        &env.svm,
        &ata(&env.buyer.pubkey(), &env.settlement_mint),
    );
    let logs = secondary_fail(&mut env);
    assert!(
        logs.contains("InsufficientSellerInstrument") || logs.contains("insufficient"),
        "{logs}"
    );
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.instrument_mint)
        ),
        seller_wheat_before
    );
    assert_eq!(
        token_amount(&env.svm, &ata(&env.buyer.pubkey(), &env.settlement_mint)),
        buyer_kzt_before
    );
    assert!(env
        .svm
        .get_account(&secondary_settlement_pda(TRADE_ID))
        .is_none());
}

#[test]
fn secondary_insufficient_buyer_kzt_is_atomic() {
    let mut env = setup();
    prepare_secondary(&mut env);
    transfer_tokens(
        &mut env.svm,
        &env.buyer,
        &env.settlement_mint,
        &ata(&env.buyer.pubkey(), &env.settlement_mint),
        &ata(&env.investor.pubkey(), &env.settlement_mint),
        BUYER_KZT - 1_000,
    );
    let seller_wheat_before = token_amount(
        &env.svm,
        &ata(&env.investor.pubkey(), &env.instrument_mint),
    );
    let buyer_kzt_before = token_amount(
        &env.svm,
        &ata(&env.buyer.pubkey(), &env.settlement_mint),
    );
    let logs = secondary_fail(&mut env);
    assert!(
        logs.contains("InsufficientBuyerSettlement") || logs.contains("insufficient"),
        "{logs}"
    );
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.instrument_mint)
        ),
        seller_wheat_before
    );
    assert_eq!(
        token_amount(&env.svm, &ata(&env.buyer.pubkey(), &env.settlement_mint)),
        buyer_kzt_before
    );
}

#[test]
fn secondary_frozen_destination_rolls_back_both_legs() {
    let mut env = setup();
    prepare_secondary(&mut env);
    freeze_ata(
        &mut env.svm,
        &env.registrar,
        &env.settlement_mint,
        &ata(&env.investor.pubkey(), &env.settlement_mint),
    );
    let seller_wheat_before = token_amount(
        &env.svm,
        &ata(&env.investor.pubkey(), &env.instrument_mint),
    );
    let buyer_kzt_before = token_amount(
        &env.svm,
        &ata(&env.buyer.pubkey(), &env.settlement_mint),
    );
    let logs = secondary_fail(&mut env);
    assert!(
        logs.contains("TokenAccountFrozen")
            || logs.to_lowercase().contains("frozen")
            || logs.contains("AccountFrozen"),
        "{logs}"
    );
    assert_eq!(
        token_amount(
            &env.svm,
            &ata(&env.investor.pubkey(), &env.instrument_mint)
        ),
        seller_wheat_before
    );
    assert_eq!(
        token_amount(&env.svm, &ata(&env.buyer.pubkey(), &env.settlement_mint)),
        buyer_kzt_before
    );
}

#[test]
fn secondary_wrong_instrument_mint_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let other = create_mint(&mut env.svm, &env.registrar, &env.registrar.pubkey());
    let ix = settle_secondary_ix(
        &env,
        env.investor.pubkey(),
        env.buyer.pubkey(),
        TRADE_ID,
        SECONDARY_QTY,
        SECONDARY_PRICE,
        SECONDARY_NOTIONAL,
        other,
        env.settlement_mint,
    );
    let logs = send_err(&mut env.svm, &[&env.investor, &env.buyer], ix);
    assert!(
        logs.contains("WrongInstrumentMint") || logs.contains("has one constraint"),
        "{logs}"
    );
}

#[test]
fn secondary_wrong_settlement_mint_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let other = create_mint(&mut env.svm, &env.registrar, &env.registrar.pubkey());
    let ix = settle_secondary_ix(
        &env,
        env.investor.pubkey(),
        env.buyer.pubkey(),
        TRADE_ID,
        SECONDARY_QTY,
        SECONDARY_PRICE,
        SECONDARY_NOTIONAL,
        env.instrument_mint,
        other,
    );
    let logs = send_err(&mut env.svm, &[&env.investor, &env.buyer], ix);
    assert!(
        logs.contains("WrongSettlementMint") || logs.contains("has one constraint"),
        "{logs}"
    );
}

#[test]
fn secondary_wrong_seller_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.stranger.pubkey(),
        &env.instrument_mint,
    );
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.stranger.pubkey(),
        &env.settlement_mint,
    );
    let ix = settle_secondary_ix(
        &env,
        env.stranger.pubkey(),
        env.buyer.pubkey(),
        TRADE_ID,
        SECONDARY_QTY,
        SECONDARY_PRICE,
        SECONDARY_NOTIONAL,
        env.instrument_mint,
        env.settlement_mint,
    );
    let logs = send_err(&mut env.svm, &[&env.stranger, &env.buyer], ix);
    assert!(
        logs.contains("InsufficientSellerInstrument")
            || logs.contains("constraint")
            || logs.contains("insufficient"),
        "{logs}"
    );
}

#[test]
fn secondary_wrong_buyer_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.stranger.pubkey(),
        &env.instrument_mint,
    );
    create_ata(
        &mut env.svm,
        &env.registrar,
        &env.stranger.pubkey(),
        &env.settlement_mint,
    );
    let ix = settle_secondary_ix(
        &env,
        env.investor.pubkey(),
        env.stranger.pubkey(),
        TRADE_ID,
        SECONDARY_QTY,
        SECONDARY_PRICE,
        SECONDARY_NOTIONAL,
        env.instrument_mint,
        env.settlement_mint,
    );
    let logs = send_err(&mut env.svm, &[&env.investor, &env.stranger], ix);
    assert!(
        logs.contains("InsufficientBuyerSettlement")
            || logs.contains("constraint")
            || logs.contains("insufficient"),
        "{logs}"
    );
}

#[test]
fn secondary_wrong_quantity_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let ix = settle_secondary_ix(
        &env,
        env.investor.pubkey(),
        env.buyer.pubkey(),
        TRADE_ID,
        3,
        SECONDARY_PRICE,
        SECONDARY_NOTIONAL,
        env.instrument_mint,
        env.settlement_mint,
    );
    let logs = send_err(&mut env.svm, &[&env.investor, &env.buyer], ix);
    assert!(
        logs.contains("SettlementAmountMismatch") || logs.contains("does not equal"),
        "{logs}"
    );
}

#[test]
fn secondary_notional_mismatch_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let ix = settle_secondary_ix(
        &env,
        env.investor.pubkey(),
        env.buyer.pubkey(),
        TRADE_ID,
        SECONDARY_QTY,
        SECONDARY_PRICE,
        200_000,
        env.instrument_mint,
        env.settlement_mint,
    );
    let logs = send_err(&mut env.svm, &[&env.investor, &env.buyer], ix);
    assert!(
        logs.contains("SettlementAmountMismatch") || logs.contains("does not equal"),
        "{logs}"
    );
}

#[test]
fn secondary_duplicate_trade_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    secondary_ok(&mut env);
    let logs = secondary_fail(&mut env);
    assert!(
        logs.to_lowercase().contains("already in use")
            || logs.contains("already initialized")
            || logs.contains("AccountAlreadyInitialized"),
        "{logs}"
    );
}

#[test]
fn secondary_missing_seller_signature_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let ix = default_secondary(&env);
    let logs = send_err(&mut env.svm, &[&env.buyer], ix);
    assert!(
        logs.to_lowercase().contains("signature")
            || logs.to_lowercase().contains("signer")
            || logs.contains("MissingRequiredSignature"),
        "{logs}"
    );
}

#[test]
fn secondary_missing_buyer_signature_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let ix = default_secondary(&env);
    let logs = send_err(&mut env.svm, &[&env.investor], ix);
    assert!(
        logs.to_lowercase().contains("signature")
            || logs.to_lowercase().contains("signer")
            || logs.contains("MissingRequiredSignature"),
        "{logs}"
    );
}

#[test]
fn secondary_zero_quantity_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let ix = settle_secondary_ix(
        &env,
        env.investor.pubkey(),
        env.buyer.pubkey(),
        TRADE_ID,
        0,
        SECONDARY_PRICE,
        0,
        env.instrument_mint,
        env.settlement_mint,
    );
    let logs = send_err(&mut env.svm, &[&env.investor, &env.buyer], ix);
    assert!(
        logs.contains("QuantityZero") || logs.contains("greater than zero"),
        "{logs}"
    );
}

#[test]
fn secondary_wrong_market_config_rejected() {
    let mut env = setup();
    prepare_secondary(&mut env);
    let mut ix = default_secondary(&env);
    ix.accounts[2].pubkey = pool_pda(POOL_ID);
    let logs = send_err(&mut env.svm, &[&env.investor, &env.buyer], ix);
    assert!(
        logs.to_lowercase().contains("constraint")
            || logs.contains("seeds")
            || logs.contains("Wrong"),
        "{logs}"
    );
}
