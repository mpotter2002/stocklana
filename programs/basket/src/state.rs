use anchor_lang::prelude::*;

pub const MAX_ASSETS: usize = 3;
pub const MAX_LEGS: usize = MAX_ASSETS * 2;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Phase {
    Idle,
    Buying,
    Selling,
    Rebalancing,
    Exiting,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, InitSpace)]
pub struct LegPlan {
    pub input_mint: Pubkey,
    pub input_token_program: Pubkey,
    pub output_mint: Pubkey,
    pub output_token_program: Pubkey,
    pub max_input: u64,
    pub min_output: u64,
}

#[account]
#[derive(InitSpace)]
pub struct BasketState {
    pub owner: Pubkey,
    pub basket_id: u64,
    pub bump: u8,
    pub asset_count: u8,
    pub funding_mint: Pubkey,
    pub funding_token_program: Pubkey,
    pub mints: [Pubkey; MAX_ASSETS],
    pub token_programs: [Pubkey; MAX_ASSETS],
    pub target_bps: [u16; MAX_ASSETS],
    pub operation_nonce: u64,
    pub phase: Phase,
    pub leg_count: u8,
    pub expires_at_slot: u64,
    pub legs: [LegPlan; MAX_LEGS],
    pub completed_legs: [bool; MAX_LEGS],
}

impl BasketState {
    pub fn asset_index(&self, mint: Pubkey, token_program: Pubkey) -> Option<usize> {
        (0..usize::from(self.asset_count)).find(|index| {
            self.mints[*index] == mint && self.token_programs[*index] == token_program
        })
    }

    pub fn supports_custody_asset(&self, mint: Pubkey, token_program: Pubkey) -> bool {
        (self.funding_mint == mint && self.funding_token_program == token_program)
            || self.asset_index(mint, token_program).is_some()
    }

    pub fn active_leg(&self, index: usize) -> Option<&LegPlan> {
        (index < usize::from(self.leg_count)).then(|| &self.legs[index])
    }
}

pub fn valid_weights(weights: &[u16]) -> bool {
    (2..=MAX_ASSETS).contains(&weights.len())
        && weights.iter().all(|weight| *weight > 0)
        && weights.iter().map(|weight| u32::from(*weight)).sum::<u32>() == 10_000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_recipe_weights() {
        assert!(valid_weights(&[5_000, 5_000]));
        assert!(valid_weights(&[3_334, 3_333, 3_333]));
        assert!(!valid_weights(&[10_000]));
        assert!(!valid_weights(&[0, 10_000]));
        assert!(!valid_weights(&[5_000, 4_999]));
        assert!(!valid_weights(&[u16::MAX, u16::MAX]));
    }

    #[test]
    fn matches_mint_and_token_program_as_one_asset_identity() {
        let mint = Pubkey::new_unique();
        let token_program = Pubkey::new_unique();
        let mut state = BasketState {
            owner: Pubkey::new_unique(),
            basket_id: 7,
            bump: 254,
            asset_count: 2,
            funding_mint: Pubkey::new_unique(),
            funding_token_program: Pubkey::new_unique(),
            mints: [Pubkey::default(); MAX_ASSETS],
            token_programs: [Pubkey::default(); MAX_ASSETS],
            target_bps: [0; MAX_ASSETS],
            operation_nonce: 0,
            phase: Phase::Idle,
            leg_count: 0,
            expires_at_slot: 0,
            legs: [LegPlan::default(); MAX_LEGS],
            completed_legs: [false; MAX_LEGS],
        };
        state.mints[0] = mint;
        state.token_programs[0] = token_program;

        assert_eq!(state.asset_index(mint, token_program), Some(0));
        assert_eq!(state.asset_index(mint, Pubkey::new_unique()), None);
        assert_eq!(state.asset_index(Pubkey::new_unique(), token_program), None);
    }
}
