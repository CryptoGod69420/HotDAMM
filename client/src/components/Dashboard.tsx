import { usePrivy, type WalletWithMetadata } from "@privy-io/react-auth";
import { useWallets, useExportWallet } from "@privy-io/react-auth/solana";
import { useConnection } from "@/hooks/useConnection";
import { useCpAmm } from "@/hooks/useCpAmm";
import { useState, useEffect } from "react";
import { LAMPORTS_PER_SOL, PublicKey, Keypair, ComputeBudgetProgram, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import BN from "bn.js";
import Decimal from "decimal.js";
import bs58 from "bs58";
import {
  getBaseFeeParams,
  getDynamicFeeParams,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
  BaseFeeMode,
  ActivationType,
} from "@meteora-ag/cp-amm-sdk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ThemeToggle } from "./ThemeToggle";
import { PoolSettings, loadSettings, FEE_SCHEDULE_START_BPS, FEE_SCHEDULE_DURATION_SECONDS, FEE_SCHEDULE_NUM_PERIODS } from "./PoolSettings";
import { Portfolio } from "./Portfolio";
import {
  shortenAddress,
  formatNumber,
  getSolscanAccountUrl,
  getTokenMintInfo,
} from "@/utils/tokenUtils";
import { executeJupiterSwap } from "@/utils/jupiter";
import hotDammLogo from "@assets/ChatGPT_Image_Feb_19,_2026,_03_43_00_PM_1771544839266.png";
import {
  LogOut,
  Copy,
  ExternalLink,
  Wallet,
  RefreshCw,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Settings,
  Search,
  User,
  KeyRound,
  Mail,
  Shield,
  ArrowDownToLine,
  Coins,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

type View = "dashboard" | "settings" | "portfolio";

interface TokenMetadata {
  name: string;
  symbol: string;
  logoUrl: string | null;
  marketCap: number | null;
  priceUsd: string | null;
}

interface TokenSearchResult {
  mint: string;
  decimals: number;
  tokenProgram: PublicKey;
  isToken2022: boolean;
  metadata: TokenMetadata | null;
}

type CreationStep = "idle" | "swapping" | "creating-pool" | "confirming" | "done";

export function Dashboard() {
  const { logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { exportWallet } = useExportWallet();
  const connection = useConnection();
  const cpAmm = useCpAmm();
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [copied, setCopied] = useState(false);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);
  const [walletTimeout, setWalletTimeout] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { toast } = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<TokenSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creationStep, setCreationStep] = useState<CreationStep>("idle");
  const [poolError, setPoolError] = useState<string | null>(null);

  const activeWallet = wallets.find((w) => w.address) || null;
  const walletAddress = activeWallet?.address;
  const isCreating = creationStep !== "idle" && creationStep !== "done";

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
    toast({ title: "Copied", description: "Wallet address copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  const cluster = "mainnet-beta";

  const fetchTokenMetadata = async (mintAddress: string): Promise<TokenMetadata | null> => {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
      if (!res.ok) return null;
      const data = await res.json();
      const pairs = data?.pairs;
      if (!pairs || pairs.length === 0) return null;
      const pair = pairs[0];
      return {
        name: pair.baseToken?.name || "Unknown",
        symbol: pair.baseToken?.symbol || "???",
        logoUrl: pair.info?.imageUrl || null,
        marketCap: pair.marketCap ?? pair.fdv ?? null,
        priceUsd: pair.priceUsd || null,
      };
    } catch {
      return null;
    }
  };

  const handleSearch = async () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return;

    setSearchLoading(true);
    setSearchResult(null);
    setSearchError(null);
    setPoolError(null);
    setCreationStep("idle");

    try {
      const mintPk = new PublicKey(trimmed);
      const [info, metadata] = await Promise.all([
        getTokenMintInfo(connection, mintPk),
        fetchTokenMetadata(trimmed),
      ]);
      setSearchResult({
        mint: trimmed,
        decimals: info.decimals,
        tokenProgram: info.tokenProgram,
        isToken2022: info.isToken2022,
        metadata,
      });
    } catch (e: any) {
      setSearchError(e?.message || "Invalid token address or token not found");
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length >= 32 && trimmed.length <= 44) {
      handleSearch();
    } else {
      setSearchResult(null);
      setSearchError(null);
    }
  }, [searchInput]);

  const handleOpenPosition = async () => {
    if (!activeWallet || !searchResult) return;

    setCreationStep("swapping");
    setPoolError(null);

    try {
      const settings = loadSettings();
      const walletPublicKey = new PublicKey(activeWallet.address);
      const solMint = new PublicKey(WSOL_MINT);
      const tokenMint = new PublicKey(searchResult.mint);
      const halfSol = settings.depositAmountSol / 2;

      const swapResult = await executeJupiterSwap(
        connection,
        activeWallet,
        searchResult.mint,
        halfSol,
        500
      );

      console.log("Jupiter swap complete:", swapResult.signature);

      setCreationStep("creating-pool");

      const ata = await getAssociatedTokenAddress(
        tokenMint,
        walletPublicKey,
        false,
        searchResult.tokenProgram
      );
      const tokenAccount = await getAccount(connection, ata, "confirmed", searchResult.tokenProgram);
      const tokenAmountBN = new BN(tokenAccount.amount.toString());

      console.log("Actual token balance after swap:", tokenAmountBN.toString());

      const solInfo = await getTokenMintInfo(connection, solMint);
      const solDecimals = solInfo.decimals;
      const solAmountBN = new BN(
        new Decimal(halfSol)
          .mul(new Decimal(10).pow(solDecimals))
          .floor()
          .toFixed(0)
      );

      const orderedMintA = tokenMint;
      const orderedMintB = solMint;
      const orderedAmountA = tokenAmountBN;
      const orderedAmountB = solAmountBN;
      const orderedProgramA = searchResult.tokenProgram;
      const orderedProgramB = solInfo.tokenProgram;
      const orderedDecimalsB = solDecimals;

      console.log("Mint ordering: Token=A, SOL=B (quote)",
        "| A:", orderedMintA.toBase58().slice(0, 8),
        "| B:", orderedMintB.toBase58().slice(0, 8));

      const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
        tokenAAmount: orderedAmountA,
        tokenBAmount: orderedAmountB,
        minSqrtPrice: MIN_SQRT_PRICE,
        maxSqrtPrice: MAX_SQRT_PRICE,
      });

      const activationTypeNum = parseInt(settings.activationType);
      const baseFeeModeNum = parseInt(settings.baseFeeMode) as BaseFeeMode;

      const baseFeeParams = getBaseFeeParams(
        {
          baseFeeMode: settings.enableFeeScheduler ? baseFeeModeNum : (0 as BaseFeeMode),
          feeTimeSchedulerParam: settings.enableFeeScheduler
            ? {
                startingFeeBps: FEE_SCHEDULE_START_BPS,
                endingFeeBps: settings.feeTierBps,
                numberOfPeriod: FEE_SCHEDULE_NUM_PERIODS,
                totalDuration: FEE_SCHEDULE_DURATION_SECONDS,
              }
            : {
                startingFeeBps: settings.feeTierBps,
                endingFeeBps: settings.feeTierBps,
                numberOfPeriod: 1,
                totalDuration: 1,
              },
        },
        orderedDecimalsB,
        activationTypeNum === 1
          ? ActivationType.Timestamp
          : ActivationType.Slot
      );

      const dynamicFeeParams = settings.enableDynamicFee
        ? getDynamicFeeParams(settings.dynamicFeeMaxBps)
        : null;

      const poolFees = {
        baseFee: baseFeeParams,
        padding: [],
        dynamicFee: dynamicFeeParams,
      };

      const positionNftMint = Keypair.generate();
      const collectFeeModeNum = parseInt(settings.collectFeeMode);

      const result = await cpAmm.createCustomPool({
        payer: walletPublicKey,
        creator: walletPublicKey,
        positionNft: positionNftMint.publicKey,
        tokenAMint: orderedMintA,
        tokenBMint: orderedMintB,
        tokenAAmount: orderedAmountA,
        tokenBAmount: orderedAmountB,
        sqrtMinPrice: MIN_SQRT_PRICE,
        sqrtMaxPrice: MAX_SQRT_PRICE,
        initSqrtPrice,
        liquidityDelta,
        poolFees,
        hasAlphaVault: false,
        collectFeeMode: collectFeeModeNum,
        activationPoint: settings.activateNow ? null : new BN(Date.now()),
        activationType: activationTypeNum,
        tokenAProgram: orderedProgramA,
        tokenBProgram: orderedProgramB,
      });
      const tx = result.tx;

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const feeTx = new Transaction();
      feeTx.recentBlockhash = blockhash;
      feeTx.feePayer = walletPublicKey;
      feeTx.add(
        SystemProgram.transfer({
          fromPubkey: walletPublicKey,
          toPubkey: new PublicKey("6RRSBbLcJAnA4FAjdMVnAYKwzF81Z9Dtd79xDut1hT6K"),
          lamports: 0.005 * LAMPORTS_PER_SOL,
        })
      );

      const feeSerializedTx = feeTx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const feeSignResult = await (activeWallet as any).signTransaction({
        transaction: feeSerializedTx,
        address: activeWallet.address,
        chain: "solana:mainnet",
      });

      let feeSignedTxBytes: Uint8Array;
      if (feeSignResult.signedTransaction instanceof Uint8Array) {
        feeSignedTxBytes = feeSignResult.signedTransaction;
      } else if (typeof feeSignResult.signedTransaction === "object" && feeSignResult.signedTransaction !== null) {
        feeSignedTxBytes = new Uint8Array(Object.values(feeSignResult.signedTransaction));
      } else {
        feeSignedTxBytes = new Uint8Array(feeSignResult.signedTransaction);
      }

      const feeTxid = await connection.sendRawTransaction(feeSignedTxBytes, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });
      console.log("Platform fee tx sent:", feeTxid);

      tx.recentBlockhash = blockhash;
      tx.feePayer = walletPublicKey;

      tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
      );

      const serializedTx = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const signResult = await (activeWallet as any).signTransaction({
        transaction: serializedTx,
        address: activeWallet.address,
        chain: "solana:mainnet",
      });

      let signedTxBytes: Uint8Array;
      if (signResult.signedTransaction instanceof Uint8Array) {
        signedTxBytes = signResult.signedTransaction;
      } else if (typeof signResult.signedTransaction === "object" && signResult.signedTransaction !== null) {
        signedTxBytes = new Uint8Array(Object.values(signResult.signedTransaction));
      } else {
        signedTxBytes = new Uint8Array(signResult.signedTransaction);
      }

      const signedTx = Transaction.from(signedTxBytes);
      signedTx.partialSign(positionNftMint);

      const txid = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });

      console.log("Pool creation tx sent:", txid);
      setCreationStep("confirming");

      await connection.confirmTransaction(
        { signature: txid, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setCreationStep("done");
      setLastTxSignature(txid);
      setSearchInput("");
      setSearchResult(null);
      fetchBalance();
      toast({
        title: "Position Opened",
        description: "Pool created and liquidity deposited successfully.",
      });
    } catch (e: any) {
      console.error("Pool creation failed:", e);
      let msg = e?.message || "Transaction failed";
      const fullMsg = msg + (e?.logs ? " " + e.logs.join(" ") : "");
      if (fullMsg.includes("already in use") || fullMsg.includes("0x0")) {
        msg = "Pool already exists for this token pair. Close the existing pool first before creating a new one.";
      } else if (e?.logs) {
        console.error("Transaction logs:", e.logs);
        const lastLog = e.logs[e.logs.length - 1];
        if (lastLog) msg += ` | ${lastLog}`;
      }
      setPoolError(msg);
      setCreationStep("idle");
      toast({
        title: "Transaction Failed",
        description: msg.slice(0, 200),
        variant: "destructive",
      });
    }
  };

  const stepLabel = (step: CreationStep) => {
    switch (step) {
      case "swapping":
        return "Swapping SOL into token via Jupiter...";
      case "creating-pool":
        return "Creating Meteora DAMMv2 pool...";
      case "confirming":
        return "Confirming transaction on-chain...";
      default:
        return "";
    }
  };

  const handleExportWallet = async () => {
    const exportAddr = embeddedWalletAddress || walletAddress;
    if (!exportAddr) return;
    try {
      await exportWallet({ address: exportAddr });
    } catch (e: any) {
      console.error("Export wallet failed:", e);
      toast({
        title: "Export Failed",
        description: e?.message || "Could not export wallet keys.",
        variant: "destructive",
      });
    }
  };

  const loginMethod = (() => {
    if (user?.email) return { type: "Email", value: user.email.address };
    if (user?.google) return { type: "Google", value: user.google.email };
    if (user?.twitter) return { type: "Twitter", value: `@${user.twitter.username}` };
    if (user?.discord) return { type: "Discord", value: user.discord.username };
    if (user?.wallet) return { type: "Wallet", value: shortenAddress(user.wallet.address) };
    return { type: "Unknown", value: "" };
  })();

  const userInitial = (() => {
    if (user?.email) return user.email.address.charAt(0).toUpperCase();
    if (user?.google) return user.google.email.charAt(0).toUpperCase();
    if (user?.twitter) return user.twitter.username?.charAt(0).toUpperCase() || "T";
    if (user?.discord) return user.discord.username?.charAt(0).toUpperCase() || "D";
    return "U";
  })();

  const solanaEmbeddedWallet = user?.linkedAccounts?.find(
    (account): account is WalletWithMetadata =>
      account.type === "wallet" &&
      (account as WalletWithMetadata).walletClientType === "privy" &&
      (account as WalletWithMetadata).chainType === "solana"
  ) as WalletWithMetadata | undefined;
  const embeddedWalletAddress = solanaEmbeddedWallet?.address || null;
  const isEmbeddedWallet = !!embeddedWalletAddress;

  if (view === "portfolio") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="flex items-center justify-between gap-2 p-4 border-b sticky top-0 z-50 bg-background">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView("dashboard")}
              data-testid="button-back-portfolio"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <BarChart3 className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Portfolio</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto p-4">
            {walletAddress && <Portfolio walletAddress={walletAddress} />}
          </div>
        </main>

        <footer className="p-4 text-center text-xs text-muted-foreground">
          made with ❤️ by krispy.
        </footer>
      </div>
    );
  }

  if (view === "settings") {
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
            <Settings className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Pool Settings</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto p-4">
            <PoolSettings onSaved={() => setView("dashboard")} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between gap-2 p-4 border-b sticky top-0 z-50 bg-background">
        <div className="flex items-center gap-2">
          <img src={hotDammLogo} alt="Hot DAMM!" className="w-10 h-10" />
        </div>

        <div
          className="flex items-center gap-0 rounded-full border bg-card"
          data-testid="header-pill-group"
        >
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium tabular-nums hover-elevate rounded-l-full"
            onClick={fetchBalance}
            disabled={loadingBalance}
            data-testid="button-pill-balance"
          >
            {loadingBalance ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            ) : (
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span>
              {balance !== null ? `${formatNumber(balance)} SOL` : "---"}
            </span>
          </button>

          <Separator orientation="vertical" className="h-5" />

          <button
            className="flex items-center justify-center p-1 pr-1.5 hover-elevate rounded-r-full"
            onClick={() => setProfileOpen(true)}
            data-testid="button-pill-profile"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs font-medium bg-primary/15 text-primary">
                {userInitial}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
      </header>

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Profile</SheetTitle>
            <SheetDescription>Account and wallet details</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-auto space-y-5 mt-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="text-base font-semibold bg-primary/15 text-primary">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium truncate" data-testid="text-profile-login-value">
                  {loginMethod.value}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {loginMethod.type === "Email" || loginMethod.type === "Google" ? (
                    <Mail className="w-3 h-3" />
                  ) : (
                    <Shield className="w-3 h-3" />
                  )}
                  <span data-testid="text-profile-login-method">
                    Signed in via {loginMethod.type}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Wallet
              </p>

              {!walletAddress ? (
                walletTimeout ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-muted-foreground text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>No wallet detected. Try refreshing.</p>
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
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Address</p>
                    <div className="flex items-center gap-1.5">
                      <code
                        className="text-xs font-mono bg-muted px-2 py-1 rounded-md truncate flex-1"
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
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold tabular-nums" data-testid="text-sol-balance">
                        {loadingBalance ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : balance !== null ? (
                          `${formatNumber(balance)} SOL`
                        ) : (
                          "---"
                        )}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchBalance}
                        disabled={loadingBalance}
                        data-testid="button-refresh-balance"
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingBalance ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Network</p>
                    <Badge variant="outline" className="text-xs">Mainnet</Badge>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Wallet Type</p>
                    <Badge variant="secondary" className="text-xs">
                      {isEmbeddedWallet ? "Privy Embedded" : "External Wallet"}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {isEmbeddedWallet && walletAddress && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Security
                  </p>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleExportWallet}
                    data-testid="button-export-wallet"
                  >
                    <KeyRound className="w-4 h-4 mr-2" />
                    Export Wallet Keys
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Export your embedded wallet's private key for backup or use in another wallet app.
                  </p>
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Preferences
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t mt-auto">
            <Button
              variant="outline"
              className="w-full justify-start text-destructive"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">

          {!walletAddress && !walletTimeout && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting wallet...
                </div>
              </CardContent>
            </Card>
          )}

          {!walletAddress && walletTimeout && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start gap-2 text-muted-foreground text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>No wallet detected. Make sure your wallet extension is connected and try refreshing the page.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  data-testid="button-refresh-page-main"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
              </CardContent>
            </Card>
          )}

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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                Create Pool
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Paste token contract address..."
                className="font-mono text-xs"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                disabled={isCreating}
                data-testid="input-token-search"
              />

              {searchLoading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Looking up token...
                </div>
              )}

              {searchError && (
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-destructive" data-testid="text-search-error">{searchError}</p>
                </div>
              )}

              {searchResult && (
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      {searchResult.metadata?.logoUrl ? (
                        <img
                          src={searchResult.metadata.logoUrl}
                          alt={searchResult.metadata.symbol || "Token"}
                          className="w-10 h-10 rounded-full shrink-0 bg-muted"
                          data-testid="img-token-logo"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full shrink-0 bg-muted flex items-center justify-center">
                          <Coins className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold" data-testid="text-token-name">
                            {searchResult.metadata?.name || "Unknown Token"}
                          </p>
                          {searchResult.metadata?.symbol && (
                            <Badge variant="secondary" className="text-xs" data-testid="text-token-symbol">
                              {searchResult.metadata.symbol}
                            </Badge>
                          )}
                          {searchResult.isToken2022 && (
                            <Badge variant="outline" className="text-xs">Token-2022</Badge>
                          )}
                        </div>
                        <code className="text-xs font-mono text-muted-foreground break-all block" data-testid="text-token-mint">
                          {searchResult.mint}
                        </code>
                        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                          {searchResult.metadata?.priceUsd && (
                            <span data-testid="text-token-price">
                              Price: ${Number(searchResult.metadata.priceUsd) < 0.01
                                ? Number(searchResult.metadata.priceUsd).toExponential(2)
                                : Number(searchResult.metadata.priceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                            </span>
                          )}
                          {searchResult.metadata?.marketCap != null && (
                            <span data-testid="text-token-mcap">
                              MCap: ${searchResult.metadata.marketCap >= 1_000_000
                                ? (searchResult.metadata.marketCap / 1_000_000).toFixed(2) + "M"
                                : searchResult.metadata.marketCap >= 1_000
                                  ? (searchResult.metadata.marketCap / 1_000).toFixed(1) + "K"
                                  : searchResult.metadata.marketCap.toFixed(0)}
                            </span>
                          )}
                          <span>{searchResult.decimals} decimals</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Deposit: {loadSettings().depositAmountSol} SOL total ({(loadSettings().depositAmountSol / 2).toFixed(4)} SOL kept + {(loadSettings().depositAmountSol / 2).toFixed(4)} SOL swapped to token)
                        </p>
                      </div>
                      <Button
                        onClick={handleOpenPosition}
                        disabled={isCreating || !walletAddress}
                        className="shrink-0"
                        data-testid="button-open-position"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Working...
                          </>
                        ) : (
                          <>
                            <Coins className="w-4 h-4 mr-2" />
                            Open Position
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {isCreating && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm" data-testid="overlay-creating">
                  <Card className="w-full max-w-sm mx-4">
                    <CardContent className="pt-6 space-y-5">
                      <div className="flex flex-col items-center gap-3">
                        <div className="relative w-14 h-14 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                          <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        </div>
                        <p className="text-base font-semibold text-center">Opening Position</p>
                        <p className="text-sm text-muted-foreground text-center" data-testid="text-creation-step">
                          {stepLabel(creationStep)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Progress</span>
                          <span>
                            Step {creationStep === "swapping" ? "1" : creationStep === "creating-pool" ? "2" : "3"} of 3
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <div className={`h-2 flex-1 rounded-md transition-colors ${creationStep === "swapping" || creationStep === "creating-pool" || creationStep === "confirming" ? "bg-primary" : "bg-muted"}`} />
                          <div className={`h-2 flex-1 rounded-md transition-colors ${creationStep === "creating-pool" || creationStep === "confirming" ? "bg-primary" : "bg-muted"}`} />
                          <div className={`h-2 flex-1 rounded-md transition-colors ${creationStep === "confirming" ? "bg-primary" : "bg-muted"}`} />
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground text-center">
                        Please do not close this page while the transaction is processing.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {poolError && (
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-destructive break-all" data-testid="text-pool-error">{poolError}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Button
              className="w-full"
              variant="outline"
              size="lg"
              onClick={() => setView("portfolio")}
              disabled={isCreating}
              data-testid="button-portfolio"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Portfolio
            </Button>
            <Button
              className="w-full"
              variant="outline"
              size="lg"
              onClick={() => setView("settings")}
              disabled={isCreating}
              data-testid="button-settings"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>
                  Configure your fee schedule and deposit amount in Settings.
                </li>
                <li>
                  Paste a token contract address in the search bar.
                </li>
                <li>
                  Click "Open Position" &mdash; the app automatically swaps half your SOL into the token via Jupiter, then creates a Meteora DAMMv2 pool with both sides.
                </li>
                <li>View your transaction on Solscan to confirm.</li>
              </ol>
            </CardContent>
          </Card>

        </div>
      </main>

      <footer className="p-4 text-center text-xs text-muted-foreground">
        made with ❤️ by krispy.
      </footer>
    </div>
  );
}
