# Replit Build Prompt: Meteora DAMMv2 Position Opener with Privy Auth

## PROJECT OVERVIEW

Build a React + Vite web app that lets users log in with social accounts or Solana wallets via Privy, which auto-generates a dedicated Solana embedded wallet for each user. The app's core feature is a form that allows users to configure and open a Meteora DAMMv2 (cp-amm) liquidity pool position with one click.

---

## TECH STACK

- **Framework:** React + Vite (TypeScript)
- **Auth & Wallets:** `@privy-io/react-auth` (latest)
- **Solana SDK:** `@solana/web3.js` v1 (NOT v2)
- **Meteora SDK:** `@meteora-ag/cp-amm-sdk` (latest, currently v1.3.3)
- **Additional deps:** `@coral-xyz/anchor`, `@solana/spl-token`, `bn.js`, `decimal.js`

---

## ENVIRONMENT VARIABLES (store in Replit Secrets)

```
VITE_PRIVY_APP_ID=your_privy_app_id_here
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

> Note: Replace RPC URL with a Helius or QuickNode endpoint for mainnet. For testing, use devnet.

---

## SETUP SEQUENCE — READ BEFORE BUILDING

Build the entire app first without stopping to ask for credentials. Use these temporary placeholder values during the build:

```
VITE_PRIVY_APP_ID=placeholder_will_be_provided
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

When the build is complete, pause and prompt the user with exactly this message:

> "Build complete. Before testing, I need you to do 3 things:
> 1. Paste your Privy App ID into Replit Secrets as `VITE_PRIVY_APP_ID`
> 2. Add `localhost:5173` to your allowed domains at dashboard.privy.io
> 3. Optionally replace `VITE_SOLANA_RPC_URL` in Secrets with your Helius mainnet RPC URL (leave as-is to test on devnet first)
>
> Let me know when those are done and I'll verify the setup."

Do not prompt for any credentials before or during the build — only after it is fully complete.

---

## PRIVY SETUP

### Installation
```bash
npm install @privy-io/react-auth
```

### PrivyProvider Configuration (main.tsx or App.tsx)

```tsx
import { PrivyProvider } from '@privy-io/react-auth';

<PrivyProvider
  appId={import.meta.env.VITE_PRIVY_APP_ID}
  config={{
    loginMethods: ['email', 'google', 'twitter', 'discord', 'wallet'],
    appearance: {
      theme: 'dark',
      accentColor: '#676FFF',
    },
    embeddedWallets: {
      createOnLogin: 'users-without-wallets', // Auto-create embedded wallet on login
      requireUserPasswordOnCreate: false,
      noPromptOnSignature: false,
    },
    // IMPORTANT: Set Solana as the default chain type
    defaultChain: { id: 101, name: 'Solana Mainnet' },
    supportedChains: [],
  }}
/>
```

### Getting the Embedded Solana Wallet

```tsx
import { useSolanaWallets } from '@privy-io/react-auth';

function useEmbeddedWallet() {
  const { wallets, ready } = useSolanaWallets();
  
  // The embedded Privy wallet always has walletClientType === 'privy'
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === 'privy'
  );
  
  return { embeddedWallet, ready };
}
```

### Sending a Solana Transaction via Privy Embedded Wallet

The Privy Solana embedded wallet uses a provider interface modeled after Phantom's `PhantomProvider`. To sign and send a transaction built with `@solana/web3.js`:

```tsx
import { useSolanaWallets } from '@privy-io/react-auth';
import { 
  Connection, 
  Transaction, 
  VersionedTransaction,
  PublicKey 
} from '@solana/web3.js';

async function sendSolanaTransaction(
  wallet: ConnectedSolanaWallet,
  transaction: Transaction | VersionedTransaction,
  connection: Connection
) {
  const provider = await wallet.getProvider();
  
  // Get blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  
  if (transaction instanceof VersionedTransaction) {
    transaction.message.recentBlockhash = blockhash;
  } else {
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = new PublicKey(wallet.address);
  }

  // signAndSendTransaction is the correct method for Privy Solana provider
  const { signature } = await provider.request({
    method: 'signAndSendTransaction',
    params: {
      transaction: transaction,
      connection: connection,
      sendOptions: { skipPreflight: false, preflightCommitment: 'confirmed' },
    },
  });

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');

  return signature;
}
```

> **IMPORTANT PRIVY SOLANA NOTE:** The Privy provider for Solana does NOT use `eth_sendTransaction`. It uses `signAndSendTransaction` (matching Phantom's interface). The wallet address is available as `wallet.address` (a base58 string). Convert it to a `PublicKey` with `new PublicKey(wallet.address)`.

---

## METEORA DAMMv2 (cp-amm) SDK

### Installation
```bash
npm install @meteora-ag/cp-amm-sdk @solana/web3.js @coral-xyz/anchor @solana/spl-token bn.js decimal.js
```

### Key facts
- **Package name:** `@meteora-ag/cp-amm-sdk` (NOT `damm-v2-sdk`)  
- **Main export:** `CpAmm` class  
- **Program ID (mainnet & devnet):** `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`

### SDK Initialization

```ts
import { Connection } from '@solana/web3.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';

const connection = new Connection(import.meta.env.VITE_SOLANA_RPC_URL);
const cpAmm = new CpAmm(connection);
```

### Pool Configuration Options

The user can either:
1. **Use an existing config key** (standard pool via `createPool`) — simpler, uses Meteora's predefined fee configs
2. **Create a custom pool** (via `createCustomPool`) — full control over fee params

**To fetch all available public config keys:**
```ts
const allConfigs = await cpAmm.getAllConfigs();
// Each config has: publicKey, account.poolFees, account.activationType, account.collectFeeMode
```

### Fee Parameter Types

```ts
// BaseFeeMode values:
// 0 = FeeTimeSchedulerLinear
// 1 = FeeTimeSchedulerExponential  
// 2 = RateLimiter
// 3 = FeeMarketCapSchedulerLinear
// 4 = FeeMarketCapSchedulerExponential

// ActivationType values:
// 0 = Slot
// 1 = Timestamp

// CollectFeeMode values:
// 0 = BothToken (collect fees in both token A and token B)
// 1 = OnlyA
// 2 = OnlyB
```

### Helper imports from the SDK

```ts
import {
  CpAmm,
  getBaseFeeParams,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
  getPriceFromSqrtPrice,
  BaseFeeMode,
  ActivationType,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
} from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
```

### Full Example: Create a Custom Pool + Open Position

This is the core SDK flow your app needs to implement:

```ts
import {
  CpAmm,
  getBaseFeeParams,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
  BaseFeeMode,
  ActivationType,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
} from '@meteora-ag/cp-amm-sdk';
import { Keypair, PublicKey, TOKEN_PROGRAM_ID } from '@solana/web3.js';
import BN from 'bn.js';

async function openPosition(params: {
  cpAmm: CpAmm,
  connection: Connection,
  walletPublicKey: PublicKey,
  // User-configured pool params:
  tokenAMint: PublicKey,
  tokenBMint: PublicKey,
  tokenAAmount: number,       // human-readable (e.g. 100)
  tokenBAmount: number,       // human-readable (e.g. 200)
  tokenADecimals: number,
  tokenBDecimals: number,
  baseFeeMode: BaseFeeMode,   // from UI dropdown
  startingFeeBps: number,     // e.g. 500 = 5%
  endingFeeBps: number,       // e.g. 25 = 0.25%
  feeDurationSeconds: number, // e.g. 300
  feeNumberOfPeriods: number, // e.g. 50
  enableDynamicFee: boolean,
  dynamicFeeMaxBps: number,   // e.g. 25
  collectFeeMode: number,     // 0, 1, or 2
  activationType: number,     // 0 = slot, 1 = timestamp
  activateNow: boolean,
}) {
  const {
    cpAmm, connection, walletPublicKey,
    tokenAMint, tokenBMint,
    tokenAAmount, tokenBAmount, tokenADecimals, tokenBDecimals,
    baseFeeMode, startingFeeBps, endingFeeBps, feeDurationSeconds, feeNumberOfPeriods,
    enableDynamicFee, dynamicFeeMaxBps,
    collectFeeMode, activationType, activateNow,
  } = params;

  // Convert human amounts to BN with decimals
  const tokenAAmountBN = new BN(tokenAAmount * Math.pow(10, tokenADecimals));
  const tokenBAmountBN = new BN(tokenBAmount * Math.pow(10, tokenBDecimals));

  // Calculate initial sqrt price and liquidity delta
  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount: tokenAAmountBN,
    tokenBAmount: tokenBAmountBN,
    minSqrtPrice: MIN_SQRT_PRICE,
    maxSqrtPrice: MAX_SQRT_PRICE,
  });

  // Build base fee params
  const baseFeeParams = getBaseFeeParams(
    {
      baseFeeMode: baseFeeMode, // e.g. BaseFeeMode.FeeTimeSchedulerExponential
      feeTimeSchedulerParam: {
        startingFeeBps: startingFeeBps,
        endingFeeBps: endingFeeBps,
        numberOfPeriod: feeNumberOfPeriods,
        totalDuration: feeDurationSeconds,
      },
    },
    tokenBDecimals,
    activationType === 1 ? ActivationType.Timestamp : ActivationType.Slot
  );

  // Build dynamic fee params (optional)
  const dynamicFeeParams = enableDynamicFee 
    ? getDynamicFeeParams(dynamicFeeMaxBps) 
    : undefined;

  const poolFees = {
    baseFee: baseFeeParams,
    padding: [],
    dynamicFee: dynamicFeeParams,
  };

  // Generate a new keypair for the position NFT mint
  const positionNftMint = Keypair.generate();

  // Create the pool + initial position
  const { tx, pool, position } = await cpAmm.createCustomPool({
    payer: walletPublicKey,
    creator: walletPublicKey,
    positionNft: positionNftMint.publicKey,
    tokenAMint,
    tokenBMint,
    tokenAAmount: tokenAAmountBN,
    tokenBAmount: tokenBAmountBN,
    sqrtMinPrice: MIN_SQRT_PRICE,
    sqrtMaxPrice: MAX_SQRT_PRICE,
    initSqrtPrice,
    liquidityDelta,
    poolFees,
    hasAlphaVault: false,
    collectFeeMode,
    activationPoint: activateNow ? null : new BN(Date.now()),
    activationType,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
  });

  // tx is a Transaction object — sign it with the Privy wallet
  // positionNftMint is a new Keypair that must ALSO sign the transaction
  // (see signing note below)
  
  return { tx, pool, position, positionNftMint };
}
```

### CRITICAL: Signing with Both Privy Wallet AND positionNftMint Keypair

When using `createCustomPool` or `createPool`, the transaction requires **two signers**:
1. The user's Privy embedded wallet (payer/creator)
2. The `positionNftMint` keypair you generated

Because Privy's embedded wallet can't directly add co-signers, handle this as follows:

```ts
async function signAndSendPoolCreation(
  wallet: ConnectedSolanaWallet,
  connection: Connection,
  transaction: Transaction,
  positionNftMint: Keypair
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new PublicKey(wallet.address);

  // Step 1: Have positionNftMint keypair sign first (it's a local keypair, no user prompt)
  transaction.partialSign(positionNftMint);

  // Step 2: Send to Privy for user's signature + broadcast
  const provider = await wallet.getProvider();
  const { signature } = await provider.request({
    method: 'signAndSendTransaction',
    params: {
      transaction,
      connection,
      sendOptions: { skipPreflight: false, preflightCommitment: 'confirmed' },
    },
  });

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}
```

### Fetching Pool State (for displaying position info after creation)

```ts
const poolState = await cpAmm.fetchPoolState(poolPublicKey);
// poolState.sqrtPrice, poolState.liquidity, poolState.tokenAMint, etc.

const userPositions = await cpAmm.getUserPositionByPool(poolPublicKey, walletPublicKey);
// Returns: [{ positionNftAccount, position, positionState }]
```

### Getting Unclaimed Fees on a Position

```ts
import { getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';

const { feeTokenA, feeTokenB } = getUnClaimLpFee(poolState, positionState);
```

---

## APP UI STRUCTURE

Build the following pages/components:

### 1. Login Screen
- Privy login button (triggers `login()` from `usePrivy()`)
- Shows social login options + wallet connect
- After login, show embedded wallet address

### 2. Main Dashboard
- Display user's Solana embedded wallet address and SOL balance
- Button: "Open New Position"
- List of user's existing positions (fetched via `cpAmm.getUserPositionByPool` or `cpAmm.getPositionsByUser`)

### 3. Open Position Form
All fields should have sensible defaults. Fields:

| Field | Type | Options/Default |
|-------|------|-----------------|
| Token A Mint | text input | e.g. USDC mint address |
| Token B Mint | text input | e.g. SOL mint address |
| Token A Amount | number | — |
| Token B Amount | number | — |
| Fee Mode | dropdown | Linear Scheduler / Exponential Scheduler / Rate Limiter / MarketCap Linear / MarketCap Exponential |
| Starting Fee (bps) | number | 500 (5%) |
| Ending Fee (bps) | number | 25 (0.25%) |
| Fee Duration (seconds) | number | 300 |
| Number of Fee Periods | number | 50 |
| Enable Dynamic Fee | checkbox | true |
| Dynamic Fee Max (bps) | number | 25 |
| Collect Fee Mode | dropdown | Both Tokens / Only Token A / Only Token B |
| Activation Type | dropdown | Slot / Timestamp |
| Activate Immediately | checkbox | true |

- "Open Position" button → calls `createCustomPool`, signs with Privy, shows tx link on Solscan

### 4. Position Detail View
- Pool address, current price (use `getPriceFromSqrtPrice`)
- Liquidity amount
- Unclaimed fees (use `getUnClaimLpFee`)
- Button: "Claim Fees" (calls `claimPositionFee`)
- Button: "Remove Liquidity" (calls `removeAllLiquidityAndClosePosition`)

---

## IMPORTANT GOTCHAS & NOTES

1. **Replit domain whitelisting:** In your Privy dashboard at `dashboard.privy.io`, add your Replit preview URL (e.g. `https://your-app.your-username.repl.co`) to the allowed domains list. Privy auth will not work without this.

2. **positionNftMint is a NEW keypair every time:** Generate it fresh with `Keypair.generate()` for each pool creation. Store the public key so you can reference the position later.

3. **BN for all amounts:** The SDK uses `bn.js` BN objects for all token amounts, sqrt prices, and liquidity. Never pass raw JavaScript numbers.

4. **MIN_SQRT_PRICE / MAX_SQRT_PRICE:** Import these constants directly from `@meteora-ag/cp-amm-sdk`. They represent full-range liquidity (equivalent to unconstrained price range in a constant-product AMM).

5. **Token decimals matter:** USDC = 6 decimals, SOL/wSOL = 9 decimals. Make sure to scale amounts correctly.

6. **Token Program IDs:** For standard SPL tokens use `TOKEN_PROGRAM_ID` from `@solana/spl-token`. For Token2022 tokens use `TOKEN_2022_PROGRAM_ID`. Your UI should auto-detect this by fetching the mint account and checking its owner program.

7. **Connection setup:** Create one shared `Connection` instance at the app level. Do not create new connections per component render.

8. **Privy `ready` check:** Always check `const { ready, authenticated } = usePrivy()` before attempting any wallet operations. Don't render wallet-dependent UI until `ready === true`.

9. **`createCustomPool` vs `createPool`:** 
   - `createPool` requires an existing config key from Meteora's predefined configs (use `cpAmm.getAllConfigs()` to list them)
   - `createCustomPool` lets you define all fee params yourself — use this for the custom configuration UI
   - `createCustomPoolWithDynamicConfig` is for launchpad use cases with a `poolCreatorAuthority`

10. **Transaction may require simulation first:** On devnet especially, wrap the transaction send in try/catch and display the error message if it fails. Log the full error for debugging.

---

## DEVNET TESTING NOTES

- Use `https://api.devnet.solana.com` as your RPC for testing
- Get devnet SOL from the Solana faucet: `solana airdrop 2 <your-address> --url devnet`
- For test tokens on devnet: use `https://faucet.raccoons.dev/` (Meteora's test token faucet)
- The Meteora program ID is the same on devnet: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`

---

## FILE STRUCTURE SUGGESTION

```
src/
  main.tsx              # PrivyProvider wrapping App
  App.tsx               # Router: Login | Dashboard | OpenPosition | PositionDetail
  hooks/
    useConnection.ts    # Shared Connection instance
    useEmbeddedWallet.ts # Gets Privy Solana embedded wallet
    useCpAmm.ts         # CpAmm instance
  components/
    LoginScreen.tsx
    Dashboard.tsx
    OpenPositionForm.tsx
    PositionCard.tsx
  utils/
    sendTransaction.ts  # Privy-aware transaction sender
    tokenUtils.ts       # Fetch token decimals, detect Token2022
```

---

## SDK REFERENCE LINKS (for additional context)

- Meteora cp-amm-sdk docs: https://docs.meteora.ag/developer-guide/guides/damm-v2/typescript-sdk/sdk-functions
- Privy React auth docs: https://docs.privy.io/guide/react
- Privy Solana wallet docs: https://docs.privy.io/guide/react/wallets/use-wallets
- Privy dashboard (to whitelist domains): https://dashboard.privy.io
