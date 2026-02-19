import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export interface TokenMintInfo {
  decimals: number;
  tokenProgram: PublicKey;
  isToken2022: boolean;
}

export async function getTokenMintInfo(
  connection: Connection,
  mintAddress: PublicKey
): Promise<TokenMintInfo> {
  const accountInfo = await connection.getAccountInfo(mintAddress);
  if (!accountInfo) {
    throw new Error(`Mint account not found: ${mintAddress.toBase58()}`);
  }

  const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
  const tokenProgram = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const decimals = accountInfo.data[44];

  return { decimals, tokenProgram, isToken2022 };
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

export function formatNumber(num: number, decimals = 4): string {
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function getSolscanUrl(signature: string, cluster: string = "mainnet-beta"): string {
  const base = "https://solscan.io/tx/";
  return cluster === "mainnet-beta"
    ? `${base}${signature}`
    : `${base}${signature}?cluster=${cluster}`;
}

export function getSolscanAccountUrl(address: string, cluster: string = "mainnet-beta"): string {
  const base = "https://solscan.io/account/";
  return cluster === "mainnet-beta"
    ? `${base}${address}`
    : `${base}${address}?cluster=${cluster}`;
}
