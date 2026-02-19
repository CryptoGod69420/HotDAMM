import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";

export function useEmbeddedWallet() {
  const { ready: privyReady } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find(
    (w) => w.walletClientType === "privy"
  );

  return {
    embeddedWallet,
    walletAddress: embeddedWallet?.address || null,
    ready: privyReady,
  };
}
