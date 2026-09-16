use anchor_lang::prelude::*;

use crate::{
    errors::BasketError,
    state::{BasketState, LegPlan, Phase, MAX_LEGS},
};

#[derive(Accounts)]
pub struct FinishOperation<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"basket", owner.key().as_ref(), &basket.basket_id.to_le_bytes()],
        bump = basket.bump,
        has_one = owner
    )]
    pub basket: Box<Account<'info, BasketState>>,
}

pub fn handle_finish_operation(ctx: Context<FinishOperation>, nonce: u64) -> Result<()> {
    let basket = &mut ctx.accounts.basket;
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
        basket.completed_legs[..usize::from(basket.leg_count)]
            .iter()
            .all(|complete| *complete),
        BasketError::OperationIncomplete
    );

    basket.phase = Phase::Idle;
    basket.leg_count = 0;
    basket.expires_at_slot = 0;
    basket.legs = [LegPlan::default(); MAX_LEGS];
    basket.completed_legs = [false; MAX_LEGS];
    Ok(())
}
