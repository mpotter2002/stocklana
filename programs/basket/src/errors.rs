use anchor_lang::prelude::*;

#[error_code]
pub enum BasketError {
    #[msg("Select two or three assets")]
    InvalidAssetCount,
    #[msg("Mint, token program, and weight lists must have equal lengths")]
    RecipeLengthMismatch,
    #[msg("Asset mints must be distinct")]
    DuplicateMint,
    #[msg("The funding mint cannot also be a selected basket asset")]
    FundingMintInAssets,
    #[msg("Weights must be positive and total 10,000 basis points")]
    InvalidWeights,
    #[msg("Only the SPL Token and Token-2022 programs are supported")]
    UnsupportedTokenProgram,
    #[msg("The mint and token program are not part of this basket")]
    UnsupportedAsset,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Custody balance is empty")]
    EmptyCustody,
    #[msg("Basket must be idle for this action")]
    BasketBusy,
    #[msg("Operation phase must be buying, selling, or rebalancing")]
    InvalidOperationPhase,
    #[msg("Operation plan must contain between one and six legs")]
    InvalidLegCount,
    #[msg("Operation leg is not valid for its phase")]
    InvalidLeg,
    #[msg("Input and output amounts must be greater than zero")]
    InvalidLegAmounts,
    #[msg("Operation nonce is stale")]
    StaleOperationNonce,
    #[msg("Operation has expired")]
    OperationExpired,
    #[msg("Operation expiration must be in the future")]
    InvalidExpiration,
    #[msg("Leg index is outside the active operation")]
    InvalidLegIndex,
    #[msg("Operation leg was already completed")]
    LegAlreadyCompleted,
    #[msg("Instruction accounts do not match the committed leg")]
    LegAccountMismatch,
    #[msg("Input exceeds the committed leg budget")]
    InputBudgetExceeded,
    #[msg("Swap spent an unexpected raw input amount")]
    UnexpectedInputAmount,
    #[msg("Swap output was below the committed minimum")]
    MinimumOutputNotMet,
    #[msg("All operation legs must be complete")]
    OperationIncomplete,
    #[msg("No active operation can be finished")]
    NoActiveOperation,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Supply the funding mint followed by every recipe mint account")]
    MissingMintAccounts,
    #[msg("Mint account address or token program does not match the recipe")]
    InvalidMintAccount,
    #[msg("Mint extensions have not been approved for custody")]
    UnsupportedMintExtension,
    #[msg("Jupiter swap program is not the documented aggregator")]
    UnexpectedSwapProgram,
    #[msg("Jupiter remaining accounts omit basket custody or authority")]
    JupiterAccountsIncomplete,
    #[msg("Jupiter instruction data is empty or too large")]
    InvalidJupiterData,
    #[msg("Jupiter remaining accounts include an unexpected signer")]
    UnexpectedSwapSigner,
}
