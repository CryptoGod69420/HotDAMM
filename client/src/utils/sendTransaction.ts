import {
  Connection,
  Transaction,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

export async function signAndSendTransaction(
  wallet: any,
  connection: Connection,
  transaction: Transaction,
  chainId: string = "solana:mainnet"
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new PublicKey(wallet.address);

  const serializedTx = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const result = await wallet.signAndSendTransaction({
    transaction: serializedTx,
    chain: chainId as any,
    options: {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    } as any,
  });

  const signatureBytes = result.signature;
  const bs58Module = await import("bs58");
  const signature =
    typeof signatureBytes === "string"
      ? signatureBytes
      : bs58Module.default.encode(signatureBytes);

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return signature;
}

export async function signAndSendPoolCreation(
  signTransaction: (input: any) => Promise<any>,
  wallet: { address: string },
  connection: Connection,
  transaction: Transaction,
  positionNftMint: Keypair,
  chainId: string = "solana:mainnet"
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new PublicKey(wallet.address);

  transaction.partialSign(positionNftMint);

  const serializedTx = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const result = await signTransaction({
    transaction: serializedTx,
    address: wallet.address,
    chain: chainId,
  });

  let rawSignedTx: Uint8Array;
  if (result.signedTransaction instanceof Uint8Array) {
    rawSignedTx = result.signedTransaction;
  } else if (typeof result.signedTransaction === "object" && result.signedTransaction !== null) {
    rawSignedTx = new Uint8Array(Object.values(result.signedTransaction));
  } else {
    rawSignedTx = new Uint8Array(result.signedTransaction);
  }

  const txid = await connection.sendRawTransaction(rawSignedTx, {
    skipPreflight: true,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(
    { signature: txid, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return txid;
}
