#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod jupiter;
pub mod mint_policy;
pub mod state;

pub use instructions::*;
use state::{LegPlan, Phase};

declare_id!("HmDhCxRvv5c9HdmwJnHvrPJmSGVoG6m1RwrgDKxTmCmk");

#[program]
pub mod basket {
    use super::*;

    pub fn create_basket(
        ctx: Context<CreateBasket>,
        basket_id: u64,
        funding_mint: Pubkey,
        funding_token_program: Pubkey,
        mints: Vec<Pubkey>,
        token_programs: Vec<Pubkey>,
        target_bps: Vec<u16>,
    ) -> Result<()> {
        handle_create_basket(
            ctx,
            basket_id,
            funding_mint,
            funding_token_program,
            mints,
            token_programs,
            target_bps,
        )
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        handle_deposit(ctx, amount)
    }

    pub fn withdraw_full(ctx: Context<WithdrawFull>) -> Result<()> {
        handle_withdraw_full(ctx)
    }

    pub fn start_operation(
        ctx: Context<StartOperation>,
        expected_nonce: u64,
        phase: Phase,
        expires_at_slot: u64,
        legs: Vec<LegPlan>,
    ) -> Result<()> {
        handle_start_operation(ctx, expected_nonce, phase, expires_at_slot, legs)
    }

    pub fn execute_jupiter_leg<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteJupiterLeg<'info>>,
        nonce: u64,
        leg_index: u8,
        input_amount: u64,
        data: Vec<u8>,
    ) -> Result<()> {
        handle_execute_jupiter_leg(ctx, nonce, leg_index, input_amount, data)
    }

    #[cfg(feature = "local-testing")]
    pub fn execute_mock_leg(
        ctx: Context<ExecuteMockLeg>,
        nonce: u64,
        leg_index: u8,
        input_amount: u64,
        mock_output_amount: u64,
    ) -> Result<()> {
        handle_execute_mock_leg(ctx, nonce, leg_index, input_amount, mock_output_amount)
    }

    pub fn finish_operation(ctx: Context<FinishOperation>, nonce: u64) -> Result<()> {
        handle_finish_operation(ctx, nonce)
    }

    pub fn begin_exit(ctx: Context<BeginExit>, expected_nonce: u64) -> Result<()> {
        handle_begin_exit(ctx, expected_nonce)
    }
}
