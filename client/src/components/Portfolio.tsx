import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import BN from "bn.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink, TrendingUp, Coins, BarChart3 } from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { useCpAmm } from "@/hooks/useCpAmm";
import {
  getUnClaimLpFee,
  getAmountAFromLiquidityDelta,
  getAmountBFromLiquidityDelta,
  Rounding,
} from "@meteora-ag/cp-amm-sdk";
import { shortenAddress, formatNumber } from "@/utils/tokenUtils";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

interface TokenInfo {
  symbol: string;
  decimals: number;
  mint: string;
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
}

const tokenSymbolCache: Record<string, string> = {};

async function fetchTokenSymbol(mint: string): Promise<string> {
  if (mint === WSOL_MINT) return "SOL";
  if (tokenSymbolCache[mint]) return tokenSymbolCache[mint];

  try {
    const resp = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0 && data[0].baseToken?.symbol) {
        const sym = data[0].baseToken.symbol;
        tokenSymbolCache[mint] = sym;
        return sym;
      }
    }
  } catch {}

  const short = mint.slice(0, 4) + "..." + mint.slice(-4);
  tokenSymbolCache[mint] = short;
  return short;
}

interface PortfolioProps {
  walletAddress: string;
}

export function Portfolio({ walletAddress }: PortfolioProps) {
  const connection = useConnection();
  const cpAmm = useCpAmm();
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const allMintsObj: Record<string, boolean> = {};
      Object.values(poolStates).forEach((ps: any) => {
        allMintsObj[ps.tokenAMint.toBase58()] = true;
        allMintsObj[ps.tokenBMint.toBase58()] = true;
      });
      const allMints = Object.keys(allMintsObj);

      for (const mint of allMints) {
        if (mint === WSOL_MINT) {
          mintDecimals[mint] = 9;
          continue;
        }
        try {
          const mintInfo = await getMint(connection, new PublicKey(mint));
          mintDecimals[mint] = mintInfo.decimals;
        } catch {
          mintDecimals[mint] = 9;
        }
      }

      const symbolPromises = allMints.map(m => fetchTokenSymbol(m));
      await Promise.all(symbolPromises);

      const positionDataList: PositionData[] = [];

      for (const pos of userPositions) {
        const poolAddr = pos.positionState.pool.toBase58();
        const poolState = poolStates[poolAddr];
        if (!poolState) continue;

        const mintA = poolState.tokenAMint.toBase58();
        const mintB = poolState.tokenBMint.toBase58();
        const decimalsA = mintDecimals[mintA] || 9;
        const decimalsB = mintDecimals[mintB] || 9;

        const totalLiq = pos.positionState.unlockedLiquidity
          .add(pos.positionState.vestedLiquidity)
          .add(pos.positionState.permanentLockedLiquidity);

        let amountA = 0;
        let amountB = 0;
        try {
          const amtABN = getAmountAFromLiquidityDelta(
            poolState.sqrtMinPrice,
            poolState.sqrtPrice,
            totalLiq,
            Rounding.Down
          );
          const amtBBN = getAmountBFromLiquidityDelta(
            poolState.sqrtPrice,
            poolState.sqrtMaxPrice,
            totalLiq,
            Rounding.Down
          );
          amountA = Number(amtABN.toString()) / Math.pow(10, decimalsA);
          amountB = Number(amtBBN.toString()) / Math.pow(10, decimalsB);
        } catch {}

        let feeA = 0;
        let feeB = 0;
        try {
          const fees = getUnClaimLpFee(poolState, pos.positionState);
          feeA = Number(fees.feeTokenA.toString()) / Math.pow(10, decimalsA);
          feeB = Number(fees.feeTokenB.toString()) / Math.pow(10, decimalsB);
        } catch {}

        const isLocked = pos.positionState.permanentLockedLiquidity.gtn(0);

        positionDataList.push({
          positionAddress: pos.position.toBase58(),
          poolAddress: poolAddr,
          tokenA: {
            symbol: tokenSymbolCache[mintA] || shortenAddress(mintA),
            decimals: decimalsA,
            mint: mintA,
          },
          tokenB: {
            symbol: tokenSymbolCache[mintB] || shortenAddress(mintB),
            decimals: decimalsB,
            mint: mintB,
          },
          amountA,
          amountB,
          unclaimedFeeA: feeA,
          unclaimedFeeB: feeB,
          totalLiquidity: totalLiq.toString(),
          isLocked,
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
        {positions.map((pos) => (
          <Card key={pos.positionAddress}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" />
                  <span data-testid={`text-pair-${pos.positionAddress.slice(0, 8)}`}>
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
                  data-testid={`link-pool-${pos.positionAddress.slice(0, 8)}`}
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
                  <p className="text-sm font-medium" data-testid={`text-amount-a-${pos.positionAddress.slice(0, 8)}`}>
                    {formatNumber(pos.amountA)} {pos.tokenA.symbol}
                  </p>
                  <p className="text-sm font-medium" data-testid={`text-amount-b-${pos.positionAddress.slice(0, 8)}`}>
                    {formatNumber(pos.amountB)} {pos.tokenB.symbol}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Unclaimed Fees
                  </p>
                  <p className="text-sm font-medium" data-testid={`text-fee-a-${pos.positionAddress.slice(0, 8)}`}>
                    {formatNumber(pos.unclaimedFeeA)} {pos.tokenA.symbol}
                  </p>
                  <p className="text-sm font-medium" data-testid={`text-fee-b-${pos.positionAddress.slice(0, 8)}`}>
                    {formatNumber(pos.unclaimedFeeB)} {pos.tokenB.symbol}
                  </p>
                </div>
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
                  data-testid={`link-position-${pos.positionAddress.slice(0, 8)}`}
                >
                  <ExternalLink className="w-3 h-3" />
                  Solscan
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
