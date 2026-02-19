import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Save, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SETTINGS_KEY = "meteora-pool-settings";

export const settingsSchema = z.object({
  depositAmountSol: z.coerce.number().positive("Must be > 0").default(0.2),
  baseFeeMode: z.string().default("1"),
  startingFeeBps: z.coerce.number().min(0).max(10000).default(500),
  endingFeeBps: z.coerce.number().min(0).max(10000).default(25),
  feeDurationSeconds: z.coerce.number().min(1).default(300),
  feeNumberOfPeriods: z.coerce.number().min(1).default(50),
  enableDynamicFee: z.boolean().default(true),
  dynamicFeeMaxBps: z.coerce.number().min(0).max(10000).default(25),
  collectFeeMode: z.string().default("0"),
  activationType: z.string().default("1"),
  activateNow: z.boolean().default(true),
});

export type PoolSettingsValues = z.infer<typeof settingsSchema>;

const DEFAULT_SETTINGS: PoolSettingsValues = {
  depositAmountSol: 0.2,
  baseFeeMode: "1",
  startingFeeBps: 500,
  endingFeeBps: 25,
  feeDurationSeconds: 300,
  feeNumberOfPeriods: 50,
  enableDynamicFee: true,
  dynamicFeeMaxBps: 25,
  collectFeeMode: "0",
  activationType: "1",
  activateNow: true,
};

export function loadSettings(): PoolSettingsValues {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(values: PoolSettingsValues) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
}

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
  onSaved: () => void;
}

export function PoolSettings({ onSaved }: Props) {
  const { toast } = useToast();
  const saved = loadSettings();

  const form = useForm<PoolSettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: saved,
  });

  const onSubmit = (values: PoolSettingsValues) => {
    saveSettings(values);
    toast({
      title: "Settings Saved",
      description: "Your pool configuration has been saved.",
    });
    onSaved();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              Deposit Amount
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField
              control={form.control}
              name="depositAmountSol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Total Deposit (SOL)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.2"
                      data-testid="input-deposit-amount"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Half ({((field.value || 0) / 2).toFixed(4)} SOL) will be swapped into the token, and the other half deposited as SOL into the pool.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startingFeeBps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Starting Fee (bps)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        data-testid="input-starting-fee"
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

              <FormField
                control={form.control}
                name="endingFeeBps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Ending Fee (bps)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        data-testid="input-ending-fee"
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="feeDurationSeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Duration (seconds)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        data-testid="input-fee-duration"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="feeNumberOfPeriods"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Number of Periods</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        data-testid="input-fee-periods"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

        <Button
          type="submit"
          className="w-full"
          size="lg"
          data-testid="button-save-settings"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Settings
        </Button>
      </form>
    </Form>
  );
}
