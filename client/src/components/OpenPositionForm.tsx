import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Keypair, PublicKey, Transaction, ComputeBudgetProgram } from "@solana/web3.js";

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import Decimal from "decimal.js";
import {
  CpAmm,
  getBaseFeeParams,
  getDynamicFeeParams,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
  BaseFeeMode,
  ActivationType,
} from "@meteora-ag/cp-amm-sdk";
import { useWallets } from "@privy-io/react-auth/solana";
import { useConnection } from "@/hooks/useConnection";
import { useCpAmm } from "@/hooks/useCpAmm";
import { getTokenMintInfo } from "@/utils/tokenUtils";
import { selectStaticConfig, getAllMatchingConfigs } from "@/utils/meteoraConfigs";
import { FEE_SCHEDULE_START_BPS, FEE_SCHEDULE_DURATION_SECONDS, FEE_SCHEDULE_NUM_PERIODS } from "./PoolSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2, AlertCircle, Coins } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  tokenAMint: z.string().min(32, "Enter a valid Solana mint address"),
  tokenBMint: z.string().min(32, "Enter a valid Solana mint address"),
  tokenAAmount: z.coerce.number().positive("Must be > 0"),
  tokenBAmount: z.coerce.number().positive("Must be > 0"),
  baseFeeMode: z.string().default("1"),
  feeTierBps: z.coerce.number().min(0).max(10000).default(100),
  enableFeeScheduler: z.boolean().default(true),
  enableDynamicFee: z.boolean().default(true),
  dynamicFeeMaxBps: z.coerce.number().min(0).max(10000).default(25),
  collectFeeMode: z.string().default("0"),
  activationType: z.string().default("1"),
  activateNow: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

const FEE_MODE_OPTIONS = [
  { value: "0", label: "Linear Scheduler" },
  { value: "1", label: "Exponential Scheduler" },
  { value: "2", label: "Rate Limiter" },
  { value: "3", label: "MarketCap Linear" },
  { value: "4", label: "MarketCap Exponential" },
];

const COLLECT_FEE_OPTIONS = [
  { value: "0", label: "Both Tokens" },
  { value: "1", label: "Only Token A" },
  { value: "2", label: "Only Token B" },
];

const ACTIVATION_OPTIONS = [
  { value: "0", label: "Slot" },
  { value: "1", label: "Timestamp" },
];

interface Props {
  onSuccess: (signature: string) => void;
}

export function OpenPositionForm({ onSuccess }: Props) {
  const connection = useConnection();
  const { wallets } = useWallets();
  const cpAmm = useCpAmm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const activeWallet = wallets.find((w) => w.address) || null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tokenAMint: "",
      tokenBMint: "",
      tokenAAmount: 0,
      tokenBAmount: 0,
      baseFeeMode: "1",
      feeTierBps: 100,
      enableFeeScheduler: true,
      enableDynamicFee: true,
      dynamicFeeMaxBps: 25,
      collectFeeMode: "0",
      activationType: "1",
      activateNow: true,
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!activeWallet) {
      setError("No wallet connected");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const walletPublicKey = new PublicKey(activeWallet.address);
      const tokenAMint = new PublicKey(values.tokenAMint);
      const tokenBMint = new PublicKey(values.tokenBMint);

      const [tokenAInfo, tokenBInfo] = await Promise.all([
        getTokenMintInfo(connection, tokenAMint),
        getTokenMintInfo(connection, tokenBMint),
      ]);

      const tokenAAmountBN = new BN(
        new Decimal(values.tokenAAmount)
          .mul(new Decimal(10).pow(tokenAInfo.decimals))
          .floor()
          .toFixed(0)
      );
      const tokenBAmountBN = new BN(
        new Decimal(values.tokenBAmount)
          .mul(new Decimal(10).pow(tokenBInfo.decimals))
          .floor()
          .toFixed(0)
      );

      const bufA = tokenAMint.toBuffer();
      const bufB = tokenBMint.toBuffer();
      const aFirst = Buffer.compare(bufA, bufB) > 0;

      const orderedMintA = aFirst ? tokenAMint : tokenBMint;
      const orderedMintB = aFirst ? tokenBMint : tokenAMint;
      const orderedAmountA = aFirst ? tokenAAmountBN : tokenBAmountBN;
      const orderedAmountB = aFirst ? tokenBAmountBN : tokenAAmountBN;
      const orderedProgramA = aFirst ? (tokenAInfo.tokenProgram || TOKEN_PROGRAM_ID) : (tokenBInfo.tokenProgram || TOKEN_PROGRAM_ID);
      const orderedProgramB = aFirst ? (tokenBInfo.tokenProgram || TOKEN_PROGRAM_ID) : (tokenAInfo.tokenProgram || TOKEN_PROGRAM_ID);
      const orderedDecimalsB = aFirst ? tokenBInfo.decimals : tokenAInfo.decimals;

      const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
        tokenAAmount: orderedAmountA,
        tokenBAmount: orderedAmountB,
        minSqrtPrice: MIN_SQRT_PRICE,
        maxSqrtPrice: MAX_SQRT_PRICE,
      });

      const activationTypeNum = parseInt(values.activationType);
      const baseFeeModeNum = parseInt(values.baseFeeMode) as BaseFeeMode;

      const baseFeeParams = getBaseFeeParams(
        {
          baseFeeMode: values.enableFeeScheduler ? baseFeeModeNum : (0 as BaseFeeMode),
          feeTimeSchedulerParam: values.enableFeeScheduler
            ? {
                startingFeeBps: FEE_SCHEDULE_START_BPS,
                endingFeeBps: values.feeTierBps,
                numberOfPeriod: FEE_SCHEDULE_NUM_PERIODS,
                totalDuration: FEE_SCHEDULE_DURATION_SECONDS,
              }
            : {
                startingFeeBps: values.feeTierBps,
                endingFeeBps: values.feeTierBps,
                numberOfPeriod: 1,
                totalDuration: 1,
              },
        },
        orderedDecimalsB,
        activationTypeNum === 1
          ? ActivationType.Timestamp
          : ActivationType.Slot
      );

      const dynamicFeeParams = values.enableDynamicFee
        ? getDynamicFeeParams(values.dynamicFeeMaxBps)
        : null;

      const poolFees = {
        baseFee: baseFeeParams,
        padding: [],
        dynamicFee: dynamicFeeParams,
      };

      const positionNftMint = Keypair.generate();
      const collectFeeModeNum = parseInt(values.collectFeeMode);

      const selectedConfig = selectStaticConfig(
        collectFeeModeNum,
        values.enableDynamicFee,
        values.feeTierBps,
      );

      const allMatchingConfigs = getAllMatchingConfigs(
        collectFeeModeNum,
        values.enableDynamicFee,
      );

      let tx: Transaction | null = null;

      const configsToTry = [
        selectedConfig,
        ...allMatchingConfigs.filter((c) => !c.equals(selectedConfig)),
      ];

      for (const configKey of configsToTry) {
        try {
          const result = await cpAmm.createCustomPoolWithDynamicConfig({
            payer: walletPublicKey,
            creator: walletPublicKey,
            config: configKey,
            poolCreatorAuthority: walletPublicKey,
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
            activationPoint: values.activateNow ? null : new BN(Date.now()),
            activationType: activationTypeNum,
            tokenAProgram: orderedProgramA,
            tokenBProgram: orderedProgramB,
          });
          tx = result.tx;
          console.log("Using config:", configKey.toBase58());
          break;
        } catch (e: any) {
          const msg = e?.message || "";
          if (msg.includes("already in use") || msg.includes("0x0")) {
            console.warn("Pool PDA collision with config", configKey.toBase58(), "- trying next config");
            continue;
          }
          throw e;
        }
      }

      if (!tx) {
        throw new Error("All config keys exhausted — a pool already exists for this token pair with every available config. Try changing your fee settings.");
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
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

      await connection.confirmTransaction(
        { signature: txid, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      onSuccess(txid);
    } catch (e: any) {
      console.error("Transaction failed:", e);
      const msg = e?.message || "Transaction failed";
      setError(msg);
      toast({
        title: "Transaction Failed",
        description: msg.slice(0, 200),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary" />
              Token Pair
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField
              control={form.control}
              name="tokenAMint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Token A Mint Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                      className="font-mono text-xs"
                      data-testid="input-token-a-mint"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tokenBMint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Token B Mint Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. So11111111111111111111111111111111111111112"
                      className="font-mono text-xs"
                      data-testid="input-token-b-mint"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tokenAAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Token A Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="100"
                        data-testid="input-token-a-amount"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tokenBAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Token B Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="200"
                        data-testid="input-token-b-amount"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fee Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField
              control={form.control}
              name="baseFeeMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Fee Mode</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-fee-mode">
                        <SelectValue placeholder="Select fee mode" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FEE_MODE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="feeTierBps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Fee Tier (bps)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      data-testid="input-fee-tier"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {(field.value / 100).toFixed(2)}%
                    {form.watch("enableFeeScheduler") && " — decays from 50% over 24h"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enableFeeScheduler"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2">
                  <div>
                    <FormLabel className="text-xs">Fee Scheduler</FormLabel>
                    <FormDescription className="text-xs">
                      Start at 50%, decay to fee tier over 24h
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-fee-scheduler"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="space-y-3 pt-1">
              <FormField
                control={form.control}
                name="enableDynamicFee"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-2">
                    <div>
                      <FormLabel className="text-xs">Enable Dynamic Fee</FormLabel>
                      <FormDescription className="text-xs">
                        Automatically adjust fees based on volatility
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-dynamic-fee"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("enableDynamicFee") && (
                <FormField
                  control={form.control}
                  name="dynamicFeeMaxBps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Dynamic Fee Max (bps)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-dynamic-fee-max"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        {(field.value / 100).toFixed(2)}%
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pool Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField
              control={form.control}
              name="collectFeeMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Collect Fee Mode</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-collect-fee-mode">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COLLECT_FEE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="activationType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Activation Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-activation-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ACTIVATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="activateNow"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2">
                  <div>
                    <FormLabel className="text-xs">Activate Immediately</FormLabel>
                    <FormDescription className="text-xs">
                      Pool becomes active right after creation
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-activate-now"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p
                  className="text-sm text-destructive break-all"
                  data-testid="text-error"
                >
                  {error}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={submitting || !activeWallet}
          data-testid="button-submit-position"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Creating Pool & Position...
            </>
          ) : (
            <>
              <Coins className="w-4 h-4 mr-2" />
              Open Position
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
