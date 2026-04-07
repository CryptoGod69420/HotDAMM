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
import { PoolSettings, loadSettings, getStartingFeeBps, getFeeDurationParams } from "./PoolSettings";
import { Portfolio } from "./Portfolio";
import {
  shortenAddress,
  formatNumber,
  getSolscanAccountUrl,
  getTokenMintInfo,
} from "@/utils/tokenUtils";
import { executeJupiterSwap } from "@/utils/jupiter";
import { signAndSendTransaction } from "@/utils/sendTransaction";
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
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
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
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
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

  const [depositPanelOpen, setDepositPanelOpen] = useState(false);
  const [withdrawPanelOpen, setWithdrawPanelOpen] = useState(false);
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

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

  const fetchSolPrice = async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      if (!res.ok) return;
      const data = await res.json();
      setSolPriceUsd(data?.solana?.usd ?? null);
    } catch {
      // non-critical — price display is optional
    }
  };

  useEffect(() => {
    if (walletAddress) {
      fetchBalance();
      setWalletTimeout(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchSolPrice();
  }, []);

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

      const { numberOfPeriod, totalDuration } = getFeeDurationParams(settings);
      const startingFeeBps = getStartingFeeBps(settings);
      const endingFeeBps = settings.feeDecayEnabled ? settings.feeTierBps : startingFeeBps;

      const baseFeeParams = getBaseFeeParams(
        {
          baseFeeMode: baseFeeModeNum,
          feeTimeSchedulerParam: {
            startingFeeBps,
            endingFeeBps,
            numberOfPeriod,
            totalDuration,
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

  const handleWithdraw = async () => {
    if (!activeWallet || !walletAddress) return;
    setWithdrawError(null);

    const amountNum = parseFloat(withdrawAmount);
    if (!withdrawTo.trim()) {
      setWithdrawError("Enter a destination address.");
      return;
    }
    let toPubkey: PublicKey;
    try {
      toPubkey = new PublicKey(withdrawTo.trim());
      if (!PublicKey.isOnCurve(toPubkey.toBytes())) {
        setWithdrawError("Invalid Solana address (not on Ed25519 curve).");
        return;
      }
    } catch {
      setWithdrawError("Invalid Solana address.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setWithdrawError("Enter a valid amount.");
      return;
    }
    if (balance !== null && amountNum >= balance) {
      setWithdrawError("Amount exceeds balance (keep some SOL for fees).");
      return;
    }

    setWithdrawLoading(true);
    try {
      const fromPubkey = new PublicKey(walletAddress);
      const tx = new Transaction();
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: Math.round(amountNum * LAMPORTS_PER_SOL),
        })
      );
      const sig = await signAndSendTransaction(activeWallet, connection, tx);
      toast({
        title: "Sent",
        description: `${amountNum} SOL sent successfully.`,
      });
      setWithdrawTo("");
      setWithdrawAmount("");
      setWithdrawPanelOpen(false);
      fetchBalance();
      console.log("Withdraw tx:", sig);
    } catch (e: any) {
      console.error("Withdraw failed:", e);
      setWithdrawError(e?.message || "Transaction failed.");
    } finally {
      setWithdrawLoading(false);
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

      <Sheet open={profileOpen} onOpenChange={(open) => {
        setProfileOpen(open);
        if (open) {
          fetchSolPrice();
        } else {
          setDepositPanelOpen(false);
          setWithdrawPanelOpen(false);
          setWithdrawError(null);
        }
      }}>
        <SheetContent side="right" className="flex flex-col p-0 gap-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Wallet</SheetTitle>
            <SheetDescription>Account and wallet details</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            {/* Hero balance card */}
            <div className="p-5 space-y-4">
              <div className="rounded-2xl bg-muted/50 border p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Balance</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tabular-nums" data-testid="text-sol-balance">
                        {loadingBalance ? (
                          <Loader2 className="w-6 h-6 animate-spin inline text-muted-foreground" />
                        ) : balance !== null ? (
                          formatNumber(balance)
                        ) : (
                          "---"
                        )}
                      </span>
                      <span className="text-lg font-semibold text-muted-foreground">SOL</span>
                    </div>
                    {balance !== null && solPriceUsd !== null && (
                      <p className="text-sm text-muted-foreground tabular-nums" data-testid="text-sol-usd-value">
                        ≈ ${(balance * solPriceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                      </p>
                    )}
                  </div>
                  <button
                    onClick={fetchBalance}
                    disabled={loadingBalance}
                    className="mt-1 p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
                    data-testid="button-refresh-balance"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingBalance ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {walletAddress && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setDepositPanelOpen((p) => !p);
                        setWithdrawPanelOpen(false);
                        setWithdrawError(null);
                      }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        depositPanelOpen
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background hover:bg-muted border-border text-foreground"
                      }`}
                      data-testid="button-deposit"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      Deposit
                    </button>
                    <button
                      onClick={() => {
                        const opening = !withdrawPanelOpen;
                        setWithdrawPanelOpen(opening);
                        setDepositPanelOpen(false);
                        setWithdrawError(null);
                        if (opening && loginMethod.type === "Wallet" && user?.wallet?.address && !withdrawTo) {
                          setWithdrawTo(user.wallet.address);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        withdrawPanelOpen
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background hover:bg-muted border-border text-foreground"
                      }`}
                      data-testid="button-withdraw"
                    >
                      <ArrowUpFromLine className="w-3.5 h-3.5" />
                      Withdraw
                    </button>
                  </div>
                )}
              </div>

              {/* Deposit panel */}
              {depositPanelOpen && walletAddress && (
                <div className="rounded-xl border bg-muted/30 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Receive SOL</p>
                  <p className="text-xs text-muted-foreground">Send SOL to this address to deposit funds.</p>
                  <div className="flex items-center gap-1.5">
                    <code
                      className="text-sm font-mono bg-background border px-3 py-2 rounded-lg flex-1 truncate"
                      data-testid="text-deposit-address"
                      data-address={walletAddress}
                      title={walletAddress}
                    >
                      {shortenAddress(walletAddress, 4)}
                    </code>
                    <button
                      onClick={copyAddress}
                      className="p-2 rounded-lg border bg-background hover:bg-muted transition-colors"
                      data-testid="button-deposit-copy-address"
                      title="Copy full address"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <a
                      href={getSolscanAccountUrl(walletAddress, cluster)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg border bg-background hover:bg-muted transition-colors inline-flex items-center justify-center"
                      data-testid="button-deposit-solscan-wallet"
                      title="View on Solscan"
                    >
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono break-all opacity-60">{walletAddress}</p>
                </div>
              )}

              {/* Withdraw panel */}
              {withdrawPanelOpen && walletAddress && (
                <div className="rounded-xl border bg-muted/30 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Send SOL</p>
                  <div className="space-y-2">
                    <Input
                      placeholder="Destination address"
                      value={withdrawTo}
                      onChange={(e) => { setWithdrawTo(e.target.value); setWithdrawError(null); }}
                      className="font-mono text-xs"
                      data-testid="input-withdraw-to"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="any"
                        placeholder="Amount (SOL)"
                        value={withdrawAmount}
                        onChange={(e) => { setWithdrawAmount(e.target.value); setWithdrawError(null); }}
                        className="text-sm"
                        data-testid="input-withdraw-amount"
                      />
                      {balance !== null && (
                        <button
                          type="button"
                          onClick={() => setWithdrawAmount(Math.max(0, balance - 0.002).toFixed(6))}
                          className="px-3 py-2 text-xs font-medium rounded-lg border bg-background hover:bg-muted transition-colors whitespace-nowrap"
                          data-testid="button-withdraw-max"
                        >
                          Max
                        </button>
                      )}
                    </div>
                  </div>
                  {withdrawError && (
                    <div className="flex items-start gap-2 text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span data-testid="text-withdraw-error">{withdrawError}</span>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleWithdraw}
                    disabled={withdrawLoading || !withdrawTo || !withdrawAmount || balance === null}
                    data-testid="button-withdraw-send"
                  >
                    {withdrawLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send SOL
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Wallet section */}
            <div className="p-5 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Wallet</p>
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
                  <div className="flex items-center gap-1.5">
                    <code
                      className="text-xs font-mono bg-muted px-2 py-1.5 rounded-md flex-1 truncate"
                      data-testid="text-wallet-address"
                      title={walletAddress}
                    >
                      {shortenAddress(walletAddress, 4)}
                    </code>
                    <button
                      onClick={copyAddress}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                      data-testid="button-copy-address"
                      title="Copy address"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <a
                      href={getSolscanAccountUrl(walletAddress, cluster)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground inline-flex items-center justify-center"
                      data-testid="button-solscan-wallet"
                      title="View on Solscan"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-xs">Mainnet</Badge>
                    <Badge variant="secondary" className="text-xs">
                      {isEmbeddedWallet ? "Privy Embedded" : "External Wallet"}
                    </Badge>
                  </div>
                </div>
              )}

              {isEmbeddedWallet && walletAddress && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-1">Security</p>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleExportWallet}
                    data-testid="button-export-wallet"
                  >
                    <KeyRound className="w-4 h-4 mr-2" />
                    Export Wallet Keys
                  </Button>
                </>
              )}
            </div>

            <Separator />

            {/* Preferences */}
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">Theme</span>
                <ThemeToggle />
              </div>
            </div>

            <Separator />

            {/* Footer login info */}
            <div className="p-5 pb-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="shrink-0">Logged in via</span>
                <Avatar className="h-4 w-4 shrink-0">
                  <AvatarFallback className="text-[9px] font-medium bg-primary/15 text-primary">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground shrink-0" data-testid="text-profile-login-method">{loginMethod.type}</span>
                <span className="shrink-0 truncate max-w-[100px] opacity-60" data-testid="text-profile-login-value">({loginMethod.value})</span>
                <span className="shrink-0">·</span>
                <span className="font-semibold text-foreground shrink-0">Privy</span>
              </div>
            </div>
          </div>

          <div className="p-4 border-t">
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
            <Button
              className="col-span-2 w-full"
              variant="outline"
              size="lg"
              onClick={() => setProfileOpen(true)}
              disabled={isCreating}
              data-testid="button-account-details"
            >
              <User className="w-4 h-4 mr-2" />
              Account & Wallet Details
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
