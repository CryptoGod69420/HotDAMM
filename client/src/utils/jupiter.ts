import { Connection, VersionedTransaction, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";

const JUPITER_API = "https://quote-api.jup.ag/v6";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

export interface SwapResult {
  signature: string;
  inputAmount: string;
  outputAmount: string;
}

export async function getJupiterQuote(
  outputMint: string,
  solAmount: number,
  slippageBps: number = 100
): Promise<JupiterQuote> {
  const lamports = new BN(
    new Decimal(solAmount).mul(new Decimal(1e9)).floor().toFixed(0)
  );

  const params = new URLSearchParams({
    inputMint: WSOL_MINT,
    outputMint,
    amount: lamports.toString(),
    slippageBps: slippageBps.toString(),
    swapMode: "ExactIn",
  });

  const res = await fetch(`${JUPITER_API}/quote?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter quote failed: ${text}`);
  }

  return res.json();
}

export async function getJupiterSwapTransaction(
  quoteResponse: JupiterQuote,
  userPublicKey: string
): Promise<Uint8Array> {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 5000000,
          priorityLevel: "high",
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter swap transaction failed: ${text}`);
  }

  const { swapTransaction } = await res.json();
  return Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
}

export async function executeJupiterSwap(
  connection: Connection,
  wallet: any,
  outputMint: string,
  solAmount: number,
  slippageBps: number = 100
): Promise<SwapResult> {
  const quote = await getJupiterQuote(outputMint, solAmount, slippageBps);

  const swapTxBytes = await getJupiterSwapTransaction(
    quote,
    wallet.address
  );

  const result = await wallet.signAndSendTransaction({
    transaction: swapTxBytes,
    chain: { id: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" } as any,
    options: {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    } as any,
  });

  const signatureBytes = result.signature;
  const bs58Module = await import("bs58");
  const signature =
    typeof signatureBytes === "string"
      ? signatureBytes
      : bs58Module.default.encode(signatureBytes);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return {
    signature,
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
  };
}
