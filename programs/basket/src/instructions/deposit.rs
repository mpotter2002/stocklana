use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    errors::BasketError,
    mint_policy::validate_mint,
    state::{BasketState, Phase},
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"basket", owner.key().as_ref(), &basket.basket_id.to_le_bytes()],
        bump = basket.bump,
        has_one = owner,
        constraint = basket.phase == Phase::Idle @ BasketError::BasketBusy
    )]
    pub basket: Box<Account<'info, BasketState>>,
    #[account(
        mint::token_program = token_program
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub owner_source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = basket,
        associated_token::token_program = token_program
    )]
    pub custody: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, BasketError::ZeroAmount);
    require!(
        ctx.accounts
            .basket
            .supports_custody_asset(ctx.accounts.mint.key(), ctx.accounts.token_program.key()),
        BasketError::UnsupportedAsset
    );

    validate_mint(
        &ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint.key(),
        ctx.accounts.token_program.key(),
    )?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.owner_source.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.custody.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}
