---
title: Add Max Extract setting
---
# Max Extract Setting

## What & Why
Add a "Max Extract" toggle to the pool settings page. When enabled, the fee decay schedule starts at 99% (9900 bps) instead of the standard 50% (5000 bps). This lets users maximize early fee extraction from new pools before fees settle to their chosen tier.

## Done looks like
- Settings page has a "Max Extract" toggle (No/Yes) below the Fee Tier section
- The Fee Tier description updates to reflect whether decay starts from 50% or 99%
- When Max Extract is on, pool creation uses 9900 bps as the starting fee
- When Max Extract is off (default), pool creation uses 5000 bps as before
- Setting persists across sessions via localStorage

## Out of scope
- Any changes to the fee decay duration, periods, or end tier logic

## Tasks
1. **Add `maxExtract` to settings** — Add the `maxExtract: boolean` field to `PoolSettingsValues`, `DEFAULT_SETTINGS`, and the `loadSettings` merge. Export a helper `getStartingFeeBps(settings)` that returns 9900 when `maxExtract` is true, 5000 otherwise — replacing the hardcoded `FEE_SCHEDULE_START_BPS` constant usage.

2. **Add Max Extract toggle to UI** — Add a toggle row in `PoolSettings.tsx` (after the Fee Tier row) with No/Yes options, updating the Fee Tier description text dynamically based on the current `maxExtract` value.

3. **Wire dynamic starting fee into pool creation** — Update `Dashboard.tsx` and `OpenPositionForm.tsx` to call `getStartingFeeBps(settings)` with the loaded settings instead of the static `FEE_SCHEDULE_START_BPS` constant.

## Relevant files
- `client/src/components/PoolSettings.tsx`
- `client/src/components/Dashboard.tsx:33,282`
- `client/src/components/OpenPositionForm.tsx:23,178`