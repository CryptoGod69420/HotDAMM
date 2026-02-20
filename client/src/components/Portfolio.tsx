import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import BN from "bn.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink, TrendingUp, BarChart3, DollarSign, XCircle } from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { useCpAmm } from "@/hooks/useCpAmm";
import { useEmbeddedWallet } from "@/hooks/useEmbeddedWallet";
import {
  getUnClaimLpFee,
  getCurrentPoint,
} from "@meteora-ag/cp-amm-sdk";
import { shortenAddress, formatNumber } from "@/utils/tokenUtils";
import { signAndSendTransaction } from "@/utils/sendTransaction";
import { executeJupiterSwap } from "@/utils/jupiter";
import { useToast } from "@/hooks/use-toast";

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_LOGO = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

interface TokenInfo {
  symbol: string;
  decimals: number;
  mint: string;
  logoUrl: string | null;
  priceUsd: number;
}

interface PositionData {
  positionAddress: string;
  poolAddress: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  amountA: number;
  amountB: number;
  unclaimedFeeA: number;
  unclaimedFeeB: number;
  totalLiquidity: string;
  isLocked: boolean;
  positionNftAccount: string;
  rawPositionState: any;
  rawPoolState: any;
  collectFeeMode: number;
}

const tokenMetaCache: Record<string, { symbol: string; logoUrl: string | null; priceUsd: number }> = {};

async function fetchTokenMeta(mint: string): Promise<{ symbol: string; logoUrl: string | null; priceUsd: number }> {
  if (mint === WSOL_MINT) {
    if (!tokenMetaCache[mint]) {
      try {
        const resp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
        if (resp.ok) {
          const data = await resp.json();
          tokenMetaCache[mint] = { symbol: "SOL", logoUrl: SOL_LOGO, priceUsd: data.solana?.usd || 0 };
        } else {
          tokenMetaCache[mint] = { symbol: "SOL", logoUrl: SOL_LOGO, priceUsd: 0 };
        }
      } catch {
        tokenMetaCache[mint] = { symbol: "SOL", logoUrl: SOL_LOGO, priceUsd: 0 };
      }
    }
    return tokenMetaCache[mint];
  }

  if (tokenMetaCache[mint]) return tokenMetaCache[mint];

  try {
    const resp = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0) {
        let symbol = "";
        let logoUrl: string | null = null;
        let priceUsd = 0;

        for (const pair of data) {
          if (pair.baseToken?.address === mint) {
            symbol = pair.baseToken?.symbol || symbol;
            logoUrl = pair.info?.imageUrl || logoUrl;
            priceUsd = parseFloat(pair.priceUsd || "0");
            break;
          }
        }

        if (!symbol && data[0].quoteToken?.address === mint) {
          symbol = data[0].quoteToken?.symbol || "";
          logoUrl = null;
          const basePrice = parseFloat(data[0].priceUsd || "0");
          const priceNative = parseFloat(data[0].priceNative || "0");
          if (priceNative > 0 && basePrice > 0) {
            priceUsd = basePrice / priceNative;
          }
        }

        if (!symbol) {
          symbol = data[0].baseToken?.symbol || "";
          logoUrl = data[0].info?.imageUrl || null;
        }

        if (symbol) {
          tokenMetaCache[mint] = { symbol, logoUrl, priceUsd };
          return tokenMetaCache[mint];
        }
      }
    }
  } catch {}

  const short = mint.slice(0, 4) + "..." + mint.slice(-4);
  tokenMetaCache[mint] = { symbol: short, logoUrl: null, priceUsd: 0 };
  return tokenMetaCache[mint];
}

function TokenLogo({ src, symbol, size = 16 }: { src: string | null; symbol: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!src || imgFailed) {
    return (
      <div
        className="rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={symbol}
      className="rounded-full shrink-0 object-cover"
      style={{ width: size, height: size }}
      onError={() => setImgFailed(true)}
    />
  );
}

function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return "<$0.01";
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PortfolioProps {
  walletAddress: string;
}

export function Portfolio({ walletAddress }: PortfolioProps) {
  const connection = useConnection();
  const cpAmm = useCpAmm();
  const { embeddedWallet } = useEmbeddedWallet();
  const { toast } = useToast();
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingFees, setClaimingFees] = useState<Record<string, boolean>>({});
  const [closingPosition, setClosingPosition] = useState<Record<string, boolean>>({});

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const userPubkey = new PublicKey(walletAddress);
      const userPositions = await cpAmm.getPositionsByUser(userPubkey);

      if (userPositions.length === 0) {
        setPositions([]);
        setLoading(false);
        return;
      }

      const poolAddrSet: Record<string, boolean> = {};
      userPositions.forEach(p => { poolAddrSet[p.positionState.pool.toBase58()] = true; });
      const poolAddresses = Object.keys(poolAddrSet);
      const poolStates: Record<string, any> = {};

      for (const addr of poolAddresses) {
        try {
          const poolState = await cpAmm.fetchPoolState(new PublicKey(addr));
          poolStates[addr] = poolState;
        } catch (e) {
          console.warn("Failed to fetch pool state for", addr, e);
        }
      }

      const mintDecimals: Record<string, number> = {};
      const mintPrograms: Record<string, PublicKey> = {};
      Object.values(poolStates).forEach((ps: any) => {
        const mintA = ps.tokenAMint.toBase58();
        const mintB = ps.tokenBMint.toBase58();
        mintPrograms[mintA] = ps.tokenAProgram;
        mintPrograms[mintB] = ps.tokenBProgram;
      });
      const allMints = Object.keys(mintPrograms);

      for (const mint of allMints) {
        if (mint === WSOL_MINT) {
          mintDecimals[mint] = 9;
          continue;
        }
        try {
          const mintInfo = await getMint(connection, new PublicKey(mint), undefined, mintPrograms[mint]);
          mintDecimals[mint] = mintInfo.decimals;
        } catch {
          try {
            const acctInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
            const parsed = (acctInfo.value?.data as any)?.parsed?.info;
            if (parsed?.decimals !== undefined) {
              mintDecimals[mint] = parsed.decimals;
            } else {
              mintDecimals[mint] = 9;
            }
          } catch {
            mintDecimals[mint] = 9;
          }
        }
      }

      await Promise.all(allMints.map(m => fetchTokenMeta(m)));

      const positionDataList: PositionData[] = [];

      for (const pos of userPositions) {
        const poolAddr = pos.positionState.pool.toBase58();
        const poolState = poolStates[poolAddr];
        if (!poolState) continue;

        const mintA = poolState.tokenAMint.toBase58();
        const mintB = poolState.tokenBMint.toBase58();
        const decimalsA = mintDecimals[mintA] || 9;
        const decimalsB = mintDecimals[mintB] || 9;

        const metaA = tokenMetaCache[mintA] || { symbol: shortenAddress(mintA), logoUrl: null, priceUsd: 0 };
        const metaB = tokenMetaCache[mintB] || { symbol: shortenAddress(mintB), logoUrl: null, priceUsd: 0 };

        const totalLiq = pos.positionState.unlockedLiquidity
          .add(pos.positionState.vestedLiquidity)
          .add(pos.positionState.permanentLockedLiquidity);

        let amountA = 0;
        let amountB = 0;
        try {
          const poolTotalLiquidity = poolState.liquidity;
          if (poolTotalLiquidity && poolTotalLiquidity.gtn(0)) {
            const [vaultAInfo, vaultBInfo] = await Promise.all([
              connection.getTokenAccountBalance(poolState.tokenAVault),
              connection.getTokenAccountBalance(poolState.tokenBVault),
            ]);
            const vaultAAmount = new BN(vaultAInfo.value.amount);
            const vaultBAmount = new BN(vaultBInfo.value.amount);

            const userShareA = totalLiq.mul(vaultAAmount).div(poolTotalLiquidity);
            const userShareB = totalLiq.mul(vaultBAmount).div(poolTotalLiquidity);

            amountA = Number(userShareA.toString()) / Math.pow(10, decimalsA);
            amountB = Number(userShareB.toString()) / Math.pow(10, decimalsB);
          }
        } catch {}

        let feeA = 0;
        let feeB = 0;
        try {
          const fees = getUnClaimLpFee(poolState, pos.positionState);
          feeA = Number(fees.feeTokenA.toString()) / Math.pow(10, decimalsA);
          feeB = Number(fees.feeTokenB.toString()) / Math.pow(10, decimalsB);
        } catch {}

        const isLocked = pos.positionState.permanentLockedLiquidity.gtn(0);

        let collectFeeMode = 0;
        if (poolState.collectFeeMode !== undefined) {
          const cfm = poolState.collectFeeMode;
          if (typeof cfm === "number") {
            collectFeeMode = cfm;
          } else if (typeof cfm === "object" && cfm !== null) {
            if ("onlyB" in cfm) {
              collectFeeMode = 1;
            } else if ("bothToken" in cfm) {
              collectFeeMode = 0;
            } else if (typeof cfm.toNumber === "function") {
              collectFeeMode = cfm.toNumber();
            }
          }
        }

        positionDataList.push({
          positionAddress: pos.position.toBase58(),
          poolAddress: poolAddr,
          tokenA: {
            symbol: metaA.symbol,
            decimals: decimalsA,
            mint: mintA,
            logoUrl: metaA.logoUrl,
            priceUsd: metaA.priceUsd,
          },
          tokenB: {
            symbol: metaB.symbol,
            decimals: decimalsB,
            mint: mintB,
            logoUrl: metaB.logoUrl,
            priceUsd: metaB.priceUsd,
          },
          amountA,
          amountB,
          unclaimedFeeA: feeA,
          unclaimedFeeB: feeB,
          totalLiquidity: totalLiq.toString(),
          isLocked,
          positionNftAccount: pos.positionNftAccount.toBase58(),
          rawPositionState: pos.positionState,
          rawPoolState: poolState,
          collectFeeMode,
        });
      }

      setPositions(positionDataList);
    } catch (e: any) {
      console.error("Failed to fetch positions:", e);
      setError(e.message || "Failed to load positions");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, connection, cpAmm]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const handleClaimFees = useCallback(async (pos: PositionData) => {
    if (!embeddedWallet) {
      toast({ title: "Wallet not ready", description: "Please wait for the wallet to connect.", variant: "destructive" });
      return;
    }

    setClaimingFees(prev => ({ ...prev, [pos.positionAddress]: true }));

    try {
      const poolState = pos.rawPoolState;
      const tx = await cpAmm.claimPositionFee({
        owner: new PublicKey(walletAddress),
        position: new PublicKey(pos.positionAddress),
        pool: new PublicKey(pos.poolAddress),
        positionNftAccount: new PublicKey(pos.positionNftAccount),
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: poolState.tokenAProgram,
        tokenBProgram: poolState.tokenBProgram,
      });

      const txid = await signAndSendTransaction(embeddedWallet, connection, tx);

      toast({ title: "Fees Claimed", description: `Transaction: ${txid.slice(0, 8)}...` });
      await fetchPositions();
    } catch (e: any) {
      console.error("Failed to claim fees:", e);
      toast({ title: "Claim Failed", description: e.message || "Failed to claim fees", variant: "destructive" });
    } finally {
      setClaimingFees(prev => ({ ...prev, [pos.positionAddress]: false }));
    }
  }, [embeddedWallet, walletAddress, connection, cpAmm, toast, fetchPositions]);

  const handleClosePosition = useCallback(async (pos: PositionData) => {
    if (!embeddedWallet) {
      toast({ title: "Wallet not ready", description: "Please wait for the wallet to connect.", variant: "destructive" });
      return;
    }

    setClosingPosition(prev => ({ ...prev, [pos.positionAddress]: true }));

    try {
      const poolState = pos.rawPoolState;
      const positionState = pos.rawPositionState;

      const vestings = await cpAmm.getAllVestingsByPosition(new PublicKey(pos.positionAddress));
      const vestingParams = vestings.map(v => ({
        account: v.publicKey,
        vestingState: v.account,
      }));

      const currentPointValue = await getCurrentPoint(connection, poolState.activationType);

      const tx = await cpAmm.removeAllLiquidityAndClosePosition({
        owner: new PublicKey(walletAddress),
        position: new PublicKey(pos.positionAddress),
        positionNftAccount: new PublicKey(pos.positionNftAccount),
        poolState,
        positionState,
        tokenAAmountThreshold: new BN(0),
        tokenBAmountThreshold: new BN(0),
        vestings: vestingParams,
        currentPoint: currentPointValue,
      });

      const txid = await signAndSendTransaction(embeddedWallet, connection, tx);
      toast({ title: "Position Closed", description: `Transaction: ${txid.slice(0, 8)}...` });

      const nonSolMint = pos.tokenA.mint !== WSOL_MINT ? pos.tokenA.mint : pos.tokenB.mint !== WSOL_MINT ? pos.tokenB.mint : null;

      if (nonSolMint) {
        try {
          toast({ title: "Swapping tokens to SOL...", description: "Converting remaining tokens via Jupiter" });

          const tokenBalance = await getTokenBalance(connection, walletAddress, nonSolMint);

          if (tokenBalance > 0) {
            const nonSolDecimals = pos.tokenA.mint !== WSOL_MINT ? pos.tokenA.decimals : pos.tokenB.decimals;
            const solAmount = tokenBalance / Math.pow(10, nonSolDecimals);

            const quote = await getJupiterQuoteReverse(nonSolMint, tokenBalance);
            if (quote) {
              const swapTxBytes = await getJupiterSwapTx(quote, walletAddress);
              const swapResult = await embeddedWallet.signAndSendTransaction({
                transaction: swapTxBytes,
                chain: "solana:mainnet" as any,
                options: { skipPreflight: true, preflightCommitment: "confirmed" } as any,
              });

              const bs58Module = await import("bs58");
              const swapSig = typeof swapResult.signature === "string"
                ? swapResult.signature
                : bs58Module.default.encode(swapResult.signature);

              const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
              await connection.confirmTransaction({ signature: swapSig, blockhash, lastValidBlockHeight }, "confirmed");

              toast({ title: "Swap Complete", description: `Tokens swapped to SOL: ${swapSig.slice(0, 8)}...` });
            }
          }
        } catch (swapErr: any) {
          console.warn("Token swap failed:", swapErr);
          toast({ title: "Swap Skipped", description: "Position closed but token swap failed. You can swap manually.", variant: "destructive" });
        }
      }

      await fetchPositions();
    } catch (e: any) {
      console.error("Failed to close position:", e);
      toast({ title: "Close Failed", description: e.message || "Failed to close position", variant: "destructive" });
    } finally {
      setClosingPosition(prev => ({ ...prev, [pos.positionAddress]: false }));
    }
  }, [embeddedWallet, walletAddress, connection, cpAmm, toast, fetchPositions]);

  const totalFeeA = positions.reduce((sum, p) => {
    const solSide = p.tokenA.mint === WSOL_MINT ? p.unclaimedFeeA : p.tokenB.mint === WSOL_MINT ? p.unclaimedFeeB : 0;
    return sum + solSide;
  }, 0);

  const totalPositions = positions.length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading positions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchPositions} data-testid="button-retry-portfolio">
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">No Active Positions</p>
            <p className="text-xs text-muted-foreground">
              Create a pool position to see it here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold" data-testid="text-total-positions">{totalPositions}</p>
            <p className="text-xs text-muted-foreground">Active Positions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold" data-testid="text-total-fees-sol">
              {formatNumber(totalFeeA)} SOL
            </p>
            <p className="text-xs text-muted-foreground">Unclaimed SOL Fees</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Positions</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchPositions}
          data-testid="button-refresh-portfolio"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="space-y-3">
        {positions.map((pos) => {
          const isQuoteOnly = pos.collectFeeMode === 1;
          const hasFees = isQuoteOnly
            ? pos.unclaimedFeeB > 0
            : (pos.unclaimedFeeA > 0 || pos.unclaimedFeeB > 0);
          const isClaiming = claimingFees[pos.positionAddress] || false;
          const isClosing = closingPosition[pos.positionAddress] || false;
          const posId = pos.positionAddress.slice(0, 8);

          const depositedUsdA = pos.amountA * pos.tokenA.priceUsd;
          const depositedUsdB = pos.amountB * pos.tokenB.priceUsd;
          const totalDepositedUsd = depositedUsdA + depositedUsdB;

          return (
            <Card key={pos.positionAddress}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center -space-x-1">
                      <TokenLogo src={pos.tokenA.logoUrl} symbol={pos.tokenA.symbol} size={20} />
                      <TokenLogo src={pos.tokenB.logoUrl} symbol={pos.tokenB.symbol} size={20} />
                    </div>
                    <span data-testid={`text-pair-${posId}`}>
                      {pos.tokenA.symbol} / {pos.tokenB.symbol}
                    </span>
                    {pos.isLocked && (
                      <Badge variant="secondary" className="text-xs">
                        Locked
                      </Badge>
                    )}
                  </div>
                  <a
                    href={`https://app.meteora.ag/pools/${pos.poolAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground flex items-center gap-1"
                    data-testid={`link-pool-${posId}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Meteora
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Deposited</p>
                    <p className="text-sm font-bold" data-testid={`text-deposited-usd-${posId}`}>
                      {formatUsd(totalDepositedUsd)}
                    </p>
                    <div className="flex items-center gap-1" data-testid={`text-amount-a-${posId}`}>
                      <TokenLogo src={pos.tokenA.logoUrl} symbol={pos.tokenA.symbol} size={12} />
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(pos.amountA)} {pos.tokenA.symbol}
                      </p>
                    </div>
                    <div className="flex items-center gap-1" data-testid={`text-amount-b-${posId}`}>
                      <TokenLogo src={pos.tokenB.logoUrl} symbol={pos.tokenB.symbol} size={12} />
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(pos.amountB)} {pos.tokenB.symbol}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Unclaimed Fees
                    </p>
                    {!isQuoteOnly && (
                      <div className="flex items-center gap-1" data-testid={`text-fee-a-${posId}`}>
                        <TokenLogo src={pos.tokenA.logoUrl} symbol={pos.tokenA.symbol} size={12} />
                        <p className="text-sm font-medium">
                          {formatNumber(pos.unclaimedFeeA)} {pos.tokenA.symbol}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-1" data-testid={`text-fee-b-${posId}`}>
                      <TokenLogo src={pos.tokenB.logoUrl} symbol={pos.tokenB.symbol} size={12} />
                      <p className="text-sm font-medium">
                        {formatNumber(pos.unclaimedFeeB)} {pos.tokenB.symbol}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={!hasFees || isClaiming || isClosing}
                    onClick={() => handleClaimFees(pos)}
                    data-testid={`button-claim-fees-${posId}`}
                  >
                    {isClaiming ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <DollarSign className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {isClaiming ? "Claiming..." : "Claim Fees"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    disabled={pos.isLocked || isClosing || isClaiming}
                    onClick={() => handleClosePosition(pos)}
                    data-testid={`button-close-position-${posId}`}
                  >
                    {isClosing ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {isClosing ? "Closing..." : "Close Position"}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t">
                  <div className="text-xs text-muted-foreground">
                    Position: {shortenAddress(pos.positionAddress)}
                  </div>
                  <a
                    href={`https://solscan.io/account/${pos.positionAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary flex items-center gap-1"
                    data-testid={`link-position-${posId}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Solscan
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

async function getTokenBalance(connection: any, walletAddress: string, mintAddress: string): Promise<number> {
  const { TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
  const owner = new PublicKey(walletAddress);
  const mint = new PublicKey(mintAddress);

  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  if (accounts.value.length === 0) return 0;

  const balance = accounts.value[0].account.data.parsed.info.tokenAmount.amount;
  return Number(balance);
}

const JUPITER_API = "https://api.jup.ag/swap/v1";
const API_KEY = typeof import.meta !== "undefined" ? (import.meta.env.VITE_JUPITER_API_KEY || "") : "";

function jupiterHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (API_KEY) h["x-api-key"] = API_KEY;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function getJupiterQuoteReverse(inputMint: string, amountRaw: number): Promise<any> {
  const params = new URLSearchParams({
    inputMint,
    outputMint: WSOL_MINT,
    amount: amountRaw.toString(),
    slippageBps: "300",
    swapMode: "ExactIn",
  });

  const res = await fetch(`${JUPITER_API}/quote?${params}`, { headers: jupiterHeaders() });
  if (!res.ok) return null;
  return res.json();
}

async function getJupiterSwapTx(quoteResponse: any, userPublicKey: string): Promise<Uint8Array> {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: jupiterHeaders(true),
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
    throw new Error(`Jupiter swap failed: ${text}`);
  }

  const { swapTransaction } = await res.json();
  return Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
}
