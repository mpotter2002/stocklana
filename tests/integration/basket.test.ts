import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  AnchorProvider,
  BN,
  Program,
  setProvider,
  web3,
} from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  createMint,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  ExtensionType,
  getMintLen,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  setAuthority,
} from "@solana/spl-token";

const { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } = web3;
const provider = AnchorProvider.env();
setProvider(provider);

const idl = JSON.parse(
  await readFile(new URL("../../target/idl/basket.json", import.meta.url), "utf8"),
);
const program = new Program(idl, provider);
const payer = (provider.wallet as typeof provider.wallet & { payer: web3.Keypair }).payer;
const owner = provider.wallet.publicKey;
const mockSwapProgram = new PublicKey("9Tk2Ss7nB1XGnGFttkJUtchexJXKVdVXHXQRcTim57rG");
const [mockAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("mint-authority")],
  mockSwapProgram,
);

function basketAddress(basketId: bigint, basketOwner = owner): PublicKey {
  const id = Buffer.alloc(8);
  id.writeBigUInt64LE(basketId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("basket"), basketOwner.toBuffer(), id],
    program.programId,
  )[0];
}

function custodyAddress(
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

async function expectTransactionFailure(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.equal(
      (error as { error?: { errorCode?: { code?: string } } }).error?.errorCode?.code,
      code,
      String(error),
    );
    return true;
  });
}

test("operation legs are recoverable, replay-safe, and superseded by exit", async () => {
  const attacker = Keypair.generate();
  const airdrop = await provider.connection.requestAirdrop(
    attacker.publicKey,
    2 * LAMPORTS_PER_SOL,
  );
  await provider.connection.confirmTransaction(airdrop, "confirmed");

  const fundingMint = await createMint(
    provider.connection,
    payer,
    owner,
    null,
    6,
  );
  const classicAssetMint = await createMint(
    provider.connection,
    payer,
    mockAuthority,
    null,
    6,
  );
  const token2022AssetMint = await createMint(
    provider.connection,
    payer,
    mockAuthority,
    null,
    6,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  const unsupportedMint = await createMint(
    provider.connection,
    payer,
    owner,
    null,
    6,
  );

  const fundingOwnerAta = await createAssociatedTokenAccount(
    provider.connection,
    payer,
    fundingMint,
    owner,
  );
  const unsupportedOwnerAta = await createAssociatedTokenAccount(
    provider.connection,
    payer,
    unsupportedMint,
    owner,
  );
  await mintTo(
    provider.connection,
    payer,
    fundingMint,
    fundingOwnerAta,
    owner,
    20_000_000n,
  );
  await mintTo(
    provider.connection,
    payer,
    unsupportedMint,
    unsupportedOwnerAta,
    owner,
    1_000_000n,
  );
  await setAuthority(
    provider.connection,
    payer,
    fundingMint,
    payer,
    AuthorityType.MintTokens,
    mockAuthority,
  );

  const basketId = randomBytes(8).readBigUInt64LE();
  const basket = basketAddress(basketId);
  await program.methods
    .createBasket(
      new BN(basketId.toString()),
      fundingMint,
      TOKEN_PROGRAM_ID,
      [classicAssetMint, token2022AssetMint],
      [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID],
      [5_000, 5_000],
    )
    .accountsStrict({
      owner,
      basket,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts([fundingMint, classicAssetMint, token2022AssetMint].map(
      (pubkey) => ({ pubkey, isSigner: false, isWritable: false }),
    ))
    .rpc();

  const fundingCustody = custodyAddress(fundingMint, basket, TOKEN_PROGRAM_ID);
  const classicCustody = custodyAddress(classicAssetMint, basket, TOKEN_PROGRAM_ID);
  const token2022Custody = custodyAddress(
    token2022AssetMint,
    basket,
    TOKEN_2022_PROGRAM_ID,
  );
  await program.methods
    .deposit(new BN(12_000_000))
    .accountsStrict({
      owner,
      basket,
      mint: fundingMint,
      ownerSource: fundingOwnerAta,
      custody: fundingCustody,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const unsupportedCustody = custodyAddress(
    unsupportedMint,
    basket,
    TOKEN_PROGRAM_ID,
  );
  await expectTransactionFailure(() =>
    program.methods
      .deposit(new BN(1))
      .accountsStrict({
        owner,
        basket,
        mint: unsupportedMint,
        ownerSource: unsupportedOwnerAta,
        custody: unsupportedCustody,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
    "UnsupportedAsset",
  );
  assert.equal(await provider.connection.getAccountInfo(unsupportedCustody), null);

  const expiresAtSlot = await provider.connection.getSlot() + 1_000;
  const legs = [
    {
      inputMint: fundingMint,
      inputTokenProgram: TOKEN_PROGRAM_ID,
      outputMint: classicAssetMint,
      outputTokenProgram: TOKEN_PROGRAM_ID,
      maxInput: new BN(4_000_000),
      minOutput: new BN(8_000_000),
    },
    {
      inputMint: fundingMint,
      inputTokenProgram: TOKEN_PROGRAM_ID,
      outputMint: token2022AssetMint,
      outputTokenProgram: TOKEN_2022_PROGRAM_ID,
      maxInput: new BN(5_000_000),
      minOutput: new BN(10_000_000),
    },
  ];
  await program.methods
    .startOperation(new BN(0), { buying: {} }, new BN(expiresAtSlot), legs)
    .accountsStrict({ owner, basket })
    .rpc();

  await expectTransactionFailure(() => program.methods
    .finishOperation(new BN(1)).accountsStrict({ owner, basket }).rpc(),
    "OperationIncomplete",
  );
  await expectTransactionFailure(() => program.methods
    .startOperation(new BN(1), { buying: {} }, new BN(expiresAtSlot), legs)
    .accountsStrict({ owner, basket }).rpc(),
    "BasketBusy",
  );
  const firstLegAccounts = {
    owner,
    basket,
    inputMint: fundingMint,
    outputMint: classicAssetMint,
    inputCustody: fundingCustody,
    outputCustody: classicCustody,
    mockAuthority,
    mockSwapProgram,
    inputTokenProgram: TOKEN_PROGRAM_ID,
    outputTokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
  await expectTransactionFailure(() => program.methods
    .executeMockLeg(new BN(1), 0, new BN(4_000_001), new BN(8_000_000))
    .accountsStrict(firstLegAccounts).rpc(),
    "InputBudgetExceeded",
  );
  await expectTransactionFailure(() => program.methods
    .executeMockLeg(new BN(1), 0, new BN(4_000_000), new BN(8_000_000))
    .accountsStrict({ ...firstLegAccounts, mockSwapProgram: TOKEN_PROGRAM_ID }).rpc(),
    "InvalidProgramId",
  );

  await program.methods
    .executeMockLeg(new BN(1), 0, new BN(4_000_000), new BN(8_000_000))
    .accountsStrict({
      owner,
      basket,
      inputMint: fundingMint,
      outputMint: classicAssetMint,
      inputCustody: fundingCustody,
      outputCustody: classicCustody,
      mockAuthority,
      mockSwapProgram,
      inputTokenProgram: TOKEN_PROGRAM_ID,
      outputTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  assert.equal(
    (await getAccount(provider.connection, fundingCustody)).amount,
    8_000_000n,
  );
  assert.equal(
    (await getAccount(provider.connection, classicCustody)).amount,
    8_000_000n,
  );

  await expectTransactionFailure(() =>
    program.methods
      .executeMockLeg(new BN(1), 1, new BN(5_000_000), new BN(9_999_999))
      .accountsStrict({
        owner,
        basket,
        inputMint: fundingMint,
        outputMint: token2022AssetMint,
        inputCustody: fundingCustody,
        outputCustody: token2022Custody,
        mockAuthority,
        mockSwapProgram,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
    "MinimumOutputNotMet",
  );
  assert.equal(
    (await getAccount(provider.connection, fundingCustody)).amount,
    8_000_000n,
  );
  assert.equal(await provider.connection.getAccountInfo(token2022Custody), null);
  const afterFailedLeg = await program.account.basketState.fetch(basket);
  assert.deepEqual(afterFailedLeg.completedLegs.slice(0, 2), [true, false]);

  await expectTransactionFailure(() =>
    program.methods
      .executeMockLeg(new BN(1), 0, new BN(4_000_000), new BN(8_000_000))
      .accountsStrict({
        owner,
        basket,
        inputMint: fundingMint,
        outputMint: classicAssetMint,
        inputCustody: fundingCustody,
        outputCustody: classicCustody,
        mockAuthority,
        mockSwapProgram,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
    "LegAlreadyCompleted",
  );

  await program.methods
    .executeMockLeg(new BN(1), 1, new BN(5_000_000), new BN(10_000_000))
    .accountsStrict({
      owner,
      basket,
      inputMint: fundingMint,
      outputMint: token2022AssetMint,
      inputCustody: fundingCustody,
      outputCustody: token2022Custody,
      mockAuthority,
      mockSwapProgram,
      inputTokenProgram: TOKEN_PROGRAM_ID,
      outputTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  assert.equal(
    (await getAccount(provider.connection, fundingCustody)).amount,
    3_000_000n,
  );
  assert.equal(
    (
      await getAccount(
        provider.connection,
        token2022Custody,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      )
    ).amount,
    10_000_000n,
  );

  await program.methods
    .finishOperation(new BN(1))
    .accountsStrict({ owner, basket })
    .rpc();
  const finished = await program.account.basketState.fetch(basket);
  assert.equal(finished.operationNonce.toNumber(), 1);
  assert.deepEqual(finished.phase, { idle: {} });
  assert.equal(finished.legCount, 0);

  await program.methods.startOperation(
    new BN(1), { selling: {} },
    new BN(await provider.connection.getSlot() + 1_000),
    [{
      inputMint: classicAssetMint,
      inputTokenProgram: TOKEN_PROGRAM_ID,
      outputMint: fundingMint,
      outputTokenProgram: TOKEN_PROGRAM_ID,
      maxInput: new BN(8_000_000),
      minOutput: new BN(4_000_000),
    }],
  ).accountsStrict({ owner, basket }).rpc();
  await program.methods
    .executeMockLeg(new BN(2), 0, new BN(8_000_000), new BN(4_000_000))
    .accountsStrict({
      ...firstLegAccounts,
      inputMint: classicAssetMint,
      outputMint: fundingMint,
      inputCustody: classicCustody,
      outputCustody: fundingCustody,
    }).rpc();
  await program.methods.finishOperation(new BN(2))
    .accountsStrict({ owner, basket }).rpc();
  assert.equal((await getAccount(provider.connection, classicCustody)).amount, 0n);
  assert.equal((await getAccount(provider.connection, fundingCustody)).amount, 7_000_000n);

  const secondExpiration = await provider.connection.getSlot() + 1_000;
  await program.methods
    .startOperation(
      new BN(2),
      { buying: {} },
      new BN(secondExpiration),
      [legs[0]],
    )
    .accountsStrict({ owner, basket })
    .rpc();
  await program.methods
    .beginExit(new BN(3))
    .accountsStrict({ owner, basket })
    .rpc();

  await expectTransactionFailure(() =>
    program.methods
      .executeMockLeg(new BN(3), 0, new BN(1_000_000), new BN(8_000_000))
      .accountsStrict({
        owner,
        basket,
        inputMint: fundingMint,
        outputMint: classicAssetMint,
        inputCustody: fundingCustody,
        outputCustody: classicCustody,
        mockAuthority,
        mockSwapProgram,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
    "StaleOperationNonce",
  );

  const attackerClassicDestination = await createAssociatedTokenAccount(
    provider.connection,
    payer,
    classicAssetMint,
    attacker.publicKey,
  );
  await expectTransactionFailure(() => program.methods
    .withdrawFull()
    .accountsStrict({
      owner: attacker.publicKey,
      basket,
      mint: classicAssetMint,
      custody: classicCustody,
      ownerDestination: attackerClassicDestination,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([attacker])
    .rpc(),
    "ConstraintSeeds",
  );

  await expectTransactionFailure(() => program.methods
    .withdrawFull()
    .accountsStrict({
      owner,
      basket,
      mint: classicAssetMint,
      custody: classicCustody,
      ownerDestination: attackerClassicDestination,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
    "ConstraintTokenOwner",
  );

  const classicOwnerAta = getAssociatedTokenAddressSync(classicAssetMint, owner);
  const token2022OwnerAta = getAssociatedTokenAddressSync(
    token2022AssetMint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const withdrawals = [
    {
      mint: fundingMint,
      custody: fundingCustody,
      destination: fundingOwnerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      expected: 7_000_000n,
    },
    {
      mint: classicAssetMint,
      custody: classicCustody,
      destination: classicOwnerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      expected: 0n,
    },
    {
      mint: token2022AssetMint,
      custody: token2022Custody,
      destination: token2022OwnerAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      expected: 10_000_000n,
    },
  ];

  for (const withdrawal of withdrawals) {
    const destinationBefore = await provider.connection.getAccountInfo(
      withdrawal.destination,
    );
    const amountBefore = destinationBefore
      ? (
          await getAccount(
            provider.connection,
            withdrawal.destination,
            undefined,
            withdrawal.tokenProgram,
          )
        ).amount
      : 0n;
    await program.methods
      .withdrawFull()
      .accountsStrict({
        owner,
        basket,
        mint: withdrawal.mint,
        custody: withdrawal.custody,
        ownerDestination: withdrawal.destination,
        tokenProgram: withdrawal.tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const amountAfter = (
      await getAccount(
        provider.connection,
        withdrawal.destination,
        undefined,
        withdrawal.tokenProgram,
      )
    ).amount;
    assert.equal(amountAfter - amountBefore, withdrawal.expected);
    assert.equal(
      await provider.connection.getAccountInfo(withdrawal.custody),
      null,
    );
  }

  // A fully spent or externally created zero-balance ATA still needs rent recovery.
  await provider.sendAndConfirm(new web3.Transaction().add(
    createAssociatedTokenAccountInstruction(owner, fundingCustody, basket, fundingMint),
  ));
  await program.methods.withdrawFull().accountsStrict({
    owner,
    basket,
    mint: fundingMint,
    custody: fundingCustody,
    ownerDestination: fundingOwnerAta,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).rpc();
  assert.equal(await provider.connection.getAccountInfo(fundingCustody), null);
});

test("creation rejects unverified mint identities and Token-2022 extensions", async () => {
  const fundingMint = await createMint(provider.connection, payer, owner, null, 6);
  const assetMint = await createMint(provider.connection, payer, owner, null, 6);
  const feeMint = Keypair.generate();
  const space = getMintLen([ExtensionType.TransferFeeConfig]);
  await provider.sendAndConfirm(new web3.Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: feeMint.publicKey,
      space,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(space),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      feeMint.publicKey, owner, owner, 100, 1_000_000n,
    ),
    createInitializeMintInstruction(
      feeMint.publicKey, 6, owner, null, TOKEN_2022_PROGRAM_ID,
    ),
  ), [feeMint]);
  const id = randomBytes(8).readBigUInt64LE();
  const basket = basketAddress(id);
  const create = (remaining: web3.PublicKey[], feeProgram = TOKEN_2022_PROGRAM_ID) =>
    program.methods.createBasket(
      new BN(id.toString()), fundingMint, TOKEN_PROGRAM_ID,
      [assetMint, feeMint.publicKey], [TOKEN_PROGRAM_ID, feeProgram], [5_000, 5_000],
    ).accountsStrict({ owner, basket, systemProgram: SystemProgram.programId })
      .remainingAccounts(remaining.map(
        (pubkey) => ({ pubkey, isSigner: false, isWritable: false }),
      )).rpc();
  await expectTransactionFailure(() => create([]), "MissingMintAccounts");
  await expectTransactionFailure(
    () => create([assetMint, fundingMint, feeMint.publicKey]), "InvalidMintAccount",
  );
  await expectTransactionFailure(
    () => create([fundingMint, assetMint, feeMint.publicKey], TOKEN_PROGRAM_ID),
    "InvalidMintAccount",
  );
  await expectTransactionFailure(
    () => create([fundingMint, assetMint, feeMint.publicKey]), "UnsupportedMintExtension",
  );
  assert.equal(await provider.connection.getAccountInfo(basket), null);
});
