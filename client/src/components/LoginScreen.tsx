import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "./ThemeToggle";
import { Loader2, Wallet, Droplets } from "lucide-react";

export function LoginScreen() {
  const { login, ready } = usePrivy();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2">
          <Droplets className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">Meteora Position Opener</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-md bg-primary/10 mb-4">
              <Droplets className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Meteora DAMMv2
            </h1>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Open custom liquidity positions on Meteora's constant-product AMM with one click.
            </p>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2 text-center">
                <p className="text-sm text-muted-foreground">
                  Sign in to get your embedded Solana wallet and start providing liquidity.
                </p>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={login}
                disabled={!ready}
                data-testid="button-login"
              >
                {!ready ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Wallet className="w-4 h-4 mr-2" />
                )}
                {!ready ? "Loading..." : "Sign In"}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Use email, Google, Twitter, Discord, or connect an existing Solana wallet.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Auto Wallet", desc: "Embedded Solana wallet created on login" },
              { label: "Custom Fees", desc: "Configure base & dynamic fee schedules" },
              { label: "One Click", desc: "Create pool + position in a single tx" },
            ].map((feature) => (
              <div
                key={feature.label}
                className="text-center space-y-1 p-3 rounded-md bg-card border border-card-border"
              >
                <p className="text-xs font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
