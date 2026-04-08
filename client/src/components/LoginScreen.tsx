import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "./ThemeToggle";
import { Loader2, Wallet } from "lucide-react";
import hotDammLogo from "@assets/ChatGPT_Image_Feb_19,_2026,_03_43_00_PM_1771544839266.png";

export function LoginScreen() {
  const { login, ready } = usePrivy();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2">
          <img src={hotDammLogo} alt="Hot DAMM!" className="w-10 h-10" />
        </div>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <img src={hotDammLogo} alt="Hot DAMM!" className="w-36 h-36 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Some like it cold. We like it Hot. Welcome to HotDAMM!
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
                className="text-center space-y-1 p-3 rounded-md bg-card border border-card-border shadow-sm"
              >
                <p className="text-xs font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="p-4 text-center text-xs text-muted-foreground">
        made with ❤️ by krispy.
      </footer>
    </div>
  );
}
