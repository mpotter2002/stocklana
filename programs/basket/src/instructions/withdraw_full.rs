use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    errors::BasketError,
    mint_policy::can_close_custody,
    state::{BasketState, Phase},
};

#[derive(Accounts)]
pub struct WithdrawFull<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"basket", owner.key().as_ref(), &basket.basket_id.to_le_bytes()],
        bump = basket.bump,
        has_one = owner,
        constraint = basket.phase == Phase::Idle || basket.phase == Phase::Exiting
            @ BasketError::BasketBusy
    )]
    pub basket: Box<Account<'info, BasketState>>,
    #[account(
        mint::token_program = token_program
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = basket,
        associated_token::token_program = token_program
    )]
    pub custody: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program
    )]
    pub owner_destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_withdraw_full(ctx: Context<WithdrawFull>) -> Result<()> {
    require!(
        ctx.accounts
            .basket
            .supports_custody_asset(ctx.accounts.mint.key(), ctx.accounts.token_program.key()),
        BasketError::UnsupportedAsset
    );
    let amount = ctx.accounts.custody.amount;

    let basket_id = ctx.accounts.basket.basket_id.to_le_bytes();
    let bump = [ctx.accounts.basket.bump];
    let signer_seeds: &[&[u8]] = &[
        b"basket",
        ctx.accounts.owner.key.as_ref(),
        &basket_id,
        &bump,
    ];

    if amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.custody.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.owner_destination.to_account_info(),
                    authority: ctx.accounts.basket.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    if !can_close_custody(&ctx.accounts.custody.to_account_info())? {
        return Ok(());
    }

    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.custody.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.basket.to_account_info(),
        },
        &[signer_seeds],
    ))
}
