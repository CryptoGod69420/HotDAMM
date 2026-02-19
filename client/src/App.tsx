import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginScreen } from "@/components/LoginScreen";
import { Dashboard } from "@/components/Dashboard";
import { Loader2, Droplets } from "lucide-react";

const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ||
  import.meta.env.VITE_GATEKEEPER_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const solanaRpc = createSolanaRpc(SOLANA_RPC_URL);
const solanaRpcSubscriptions = createSolanaRpcSubscriptions(
  SOLANA_RPC_URL.replace("https://", "wss://").replace("http://", "ws://")
);

let solanaConnectors: ReturnType<typeof toSolanaWalletConnectors> | undefined;
try {
  solanaConnectors = toSolanaWalletConnectors();
} catch (e) {
  console.warn("Failed to initialize Solana wallet connectors:", e);
}

function AppContent() {
  const { ready, authenticated } = usePrivy();

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Droplets className="w-8 h-8 text-primary animate-pulse" />
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen />;
  }

  return <Dashboard />;
}

function App() {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;

  if (!appId || appId === "placeholder_will_be_provided") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <Droplets className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-xl font-bold">Setup Required</h1>
          <p className="text-sm text-muted-foreground">
            Add your Privy App ID to the environment variable{" "}
            <code className="bg-muted px-1 py-0.5 rounded-md text-xs font-mono">
              VITE_PRIVY_APP_ID
            </code>{" "}
            to get started.
          </p>
          <ol className="text-sm text-muted-foreground text-left space-y-2 list-decimal list-inside">
            <li>
              Go to{" "}
              <a
                href="https://dashboard.privy.io"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                dashboard.privy.io
              </a>{" "}
              and create an app
            </li>
            <li>Copy your App ID</li>
            <li>
              Add it as{" "}
              <code className="bg-muted px-1 py-0.5 rounded-md text-xs font-mono">
                VITE_PRIVY_APP_ID
              </code>{" "}
              in Secrets
            </li>
            <li>Add your Replit domain to Privy's allowed domains</li>
            <li>Restart the app</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "twitter", "discord", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#676FFF",
          walletChainType: "solana-only",
        },
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: solanaRpc as any,
              rpcSubscriptions: solanaRpcSubscriptions as any,
            },
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
          showWalletUIs: false,
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

export default App;
