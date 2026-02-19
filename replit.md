# Meteora DAMMv2 Position Opener

## Overview
A Solana DeFi frontend application that enables users to create custom liquidity positions on Meteora's DAMMv2 constant-product AMM. Uses Privy embedded wallet authentication for a seamless one-click pool creation experience on Solana mainnet.

## Architecture
- **Frontend-only** application (no backend/database needed for core functionality)
- Express server handles serving the Vite frontend
- Privy for authentication + embedded Solana wallets
- Meteora CP-AMM SDK for pool creation
- Solana web3.js for blockchain interactions

## Key Files
- `client/src/App.tsx` - Main app with Privy provider setup, auth flow
- `client/src/components/LoginScreen.tsx` - Login page with Privy auth
- `client/src/components/Dashboard.tsx` - Wallet info, balance, navigation
- `client/src/components/OpenPositionForm.tsx` - Pool creation form with fee config
- `client/src/components/ThemeToggle.tsx` - Dark/light mode toggle
- `client/src/hooks/useConnection.ts` - Solana RPC connection singleton
- `client/src/hooks/useCpAmm.ts` - Meteora CpAmm SDK instance
- `client/src/hooks/useEmbeddedWallet.ts` - Privy embedded wallet access
- `client/src/hooks/useTheme.ts` - Theme state management
- `client/src/utils/sendTransaction.ts` - Transaction signing/sending helpers
- `client/src/utils/tokenUtils.ts` - Token mint info, formatting utilities
- `client/src/polyfills.ts` - Buffer/process/global polyfills for Solana SDK

## Technical Notes
- Privy Solana hooks (`useWallets`, `useSignTransaction`) are imported from `@privy-io/react-auth/solana` (subpath export)
- `@solana-program/memo` is stubbed locally (peer dep of Privy, version conflict with @solana/kit v5)
- Buffer/process/global polyfills required for @coral-xyz/anchor (used by Meteora SDK)
- `toSolanaWalletConnectors()` generates a non-fatal "Invalid hook call" warning from browser wallet extension detection - this is expected
- Pool creation uses `Keypair.generate()` for positionNftMint, partial-signed before Privy wallet signs
- All token amounts use BN (BigNumber), scaled by token decimals

## Environment Variables
- `VITE_PRIVY_APP_ID` - Required. Privy application ID from dashboard.privy.io
- `VITE_SOLANA_RPC_URL` - Optional. Defaults to `https://api.mainnet-beta.solana.com`

## Setup Requirements
1. Create app at dashboard.privy.io
2. Set VITE_PRIVY_APP_ID as an environment variable
3. Whitelist the Replit domain in Privy's allowed domains
4. Restart the application

## Design
- Inter font, dark mode by default
- Purple primary color (#676FFF / hsl 262 83% 58%)
- Clean DeFi aesthetic with cards for content sections
