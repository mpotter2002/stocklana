use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    errors::BasketError,
    jupiter::JUPITER_V6,
    mint_policy::validate_mint,
    state::{BasketState, Phase},
};

pub const MAX_JUPITER_REMAINING_ACCOUNTS: usize = 64;
pub const MAX_JUPITER_INSTRUCTION_DATA: usize = 1232;

#[derive(Accounts)]
pub struct ExecuteJupiterLeg<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"basket", owner.key().as_ref(), &basket.basket_id.to_le_bytes()],
        bump = basket.bump,
        has_one = owner
    )]
    pub basket: Box<Account<'info, BasketState>>,
    #[account(mut, mint::token_program = input_token_program)]
    pub input_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, mint::token_program = output_token_program)]
    pub output_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = input_mint,
        associated_token::authority = basket,
        associated_token::token_program = input_token_program
    )]
    pub input_custody: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = output_mint,
        associated_token::authority = basket,
        associated_token::token_program = output_token_program
    )]
    pub output_custody: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Address is the documented Jupiter v6 aggregator.
    #[account(address = JUPITER_V6)]
    pub jupiter_program: UncheckedAccount<'info>,
    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_execute_jupiter_leg<'info>(
    ctx: Context<'_, '_, '_, 'info, ExecuteJupiterLeg<'info>>,
    nonce: u64,
    leg_index: u8,
    input_amount: u64,
    data: Vec<u8>,
) -> Result<()> {
    let basket = &ctx.accounts.basket;
    require!(
        basket.operation_nonce == nonce,
        BasketError::StaleOperationNonce
    );
    require!(
        matches!(
            basket.phase,
            Phase::Buying | Phase::Selling | Phase::Rebalancing
        ),
        BasketError::NoActiveOperation
    );
    require!(
        Clock::get()?.slot <= basket.expires_at_slot,
        BasketError::OperationExpired
    );

    let index = usize::from(leg_index);
    let leg = *basket
        .active_leg(index)
        .ok_or(BasketError::InvalidLegIndex)?;
    require!(
        !basket.completed_legs[index],
        BasketError::LegAlreadyCompleted
    );
    require!(
        leg.input_mint == ctx.accounts.input_mint.key()
            && leg.input_token_program == ctx.accounts.input_token_program.key()
            && leg.output_mint == ctx.accounts.output_mint.key()
            && leg.output_token_program == ctx.accounts.output_token_program.key(),
        BasketError::LegAccountMismatch
    );
    require!(
        input_amount > 0 && input_amount <= leg.max_input,
        BasketError::InputBudgetExceeded
    );
    require!(
        !data.is_empty() && data.len() <= MAX_JUPITER_INSTRUCTION_DATA,
        BasketError::InvalidJupiterData
    );

    validate_mint(
        &ctx.accounts.input_mint.to_account_info(),
        ctx.accounts.input_mint.key(),
        ctx.accounts.input_token_program.key(),
    )?;
    validate_mint(
        &ctx.accounts.output_mint.to_account_info(),
        ctx.accounts.output_mint.key(),
        ctx.accounts.output_token_program.key(),
    )?;

    let remaining = ctx.remaining_accounts;
    require!(
        !remaining.is_empty() && remaining.len() <= MAX_JUPITER_REMAINING_ACCOUNTS,
        BasketError::JupiterAccountsIncomplete
    );

    let basket_key = ctx.accounts.basket.key();
    let owner_key = ctx.accounts.owner.key();
    let input_key = ctx.accounts.input_custody.key();
    let output_key = ctx.accounts.output_custody.key();
    let mut saw_input = false;
    let mut saw_output = false;
    let mut saw_basket = false;
    let mut account_metas = Vec::with_capacity(remaining.len());
    let mut account_infos = Vec::with_capacity(remaining.len());

    for info in remaining.iter() {
        require!(
            !info.is_signer || info.key() == basket_key || info.key() == owner_key,
            BasketError::UnexpectedSwapSigner
        );
        if info.key() == input_key {
            require!(info.is_writable, BasketError::LegAccountMismatch);
            saw_input = true;
        }
        if info.key() == output_key {
            require!(info.is_writable, BasketError::LegAccountMismatch);
            saw_output = true;
        }
        if info.key() == basket_key {
            saw_basket = true;
        }
        account_metas.push(AccountMeta {
            pubkey: info.key(),
            is_signer: info.key() == basket_key || info.is_signer,
            is_writable: info.is_writable,
        });
        account_infos.push(info.clone());
    }
    require!(
        saw_input && saw_output && saw_basket,
        BasketError::JupiterAccountsIncomplete
    );

    let input_before = ctx.accounts.input_custody.amount;
    let output_before = ctx.accounts.output_custody.amount;
    let basket_id = ctx.accounts.basket.basket_id.to_le_bytes();
    let bump = [ctx.accounts.basket.bump];
    let signer_seeds: &[&[u8]] = &[
        b"basket",
        ctx.accounts.owner.key.as_ref(),
        &basket_id,
        &bump,
    ];

    invoke_signed(
        &Instruction {
            program_id: ctx.accounts.jupiter_program.key(),
            accounts: account_metas,
            data,
        },
        &account_infos,
        &[signer_seeds],
    )?;

    ctx.accounts.input_custody.reload()?;
    ctx.accounts.output_custody.reload()?;
    let input_spent = input_before
        .checked_sub(ctx.accounts.input_custody.amount)
        .ok_or(BasketError::UnexpectedInputAmount)?;
    let output_received = ctx
        .accounts
        .output_custody
        .amount
        .checked_sub(output_before)
        .ok_or(BasketError::MinimumOutputNotMet)?;
    require!(
        input_spent == input_amount,
        BasketError::UnexpectedInputAmount
    );
    require!(
        output_received >= leg.min_output,
        BasketError::MinimumOutputNotMet
    );

    ctx.accounts.basket.completed_legs[index] = true;
    Ok(())
}
