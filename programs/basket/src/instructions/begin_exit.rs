use anchor_lang::prelude::*;

use crate::{
    errors::BasketError,
    state::{BasketState, LegPlan, Phase, MAX_LEGS},
};

#[derive(Accounts)]
pub struct BeginExit<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"basket", owner.key().as_ref(), &basket.basket_id.to_le_bytes()],
        bump = basket.bump,
        has_one = owner
    )]
    pub basket: Box<Account<'info, BasketState>>,
}

pub fn handle_begin_exit(ctx: Context<BeginExit>, expected_nonce: u64) -> Result<()> {
    let basket = &mut ctx.accounts.basket;
    require!(
        basket.operation_nonce == expected_nonce,
        BasketError::StaleOperationNonce
    );

    basket.operation_nonce = basket
        .operation_nonce
        .checked_add(1)
        .ok_or(BasketError::ArithmeticOverflow)?;
    basket.phase = Phase::Exiting;
    basket.leg_count = 0;
    basket.expires_at_slot = 0;
    basket.legs = [LegPlan::default(); MAX_LEGS];
    basket.completed_legs = [false; MAX_LEGS];
    Ok(())
}
