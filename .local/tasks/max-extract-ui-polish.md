# Max Extract UI Polish

## What & Why
Two small visual improvements to the Max Extract setting in the pool settings page.

## Done looks like
- Max Extract row appears at the bottom of the settings list, below "Fee Decay Mode" (currently it sits between Fee Tier and Dynamic Fee)
- The Max Extract row has a small "New!" badge or label next to the title to draw attention to the feature

## Out of scope
- Any functional or logic changes

## Tasks
1. **Reorder and badge the Max Extract row** — Move the Max Extract toggle block so it appears after the Fee Decay Mode row (last item in the card). Add a small "New!" indicator (e.g. a styled `<span>` or badge) inline next to the "Max Extract" label.

## Relevant files
- `client/src/components/PoolSettings.tsx`
