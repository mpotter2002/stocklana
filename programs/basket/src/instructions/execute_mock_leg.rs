use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    errors::BasketError,
    mint_policy::validate_mint,
    state::{BasketState, Phase},
};

#[derive(Accounts)]
pub struct ExecuteMockLeg<'info> {
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
    /// CHECK: Validated by the fixed mock-swap CPI program.
    pub mock_authority: UncheckedAccount<'info>,
    pub mock_swap_program: Program<'info, mock_swap::program::MockSwap>,
    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_execute_mock_leg(
    ctx: Context<ExecuteMockLeg>,
    nonce: u64,
    leg_index: u8,
    input_amount: u64,
    mock_output_amount: u64,
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

    mock_swap::cpi::swap_exact_in(
        CpiContext::new_with_signer(
            ctx.accounts.mock_swap_program.to_account_info(),
            mock_swap::cpi::accounts::SwapExactIn {
                input_authority: ctx.accounts.basket.to_account_info(),
                input_mint: ctx.accounts.input_mint.to_account_info(),
                input_source: ctx.accounts.input_custody.to_account_info(),
                output_mint: ctx.accounts.output_mint.to_account_info(),
                output_destination: ctx.accounts.output_custody.to_account_info(),
                mock_authority: ctx.accounts.mock_authority.to_account_info(),
                input_token_program: ctx.accounts.input_token_program.to_account_info(),
                output_token_program: ctx.accounts.output_token_program.to_account_info(),
            },
            &[signer_seeds],
        ),
        input_amount,
        mock_output_amount,
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
