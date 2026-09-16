import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  type Commitment,
  type Connection,
} from "@solana/web3.js";

export {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
};

const CONFIRMED: Commitment = "confirmed";

export class TokenAccounts {
  static isSupportedTokenProgram(programId: PublicKey): boolean {
    return programId.equals(TOKEN_PROGRAM_ID)
      || programId.equals(TOKEN_2022_PROGRAM_ID);
  }

  static ownerAddress(
    mint: PublicKey,
    owner: PublicKey,
    tokenProgram: PublicKey,
  ): PublicKey {
    return getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }

  static custodyAddress(
    mint: PublicKey,
    basket: PublicKey,
    tokenProgram: PublicKey,
  ): PublicKey {
    return getAssociatedTokenAddressSync(
      mint,
      basket,
      true,
      tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }

  static async read(
    connection: Connection,
    address: PublicKey,
    tokenProgram: PublicKey,
  ): Promise<{ exists: boolean; amount: bigint }> {
    try {
      const account = await getAccount(
        connection,
        address,
        CONFIRMED,
        tokenProgram,
      );
      return { exists: true, amount: account.amount };
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        return { exists: false, amount: 0n };
      }
      throw error;
    }
  }

  static async amount(
    connection: Connection,
    address: PublicKey,
    tokenProgram: PublicKey,
  ): Promise<bigint> {
    return (await TokenAccounts.read(connection, address, tokenProgram)).amount;
  }

  static async mintTokenProgram(
    connection: Connection,
    mint: PublicKey,
  ): Promise<PublicKey> {
    const account = await connection.getAccountInfo(mint, CONFIRMED);
    if (!account) {
      throw new Error("Mint account was not found on the local validator");
    }
    if (!TokenAccounts.isSupportedTokenProgram(account.owner)) {
      throw new Error("Mint is not owned by SPL Token or Token-2022");
    }
    return account.owner;
  }
}
