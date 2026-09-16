use anchor_lang::prelude::*;

use crate::{
    errors::BasketError,
    state::{BasketState, LegPlan, Phase, MAX_LEGS},
};

#[derive(Accounts)]
pub struct StartOperation<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"basket", owner.key().as_ref(), &basket.basket_id.to_le_bytes()],
        bump = basket.bump,
        has_one = owner,
        constraint = basket.phase == Phase::Idle @ BasketError::BasketBusy
    )]
    pub basket: Box<Account<'info, BasketState>>,
}

pub fn handle_start_operation(
    ctx: Context<StartOperation>,
    expected_nonce: u64,
    phase: Phase,
    expires_at_slot: u64,
    legs: Vec<LegPlan>,
) -> Result<()> {
    let basket = &mut ctx.accounts.basket;
    require!(
        basket.operation_nonce == expected_nonce,
        BasketError::StaleOperationNonce
    );
    require!(
        matches!(phase, Phase::Buying | Phase::Selling | Phase::Rebalancing),
        BasketError::InvalidOperationPhase
    );
    require!(
        !legs.is_empty() && legs.len() <= MAX_LEGS,
        BasketError::InvalidLegCount
    );
    require!(
        expires_at_slot > Clock::get()?.slot,
        BasketError::InvalidExpiration
    );

    for (index, leg) in legs.iter().enumerate() {
        require!(
            leg.max_input > 0 && leg.min_output > 0,
            BasketError::InvalidLegAmounts
        );
        require!(leg.input_mint != leg.output_mint, BasketError::InvalidLeg);
        require!(
            legs.iter().skip(index + 1).all(|other| {
                leg.input_mint != other.input_mint
                    || leg.output_mint != other.output_mint
                    || leg.input_token_program != other.input_token_program
                    || leg.output_token_program != other.output_token_program
            }),
            BasketError::InvalidLeg
        );

        let input_is_funding = basket.funding_mint == leg.input_mint
            && basket.funding_token_program == leg.input_token_program;
        let output_is_funding = basket.funding_mint == leg.output_mint
            && basket.funding_token_program == leg.output_token_program;
        let input_is_asset = basket
            .asset_index(leg.input_mint, leg.input_token_program)
            .is_some();
        let output_is_asset = basket
            .asset_index(leg.output_mint, leg.output_token_program)
            .is_some();

        let valid_for_phase = match phase {
            Phase::Buying => input_is_funding && output_is_asset,
            Phase::Selling => input_is_asset && output_is_funding,
            Phase::Rebalancing => input_is_asset && output_is_asset,
            Phase::Idle | Phase::Exiting => false,
        };
        require!(valid_for_phase, BasketError::InvalidLeg);
    }

    basket.operation_nonce = basket
        .operation_nonce
        .checked_add(1)
        .ok_or(BasketError::ArithmeticOverflow)?;
    basket.phase = phase;
    basket.leg_count = legs.len() as u8;
    basket.expires_at_slot = expires_at_slot;
    basket.legs = [LegPlan::default(); MAX_LEGS];
    basket.legs[..legs.len()].copy_from_slice(&legs);
    basket.completed_legs = [false; MAX_LEGS];

    Ok(())
}
