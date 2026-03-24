import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SETTINGS_KEY = "meteora-pool-settings";

export interface PoolSettingsValues {
  depositAmountSol: number;
  baseFeeMode: string;
  feeTierBps: number;
  enableDynamicFee: boolean;
  dynamicFeeMaxBps: number;
  collectFeeMode: string;
  activationType: string;
  activateNow: boolean;
  maxExtract: boolean;
}

export const FEE_SCHEDULE_START_BPS = 5000;
export const FEE_SCHEDULE_START_BPS_MAX_EXTRACT = 9900;
export const FEE_SCHEDULE_DURATION_SECONDS = 86400;
export const FEE_SCHEDULE_NUM_PERIODS = 144;

export function getStartingFeeBps(settings: PoolSettingsValues): number {
  return settings.maxExtract ? FEE_SCHEDULE_START_BPS_MAX_EXTRACT : FEE_SCHEDULE_START_BPS;
}

const DEFAULT_SETTINGS: PoolSettingsValues = {
  depositAmountSol: 0.2,
  baseFeeMode: "1",
  feeTierBps: 100,
  enableDynamicFee: true,
  dynamicFeeMaxBps: 25,
  collectFeeMode: "1",
  activationType: "1",
  activateNow: true,
  maxExtract: false,
};

const FEE_TIERS = [
  { label: "0.25%", bps: 25 },
  { label: "0.3%", bps: 30 },
  { label: "1%", bps: 100 },
  { label: "2%", bps: 200 },
  { label: "4%", bps: 400 },
  { label: "6%", bps: 600 },
];

export function loadSettings(): PoolSettingsValues {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.startingFeeBps && !parsed.feeTierBps) {
        parsed.feeTierBps = parsed.startingFeeBps;
      }
      delete parsed.enableFeeScheduler;
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (merged.collectFeeMode !== "0" && merged.collectFeeMode !== "1") {
        merged.collectFeeMode = "1";
      }
      return merged;
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(values: PoolSettingsValues) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
}

interface ToggleGroupProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  testIdPrefix: string;
}

function ToggleGroup({ options, value, onChange, testIdPrefix }: ToggleGroupProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border bg-muted/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            value === opt.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover-elevate"
          }`}
          data-testid={`${testIdPrefix}-${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  onSaved: () => void;
}

export function PoolSettings({ onSaved }: Props) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PoolSettingsValues>(loadSettings);

  const update = <K extends keyof PoolSettingsValues>(key: K, value: PoolSettingsValues[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (settings.depositAmountSol <= 0) {
      toast({ title: "Invalid", description: "Deposit must be greater than 0.", variant: "destructive" });
      return;
    }
    saveSettings(settings);
    toast({ title: "Settings Saved", description: "Your pool configuration has been saved." });
    onSaved();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Deposit Amount</p>
              <p className="text-xs text-muted-foreground">
                SOL to deposit ({(settings.depositAmountSol / 2).toFixed(4)} swapped to token)
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                step="any"
                value={settings.depositAmountSol}
                onChange={(e) => update("depositAmountSol", parseFloat(e.target.value) || 0)}
                className="w-24 text-right text-sm font-mono"
                data-testid="input-deposit-amount"
              />
              <span className="text-xs text-muted-foreground font-medium">SOL</span>
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Fee Tier</p>
              <p className="text-xs text-muted-foreground">
                Target fee after 24h decay from {settings.maxExtract ? "99%" : "50%"}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {FEE_TIERS.map((tier) => (
                <button
                  key={tier.bps}
                  type="button"
                  onClick={() => update("feeTierBps", tier.bps)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                    settings.feeTierBps === tier.bps
                      ? "bg-foreground text-background"
                      : "bg-muted/50 border text-muted-foreground hover-elevate"
                  }`}
                  data-testid={`button-fee-tier-${tier.bps}`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Dynamic Fee</p>
              <p className="text-xs text-muted-foreground">Adjust fees based on volatility</p>
            </div>
            <ToggleGroup
              options={[
                { label: "No", value: "no" },
                { label: "Yes", value: "yes" },
              ]}
              value={settings.enableDynamicFee ? "yes" : "no"}
              onChange={(v) => update("enableDynamicFee", v === "yes")}
              testIdPrefix="toggle-dynamic-fee"
            />
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Fee Collection Token</p>
              <p className="text-xs text-muted-foreground">Which token(s) to collect fees in</p>
            </div>
            <ToggleGroup
              options={[
                { label: "SOL Only", value: "1" },
                { label: "Both Tokens", value: "0" },
              ]}
              value={settings.collectFeeMode}
              onChange={(v) => update("collectFeeMode", v)}
              testIdPrefix="toggle-collect-fee"
            />
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Fee Decay Mode</p>
              <p className="text-xs text-muted-foreground">Fees start at {settings.maxExtract ? "99%" : "50%"} and decay to your tier over 24h</p>
            </div>
            <ToggleGroup
              options={[
                { label: "Exponential", value: "1" },
                { label: "Linear", value: "0" },
              ]}
              value={settings.baseFeeMode}
              onChange={(v) => update("baseFeeMode", v)}
              testIdPrefix="toggle-fee-mode"
            />
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                Max Extract
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary/15 text-primary leading-none">
                  New!
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Start fee decay from 99% instead of 50%
              </p>
            </div>
            <ToggleGroup
              options={[
                { label: "No", value: "no" },
                { label: "Yes", value: "yes" },
              ]}
              value={settings.maxExtract ? "yes" : "no"}
              onChange={(v) => update("maxExtract", v === "yes")}
              testIdPrefix="toggle-max-extract"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        type="button"
        className="w-full"
        size="lg"
        onClick={handleSave}
        data-testid="button-save-settings"
      >
        <Save className="w-4 h-4 mr-2" />
        Save Settings
      </Button>
    </div>
  );
}
