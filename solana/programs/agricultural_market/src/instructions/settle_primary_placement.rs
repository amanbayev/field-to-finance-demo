use agricultural_registry::state::{ContractPoolAccount, PoolStatus};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{
    transfer_checked, Token2022, TransferChecked, ID as TOKEN_2022_PROGRAM_ID,
};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::{
    MARKET_CONFIG_SEED, MAX_ISSUANCE_ID, MAX_PLACEMENT_ID, PRIMARY_PLACEMENT_SEED,
};
use crate::error::MarketError;
use crate::state::{MarketConfig, PlacementStatus, PrimaryPlacementReceipt};

#[derive(Accounts)]
#[instruction(placement_id: String)]
pub struct SettlePrimaryPlacement<'info> {
    #[account(mut)]
    pub registrar: Signer<'info>,
    pub investor: Signer<'info>,
    #[account(
        seeds = [MARKET_CONFIG_SEED],
        bump = market_config.bump,
        has_one = registrar @ MarketError::UnauthorizedRegistrar,
        has_one = pool @ MarketError::WrongPool,
        has_one = instrument_mint @ MarketError::WrongInstrumentMint,
        has_one = settlement_mint @ MarketError::WrongSettlementMint
    )]
    pub market_config: Box<Account<'info, MarketConfig>>,
    #[account(
        init,
        payer = registrar,
        space = 8 + PrimaryPlacementReceipt::INIT_SPACE,
        seeds = [PRIMARY_PLACEMENT_SEED, placement_id.as_bytes()],
        bump
    )]
    pub placement: Box<Account<'info, PrimaryPlacementReceipt>>,
    pub pool: Box<Account<'info, ContractPoolAccount>>,
    pub instrument_mint: Box<InterfaceAccount<'info, Mint>>,
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = instrument_mint,
        token::authority = registrar,
        token::token_program = token_program
    )]
    pub registrar_instrument_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = registrar,
        associated_token::mint = instrument_mint,
        associated_token::authority = investor,
        associated_token::token_program = token_program
    )]
    pub investor_instrument_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = investor,
        token::token_program = token_program
    )]
    pub investor_settlement_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = registrar,
        associated_token::mint = settlement_mint,
        associated_token::authority = issuer_settlement_owner,
        associated_token::token_program = token_program
    )]
    pub issuer_settlement_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: must match the configured technical demo settlement owner.
    #[account(address = market_config.issuer_settlement_owner)]
    pub issuer_settlement_owner: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_settle_primary_placement(
    ctx: Context<SettlePrimaryPlacement>,
    placement_id: String,
    issuance_id: String,
    quantity: u64,
    unit_price: u64,
    total_settlement_amount: u64,
    investor_reference_hash: [u8; 32],
    compliance_reference_hash: [u8; 32],
) -> Result<()> {
    require!(!placement_id.is_empty(), MarketError::PlacementIdEmpty);
    require!(
        placement_id.as_bytes().len() <= MAX_PLACEMENT_ID,
        MarketError::PlacementIdTooLong
    );
    require!(!issuance_id.is_empty(), MarketError::IssuanceIdEmpty);
    require!(
        issuance_id.as_bytes().len() <= MAX_ISSUANCE_ID,
        MarketError::IssuanceIdTooLong
    );
    require!(
        issuance_id == ctx.accounts.market_config.issuance_id,
        MarketError::IssuanceMismatch
    );
    require!(quantity > 0, MarketError::QuantityZero);
    require!(
        unit_price == ctx.accounts.market_config.simulated_unit_price,
        MarketError::PriceMismatch
    );
    let expected = quantity
        .checked_mul(unit_price)
        .ok_or(MarketError::ArithmeticOverflow)?;
    require!(
        expected == total_settlement_amount,
        MarketError::SettlementAmountMismatch
    );
    require_keys_eq!(
        ctx.accounts.token_program.key(),
        TOKEN_2022_PROGRAM_ID,
        MarketError::WrongTokenProgram
    );
    require!(
        ctx.accounts.pool.status == PoolStatus::Active,
        MarketError::InstrumentNotEligible
    );
    require!(
        ctx.accounts.instrument_mint.supply <= ctx.accounts.pool.eligible_volume_tonnes,
        MarketError::CoverageBreach
    );
    require!(
        ctx.accounts.registrar_instrument_ata.amount >= quantity,
        MarketError::InsufficientInstrumentInventory
    );
    require!(
        ctx.accounts.investor_settlement_ata.amount >= total_settlement_amount,
        MarketError::InsufficientSettlementBalance
    );

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.investor_settlement_ata.to_account_info(),
                mint: ctx.accounts.settlement_mint.to_account_info(),
                to: ctx.accounts.issuer_settlement_ata.to_account_info(),
                authority: ctx.accounts.investor.to_account_info(),
            },
        ),
        total_settlement_amount,
        ctx.accounts.settlement_mint.decimals,
    )?;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.registrar_instrument_ata.to_account_info(),
                mint: ctx.accounts.instrument_mint.to_account_info(),
                to: ctx.accounts.investor_instrument_ata.to_account_info(),
                authority: ctx.accounts.registrar.to_account_info(),
            },
        ),
        quantity,
        ctx.accounts.instrument_mint.decimals,
    )?;

    let placement = &mut ctx.accounts.placement;
    placement.placement_id = placement_id;
    placement.issuance_id = issuance_id;
    placement.instrument_mint = ctx.accounts.instrument_mint.key();
    placement.investor_wallet = ctx.accounts.investor.key();
    placement.investor_reference_hash = investor_reference_hash;
    placement.quantity = quantity;
    placement.settlement_mint = ctx.accounts.settlement_mint.key();
    placement.unit_price = unit_price;
    placement.total_settlement_amount = total_settlement_amount;
    placement.compliance_reference_hash = compliance_reference_hash;
    placement.registrar_authority = ctx.accounts.registrar.key();
    placement.settled_at = Clock::get()?.unix_timestamp;
    placement.status = PlacementStatus::Settled;
    placement.bump = ctx.bumps.placement;
    Ok(())
}
