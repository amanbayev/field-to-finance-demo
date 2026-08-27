use anchor_lang::prelude::*;
use anchor_spl::token_2022::{
    transfer_checked, Token2022, TransferChecked, ID as TOKEN_2022_PROGRAM_ID,
};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::canonical::canonical_trade_hash;
use crate::constants::{MARKET_CONFIG_SEED, MAX_MARKET_ID, MAX_TRADE_ID, SECONDARY_SETTLEMENT_SEED};
use crate::error::MarketError;
use crate::state::{MarketConfig, SecondarySettlementReceipt, SecondarySettlementStatus};

#[derive(Accounts)]
#[instruction(trade_id: String)]
pub struct SettleSecondaryDvp<'info> {
    /// Ceremony fee payer. Does not receive instrument or settlement tokens.
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Seller of the instrument. Must sign; authorizes the instrument transfer.
    pub seller: Signer<'info>,
    /// Buyer of the instrument. Must sign; authorizes the settlement-asset transfer.
    pub buyer: Signer<'info>,
    #[account(
        seeds = [MARKET_CONFIG_SEED],
        bump = market_config.bump,
        has_one = instrument_mint @ MarketError::WrongInstrumentMint,
        has_one = settlement_mint @ MarketError::WrongSettlementMint
    )]
    pub market_config: Box<Account<'info, MarketConfig>>,
    #[account(
        init,
        payer = payer,
        space = 8 + SecondarySettlementReceipt::INIT_SPACE,
        seeds = [SECONDARY_SETTLEMENT_SEED, trade_id.as_bytes()],
        bump
    )]
    pub settlement: Box<Account<'info, SecondarySettlementReceipt>>,
    pub instrument_mint: Box<InterfaceAccount<'info, Mint>>,
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = instrument_mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_instrument_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = instrument_mint,
        token::authority = buyer,
        token::token_program = token_program
    )]
    pub buyer_instrument_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = buyer,
        token::token_program = token_program
    )]
    pub buyer_settlement_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_settlement_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_settle_secondary_dvp(
    ctx: Context<SettleSecondaryDvp>,
    trade_id: String,
    market_id: String,
    quantity: u64,
    unit_price: u64,
    notional: u64,
    expected_canonical_trade_hash: [u8; 32],
) -> Result<()> {
    require!(!trade_id.is_empty(), MarketError::TradeIdEmpty);
    require!(
        trade_id.as_bytes().len() <= MAX_TRADE_ID,
        MarketError::TradeIdTooLong
    );
    require!(!market_id.is_empty(), MarketError::MarketIdEmpty);
    require!(
        market_id.as_bytes().len() <= MAX_MARKET_ID,
        MarketError::MarketIdTooLong
    );
    require!(quantity > 0, MarketError::QuantityZero);
    require!(unit_price > 0, MarketError::UnitPriceZero);
    let expected = quantity
        .checked_mul(unit_price)
        .ok_or(MarketError::ArithmeticOverflow)?;
    require!(expected == notional, MarketError::SettlementAmountMismatch);
    require_keys_eq!(
        ctx.accounts.token_program.key(),
        TOKEN_2022_PROGRAM_ID,
        MarketError::WrongTokenProgram
    );

    require!(
        !ctx.accounts.seller_instrument_ata.is_frozen(),
        MarketError::TokenAccountFrozen
    );
    require!(
        !ctx.accounts.buyer_instrument_ata.is_frozen(),
        MarketError::TokenAccountFrozen
    );
    require!(
        !ctx.accounts.buyer_settlement_ata.is_frozen(),
        MarketError::TokenAccountFrozen
    );
    require!(
        !ctx.accounts.seller_settlement_ata.is_frozen(),
        MarketError::TokenAccountFrozen
    );

    let computed_hash = canonical_trade_hash(
        &trade_id,
        &market_id,
        &ctx.accounts.market_config.key(),
        &ctx.accounts.seller.key(),
        &ctx.accounts.buyer.key(),
        &ctx.accounts.instrument_mint.key(),
        &ctx.accounts.settlement_mint.key(),
        quantity,
        unit_price,
        notional,
    );
    require!(
        computed_hash == expected_canonical_trade_hash,
        MarketError::CanonicalTradeHashMismatch
    );

    let instrument_base = ui_to_base(quantity, ctx.accounts.instrument_mint.decimals)?;
    let settlement_base = ui_to_base(notional, ctx.accounts.settlement_mint.decimals)?;

    require!(
        ctx.accounts.seller_instrument_ata.amount >= instrument_base,
        MarketError::InsufficientSellerInstrument
    );
    require!(
        ctx.accounts.buyer_settlement_ata.amount >= settlement_base,
        MarketError::InsufficientBuyerSettlement
    );

    // Instrument leg, then settlement leg. Any CPI error aborts the instruction
    // and rolls back both legs.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.seller_instrument_ata.to_account_info(),
                mint: ctx.accounts.instrument_mint.to_account_info(),
                to: ctx.accounts.buyer_instrument_ata.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        instrument_base,
        ctx.accounts.instrument_mint.decimals,
    )?;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.buyer_settlement_ata.to_account_info(),
                mint: ctx.accounts.settlement_mint.to_account_info(),
                to: ctx.accounts.seller_settlement_ata.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        settlement_base,
        ctx.accounts.settlement_mint.decimals,
    )?;

    let clock = Clock::get()?;
    let settlement = &mut ctx.accounts.settlement;
    settlement.trade_id = trade_id;
    settlement.market_id = market_id;
    settlement.market_config = ctx.accounts.market_config.key();
    settlement.seller = ctx.accounts.seller.key();
    settlement.buyer = ctx.accounts.buyer.key();
    settlement.instrument_mint = ctx.accounts.instrument_mint.key();
    settlement.settlement_mint = ctx.accounts.settlement_mint.key();
    settlement.quantity = quantity;
    settlement.unit_price = unit_price;
    settlement.notional = notional;
    settlement.canonical_trade_hash = computed_hash;
    settlement.settled_at = clock.unix_timestamp;
    settlement.settled_slot = clock.slot;
    settlement.status = SecondarySettlementStatus::Settled;
    settlement.bump = ctx.bumps.settlement;
    Ok(())
}

fn ui_to_base(amount: u64, decimals: u8) -> Result<u64> {
    let factor = 10u64
        .checked_pow(u32::from(decimals))
        .ok_or(MarketError::ArithmeticOverflow)?;
    Ok(amount
        .checked_mul(factor)
        .ok_or(MarketError::ArithmeticOverflow)?)
}
