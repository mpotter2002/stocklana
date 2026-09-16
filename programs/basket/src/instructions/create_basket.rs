use anchor_lang::prelude::*;
use anchor_spl::{token, token_2022};

use crate::{
    errors::BasketError,
    mint_policy::validate_mint,
    state::{valid_weights, BasketState, Phase, MAX_ASSETS, MAX_LEGS},
};

#[derive(Accounts)]
#[instruction(basket_id: u64)]
pub struct CreateBasket<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + BasketState::INIT_SPACE,
        seeds = [b"basket", owner.key().as_ref(), &basket_id.to_le_bytes()],
        bump
    )]
    pub basket: Box<Account<'info, BasketState>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_basket(
    ctx: Context<CreateBasket>,
    basket_id: u64,
    funding_mint: Pubkey,
    funding_token_program: Pubkey,
    mints: Vec<Pubkey>,
    token_programs: Vec<Pubkey>,
    target_bps: Vec<u16>,
) -> Result<()> {
    require!(
        (2..=MAX_ASSETS).contains(&mints.len()),
        BasketError::InvalidAssetCount
    );
    require!(
        mints.len() == token_programs.len() && mints.len() == target_bps.len(),
        BasketError::RecipeLengthMismatch
    );
    require!(valid_weights(&target_bps), BasketError::InvalidWeights);
    require!(
        mints
            .iter()
            .enumerate()
            .all(|(index, mint)| { mints.iter().skip(index + 1).all(|other| other != mint) }),
        BasketError::DuplicateMint
    );
    require!(
        mints.iter().all(|mint| *mint != funding_mint),
        BasketError::FundingMintInAssets
    );
    require!(
        (funding_token_program == token::ID || funding_token_program == token_2022::ID)
            && token_programs
                .iter()
                .all(|program| *program == token::ID || *program == token_2022::ID),
        BasketError::UnsupportedTokenProgram
    );

    require!(
        ctx.remaining_accounts.len() == mints.len() + 1,
        BasketError::MissingMintAccounts
    );
    validate_mint(
        &ctx.remaining_accounts[0],
        funding_mint,
        funding_token_program,
    )?;
    for (index, mint) in mints.iter().enumerate() {
        validate_mint(
            &ctx.remaining_accounts[index + 1],
            *mint,
            token_programs[index],
        )?;
    }

    let basket = &mut ctx.accounts.basket;
    basket.owner = ctx.accounts.owner.key();
    basket.basket_id = basket_id;
    basket.bump = ctx.bumps.basket;
    basket.asset_count = mints.len() as u8;
    basket.funding_mint = funding_mint;
    basket.funding_token_program = funding_token_program;
    basket.mints = [Pubkey::default(); MAX_ASSETS];
    basket.token_programs = [Pubkey::default(); MAX_ASSETS];
    basket.target_bps = [0; MAX_ASSETS];
    basket.mints[..mints.len()].copy_from_slice(&mints);
    basket.token_programs[..token_programs.len()].copy_from_slice(&token_programs);
    basket.target_bps[..target_bps.len()].copy_from_slice(&target_bps);
    basket.operation_nonce = 0;
    basket.phase = Phase::Idle;
    basket.leg_count = 0;
    basket.expires_at_slot = 0;
    basket.legs = [Default::default(); MAX_LEGS];
    basket.completed_legs = [false; MAX_LEGS];

    Ok(())
}
