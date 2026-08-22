use agricultural_registry::state::{ContractPoolAccount, PoolStatus};
use anchor_lang::prelude::*;
use anchor_spl::token_2022::ID as TOKEN_2022_PROGRAM_ID;
use anchor_spl::token_interface::Mint;

use crate::constants::{MARKET_CONFIG_SEED, MAX_ISSUANCE_ID};
use crate::error::MarketError;
use crate::state::MarketConfig;

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub registrar: Signer<'info>,
    #[account(
        init,
        payer = registrar,
        space = 8 + MarketConfig::INIT_SPACE,
        seeds = [MARKET_CONFIG_SEED],
        bump
    )]
    pub market_config: Account<'info, MarketConfig>,
    pub pool: Account<'info, ContractPoolAccount>,
    pub instrument_mint: InterfaceAccount<'info, Mint>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: stored as the technical demo settlement owner. Not a legal beneficiary.
    pub issuer_settlement_owner: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_market(
    ctx: Context<InitializeMarket>,
    issuance_id: String,
    simulated_unit_price: u64,
) -> Result<()> {
    require!(!issuance_id.is_empty(), MarketError::IssuanceIdEmpty);
    require!(
        issuance_id.as_bytes().len() <= MAX_ISSUANCE_ID,
        MarketError::IssuanceIdTooLong
    );
    require!(simulated_unit_price > 0, MarketError::UnitPriceZero);
    require!(
        ctx.accounts.pool.status == PoolStatus::Active,
        MarketError::PoolNotActive
    );
    require_keys_eq!(
        ctx.accounts.instrument_mint.to_account_info().owner.key(),
        TOKEN_2022_PROGRAM_ID,
        MarketError::WrongTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.settlement_mint.to_account_info().owner.key(),
        TOKEN_2022_PROGRAM_ID,
        MarketError::WrongTokenProgram
    );

    let config = &mut ctx.accounts.market_config;
    config.registrar = ctx.accounts.registrar.key();
    config.instrument_mint = ctx.accounts.instrument_mint.key();
    config.settlement_mint = ctx.accounts.settlement_mint.key();
    config.issuer_settlement_owner = ctx.accounts.issuer_settlement_owner.key();
    config.pool = ctx.accounts.pool.key();
    config.issuance_id = issuance_id;
    config.simulated_unit_price = simulated_unit_price;
    config.bump = ctx.bumps.market_config;
    Ok(())
}
