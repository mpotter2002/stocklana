use anchor_lang::prelude::*;
use anchor_spl::{
    token,
    token_2022::{self, spl_token_2022},
};
use spl_token_2022::{
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    state::{Account as TokenAccount, Mint},
};

use crate::errors::BasketError;

/// Admit only initialized, extension-free fixtures until extensions are reviewed.
pub fn validate_mint(account: &AccountInfo, mint: Pubkey, program: Pubkey) -> Result<()> {
    require_keys_eq!(account.key(), mint, BasketError::InvalidMintAccount);
    require_keys_eq!(*account.owner, program, BasketError::InvalidMintAccount);
    require!(
        program == token::ID || program == token_2022::ID,
        BasketError::UnsupportedTokenProgram
    );
    let data = account.try_borrow_data()?;
    let mint = StateWithExtensions::<Mint>::unpack(&data)?;
    require!(
        mint.get_extension_types()?.is_empty(),
        BasketError::UnsupportedMintExtension
    );
    Ok(())
}

/// Unreviewed account extensions must not make rent cleanup block recovery.
pub fn can_close_custody(account: &AccountInfo) -> Result<bool> {
    let data = account.try_borrow_data()?;
    let token = StateWithExtensions::<TokenAccount>::unpack(&data)?;
    Ok(token
        .get_extension_types()?
        .iter()
        .all(|extension| *extension == ExtensionType::ImmutableOwner))
}

#[cfg(test)]
mod tests {
    use super::*;
    use spl_token_2022::{
        extension::{
            immutable_owner::ImmutableOwner, transfer_fee::TransferFeeAmount,
            BaseStateWithExtensionsMut, StateWithExtensionsMut,
        },
        state::AccountState,
    };

    #[test]
    fn rent_cleanup_accepts_plain_accounts_and_immutable_owner_only() {
        for (extensions, expected) in [
            (vec![], true),
            (vec![ExtensionType::ImmutableOwner], true),
            (vec![ExtensionType::TransferFeeAmount], false),
        ] {
            let size =
                ExtensionType::try_calculate_account_len::<TokenAccount>(&extensions).unwrap();
            let mut data = vec![0; size];
            let mut state =
                StateWithExtensionsMut::<TokenAccount>::unpack_uninitialized(&mut data).unwrap();
            for extension in extensions {
                match extension {
                    ExtensionType::ImmutableOwner => {
                        state.init_extension::<ImmutableOwner>(true).unwrap();
                    }
                    ExtensionType::TransferFeeAmount => {
                        state
                            .init_extension::<TransferFeeAmount>(true)
                            .unwrap()
                            .withheld_amount = 1u64.into();
                    }
                    _ => unreachable!(),
                }
            }
            state.base.state = AccountState::Initialized;
            state.pack_base();
            state.init_account_type().unwrap();
            let key = Pubkey::new_unique();
            let mut lamports = 1;
            let account = AccountInfo::new(
                &key,
                false,
                true,
                &mut lamports,
                &mut data,
                &token_2022::ID,
                false,
                0,
            );
            assert_eq!(can_close_custody(&account).unwrap(), expected);
        }
    }
}
