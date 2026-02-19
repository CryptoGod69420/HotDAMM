import { useMemo } from "react";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { useConnection } from "./useConnection";

export function useCpAmm() {
  const connection = useConnection();
  const cpAmm = useMemo(() => new CpAmm(connection), [connection]);
  return cpAmm;
}
