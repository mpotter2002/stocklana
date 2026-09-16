#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, BurnChecked, Mint, MintToChecked, TokenAccount, TokenInterface,
};

declare_id!("9Tk2Ss7nB1XGnGFttkJUtchexJXKVdVXHXQRcTim57rG");

#[program]
pub mod mock_swap {
    use super::*;

    pub fn swap_exact_in(
        ctx: Context<SwapExactIn>,
        input_amount: u64,
        output_amount: u64,
    ) -> Result<()> {
        require!(
            input_amount > 0 && output_amount > 0,
            MockSwapError::ZeroAmount
        );

        token_interface::burn_checked(
            CpiContext::new(
                ctx.accounts.input_token_program.to_account_info(),
                BurnChecked {
                    mint: ctx.accounts.input_mint.to_account_info(),
                    from: ctx.accounts.input_source.to_account_info(),
                    authority: ctx.accounts.input_authority.to_account_info(),
                },
            ),
            input_amount,
            ctx.accounts.input_mint.decimals,
        )?;

        let bump = [ctx.bumps.mock_authority];
        let signer_seeds: &[&[u8]] = &[b"mint-authority", &bump];
        token_interface::mint_to_checked(
            CpiContext::new_with_signer(
                ctx.accounts.output_token_program.to_account_info(),
                MintToChecked {
                    mint: ctx.accounts.output_mint.to_account_info(),
                    to: ctx.accounts.output_destination.to_account_info(),
                    authority: ctx.accounts.mock_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            output_amount,
            ctx.accounts.output_mint.decimals,
        )
    }
}

#[derive(Accounts)]
pub struct SwapExactIn<'info> {
    pub input_authority: Signer<'info>,
    #[account(mut, mint::token_program = input_token_program)]
    pub input_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = input_mint,
        token::authority = input_authority,
        token::token_program = input_token_program
    )]
    pub input_source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        mint::authority = mock_authority,
        mint::token_program = output_token_program
    )]
    pub output_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = output_mint,
        token::token_program = output_token_program
    )]
    pub output_destination: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: The PDA seeds constrain this mint authority.
    #[account(seeds = [b"mint-authority"], bump)]
    pub mock_authority: UncheckedAccount<'info>,
    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum MockSwapError {
    #[msg("Input and output amounts must be greater than zero")]
    ZeroAmount,
}
