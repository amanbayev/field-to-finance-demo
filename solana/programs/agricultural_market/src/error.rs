use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    #[msg("placement_id must be non-empty")]
    PlacementIdEmpty,
    #[msg("placement_id exceeds the 32-byte PDA seed limit")]
    PlacementIdTooLong,
    #[msg("issuance_id must be non-empty")]
    IssuanceIdEmpty,
    #[msg("issuance_id exceeds maximum length")]
    IssuanceIdTooLong,
    #[msg("issuance_id does not match the configured issuance")]
    IssuanceMismatch,
    #[msg("only the configured Registrar may authorize placement")]
    UnauthorizedRegistrar,
    #[msg("instrument mint does not match the configured instrument")]
    WrongInstrumentMint,
    #[msg("settlement mint does not match the configured DEMO settlement asset")]
    WrongSettlementMint,
    #[msg("token program must be Token-2022")]
    WrongTokenProgram,
    #[msg("pool account does not match the configured instrument pool")]
    WrongPool,
    #[msg("instrument is not eligible for primary placement")]
    InstrumentNotEligible,
    #[msg("minted supply exceeds eligible contract coverage")]
    CoverageBreach,
    #[msg("placement quantity must be greater than zero")]
    QuantityZero,
    #[msg("simulated unit price does not match the market configuration")]
    PriceMismatch,
    #[msg("total settlement amount does not equal quantity times unit price")]
    SettlementAmountMismatch,
    #[msg("Registrar instrument inventory is insufficient for this placement")]
    InsufficientInstrumentInventory,
    #[msg("investor settlement balance is insufficient")]
    InsufficientSettlementBalance,
    #[msg("simulated unit price must be greater than zero")]
    UnitPriceZero,
    #[msg("underlying pool is not active")]
    PoolNotActive,
    #[msg("arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("trade_id must be non-empty")]
    TradeIdEmpty,
    #[msg("trade_id exceeds the 32-byte PDA seed limit")]
    TradeIdTooLong,
    #[msg("token account is frozen or otherwise invalid")]
    TokenAccountFrozen,
    #[msg("seller instrument balance is insufficient")]
    InsufficientSellerInstrument,
    #[msg("buyer settlement balance is insufficient")]
    InsufficientBuyerSettlement,
    #[msg("market_id must be non-empty")]
    MarketIdEmpty,
    #[msg("market_id exceeds the 32-byte limit")]
    MarketIdTooLong,
    #[msg("canonical trade hash does not match the signed settlement terms")]
    CanonicalTradeHashMismatch,
}
