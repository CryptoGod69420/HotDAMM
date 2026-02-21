# Meteora DAMMv2 Position Opener

## Overview
A Solana DeFi frontend application that enables users to create custom liquidity positions on Meteora's DAMMv2 constant-product AMM. Uses Privy embedded wallet authentication for a seamless one-click pool creation experience on Solana mainnet.

## Architecture
- **Frontend-only** application (no backend/database needed for core functionality)
- Express server handles serving the Vite frontend
- Privy for authentication + embedded Solana wallets
- Jupiter v6 API for SOL-to-token swaps
- Meteora CP-AMM SDK for pool creation
- Solana web3.js for blockchain interactions

## Key Files
- `client/src/App.tsx` - Main app with Privy provider setup, auth flow
- `client/src/components/LoginScreen.tsx` - Login page with Privy auth
- `client/src/components/Dashboard.tsx` - Wallet info, balance, token search bar, pool creation trigger
- `client/src/components/Portfolio.tsx` - Portfolio view showing user positions with claim fees and close position actions
- `client/src/components/PoolSettings.tsx` - Fee & pool config form, deposit amount, saves to localStorage
- `client/src/components/ThemeToggle.tsx` - Dark/light mode toggle
- `client/src/hooks/useConnection.ts` - Solana RPC connection singleton
- `client/src/hooks/useCpAmm.ts` - Meteora CpAmm SDK instance
- `client/src/hooks/useEmbeddedWallet.ts` - Privy embedded wallet hook
- `client/src/hooks/useTheme.ts` - Theme state management
- `client/src/utils/jupiter.ts` - Jupiter v6 swap API (quote + swap execution)
- `client/src/utils/sendTransaction.ts` - Transaction signing utilities (generic + pool creation specific)
- `client/src/utils/tokenUtils.ts` - Token mint info, formatting utilities
- `client/src/polyfills.ts` - Buffer/process/global polyfills for Solana SDK

## User Flow
1. User logs in via Privy (email, Google, wallet, etc.)
2. Dashboard shows wallet info, balance, and a token search bar
3. User clicks "Settings" to preconfigure fee schedule, deposit amount (SOL), and pool parameters - saved to localStorage
4. User pastes a token contract address (CA) in the search bar
5. Token info appears with an "Open Position" button
6. Clicking "Open Position" triggers a 2-step automated process:
   a. Jupiter swaps half the SOL deposit into the target token
   b. Meteora DAMMv2 pool is created with the swapped tokens + remaining SOL
7. Portfolio view shows all active positions with:
   - "Claim Fees" button: Claims unclaimed LP fees from a position via Meteora SDK `claimPositionFee`
   - "Close Position" button: Removes all liquidity, closes the position via `removeAllLiquidityAndClosePosition`, then auto-swaps remaining non-SOL tokens back to SOL via Jupiter

## Technical Notes
- User only needs SOL in wallet - the app handles token acquisition via Jupiter swap
- Jupiter v6 API (https://quote-api.jup.ag/v6) handles SOL→token swaps with dynamic priority fees
- Privy Solana hooks (`useWallets`) are imported from `@privy-io/react-auth/solana` (subpath export)
- `@solana-program/memo` is stubbed locally (peer dep of Privy, version conflict with @solana/kit v5)
- Buffer/process/global polyfills required for @coral-xyz/anchor (used by Meteora SDK)
- `toSolanaWalletConnectors()` generates a non-fatal "Invalid hook call" warning from browser wallet extension detection - this is expected
- Pool creation uses `createCustomPoolWithDynamicConfig` with Meteora static configs (not `createCustomPool`)
  - Static configs add the config key to the pool PDA seeds: `tokenAMint + tokenBMint + config`
  - This allows multiple pools per token pair (up to 6 per collectFeeMode+dynamicFee combo)
  - Fee schedule is hardcoded: 50% starting fee (5000 bps) → 5% ending fee (500 bps) over ~22 hours (79200s)
  - Config is auto-selected based on collectFeeMode and dynamicFee settings
  - If a pool PDA already exists, the app automatically retries with alternative config keys
  - `poolCreatorAuthority` is set to default (zero key) since static configs are public
  - Config lookup is in `client/src/utils/meteoraConfigs.ts`
- `Keypair.generate()` used for positionNftMint, partial-signed before Privy wallet signs
- All token amounts use BN (BigNumber), scaled by token decimals
- Pool creation flow requires 2 transactions: Jupiter swap + Meteora pool creation

## Environment Variables
- `VITE_PRIVY_APP_ID` - Required. Privy application ID from dashboard.privy.io
- `VITE_JUPITER_API_KEY` - Required. Jupiter API key from portal.jup.ag for swap transactions
- `VITE_SOLANA_RPC_URL` - Optional. Custom Solana RPC URL (mainnet). Takes priority over VITE_GATEKEEPER_RPC_URL
- `VITE_GATEKEEPER_RPC_URL` - Optional. Alternative RPC URL fallback. Defaults to `https://api.mainnet-beta.solana.com`

## Setup Requirements
1. Create app at dashboard.privy.io
2. Set VITE_PRIVY_APP_ID as an environment variable
3. Whitelist the Replit domain in Privy's allowed domains
4. Restart the application

## Design
- Inter font, dark mode by default
- Purple primary color (#676FFF / hsl 262 83% 58%)
- Clean DeFi aesthetic with cards for content sections
