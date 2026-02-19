import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useConnection } from "@/hooks/useConnection";
import { useState, useEffect } from "react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./ThemeToggle";
import { OpenPositionForm } from "./OpenPositionForm";
import {
  shortenAddress,
  formatNumber,
  getSolscanAccountUrl,
} from "@/utils/tokenUtils";
import {
  Droplets,
  LogOut,
  Plus,
  Copy,
  ExternalLink,
  Wallet,
  RefreshCw,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type View = "dashboard" | "open-position";

export function Dashboard() {
  const { logout, user } = usePrivy();
  const { wallets } = useWallets();
  const connection = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [copied, setCopied] = useState(false);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);
  const [walletTimeout, setWalletTimeout] = useState(false);
  const { toast } = useToast();

  const activeWallet = wallets.find((w) => w.address) || null;
  const walletAddress = activeWallet?.address;

  const fetchBalance = async () => {
    if (!walletAddress) return;
    setLoadingBalance(true);
    try {
      const bal = await connection.getBalance(new PublicKey(walletAddress));
      setBalance(bal / LAMPORTS_PER_SOL);
    } catch (e) {
      console.error("Failed to fetch balance:", e);
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      fetchBalance();
      setWalletTimeout(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      const timer = setTimeout(() => setWalletTimeout(true), 10000);
      return () => clearTimeout(timer);
    }
  }, [walletAddress]);

  const copyAddress = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cluster = "mainnet-beta";

  if (view === "open-position") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="flex items-center justify-between gap-2 p-4 border-b sticky top-0 z-50 bg-background">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView("dashboard")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Droplets className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Open Position</span>
          </div>
          <div className="flex items-center gap-1">
            {walletAddress && (
              <Badge variant="secondary" className="text-xs font-mono">
                {shortenAddress(walletAddress)}
              </Badge>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto p-4">
            <OpenPositionForm
              onSuccess={(signature) => {
                setLastTxSignature(signature);
                setView("dashboard");
                fetchBalance();
                toast({
                  title: "Position Opened",
                  description: "Your liquidity position was created successfully.",
                });
              }}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between gap-2 p-4 border-b sticky top-0 z-50 bg-background">
        <div className="flex items-center gap-2">
          <Droplets className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">Meteora Position Opener</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                Connected Wallet
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Mainnet
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {!walletAddress ? (
                walletTimeout ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-muted-foreground text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>No wallet detected. Make sure your wallet extension is connected and try refreshing the page.</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.reload()}
                      data-testid="button-refresh-page"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting wallet...
                  </div>
                )
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code
                      className="text-xs font-mono bg-muted px-2 py-1 rounded-md break-all"
                      data-testid="text-wallet-address"
                    >
                      {walletAddress}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={copyAddress}
                      data-testid="button-copy-address"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <a
                      href={getSolscanAccountUrl(walletAddress, cluster)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon" data-testid="button-solscan-wallet">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-xs text-muted-foreground">SOL Balance</p>
                      <p
                        className="text-lg font-semibold tabular-nums"
                        data-testid="text-sol-balance"
                      >
                        {loadingBalance ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : balance !== null ? (
                          `${formatNumber(balance)} SOL`
                        ) : (
                          "---"
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={fetchBalance}
                      disabled={loadingBalance}
                      data-testid="button-refresh-balance"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${loadingBalance ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>

                  {user?.email && (
                    <p className="text-xs text-muted-foreground">
                      Logged in as {user.email.address}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {lastTxSignature && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium">Position Created Successfully</p>
                    <a
                      href={`https://solscan.io/tx/${lastTxSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                      data-testid="link-last-tx"
                    >
                      {shortenAddress(lastTxSignature, 8)}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={() => setView("open-position")}
            disabled={!walletAddress}
            data-testid="button-open-position"
          >
            <Plus className="w-4 h-4 mr-2" />
            Open New Position
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>
                  Fund your wallet with SOL (for gas) and the tokens you
                  want to provide as liquidity.
                </li>
                <li>
                  Click "Open New Position" and configure your pool parameters.
                </li>
                <li>
                  The app creates a custom Meteora DAMMv2 pool and opens your
                  initial position in a single transaction.
                </li>
                <li>View your transaction on Solscan to confirm.</li>
              </ol>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
