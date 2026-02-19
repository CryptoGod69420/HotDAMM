import { useMemo } from "react";
import { Connection } from "@solana/web3.js";

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

let sharedConnection: Connection | null = null;

function getConnection(): Connection {
  if (!sharedConnection) {
    sharedConnection = new Connection(RPC_URL, "confirmed");
  }
  return sharedConnection;
}

export function useConnection() {
  const connection = useMemo(() => getConnection(), []);
  return connection;
}
