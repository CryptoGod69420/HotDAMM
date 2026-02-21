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
  startingFeeBps: number;
  endingFeeBps: number;
  feeDurationSeconds: number;
  feeNumberOfPeriods: number;
  enableDynamicFee: boolean;
  dynamicFeeMaxBps: number;
  collectFeeMode: string;
  activationType: string;
  activateNow: boolean;
  enableFeeScheduler: boolean;
}

const DEFAULT_SETTINGS: PoolSettingsValues = {
  depositAmountSol: 0.2,
  baseFeeMode: "1",
  startingFeeBps: 5000,
  endingFeeBps: 500,
  feeDurationSeconds: 79200,
  feeNumberOfPeriods: 100,
  enableDynamicFee: true,
  dynamicFeeMaxBps: 25,
  collectFeeMode: "1",
  activationType: "1",
  activateNow: true,
  enableFeeScheduler: true,
};

export function loadSettings(): PoolSettingsValues {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (merged.collectFeeMode !== "0" && merged.collectFeeMode !== "1") {
        merged.collectFeeMode = "1";
      }
      merged.startingFeeBps = 5000;
      merged.endingFeeBps = 500;
      merged.feeDurationSeconds = 79200;
      merged.feeNumberOfPeriods = 100;
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
              <p className="text-sm font-medium">Fee Schedule</p>
              <p className="text-xs text-muted-foreground">50% starting fee → 5% over ~22 hours</p>
            </div>
            <span className="text-xs font-medium text-muted-foreground" data-testid="text-fee-schedule">Fixed</span>
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
                { label: "Quote (B)", value: "1" },
                { label: "Both", value: "0" },
              ]}
              value={settings.collectFeeMode}
              onChange={(v) => update("collectFeeMode", v)}
              testIdPrefix="toggle-collect-fee"
            />
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Fee Scheduler</p>
              <p className="text-xs text-muted-foreground">Gradually reduce fees over time</p>
            </div>
            <ToggleGroup
              options={[
                { label: "No", value: "no" },
                { label: "Yes", value: "yes" },
              ]}
              value={settings.enableFeeScheduler ? "yes" : "no"}
              onChange={(v) => update("enableFeeScheduler", v === "yes")}
              testIdPrefix="toggle-fee-scheduler"
            />
          </div>

          {settings.enableFeeScheduler && (
            <>
              <div className="h-px bg-border" />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Fee Scheduler Mode</p>
                  <p className="text-xs text-muted-foreground">How fees decrease over time</p>
                </div>
                <ToggleGroup
                  options={[
                    { label: "Linear", value: "0" },
                    { label: "Exponential", value: "1" },
                  ]}
                  value={settings.baseFeeMode}
                  onChange={(v) => update("baseFeeMode", v)}
                  testIdPrefix="toggle-fee-mode"
                />
              </div>
            </>
          )}
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
