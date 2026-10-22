# Shareholder ownership projection

Account positions and sparkBooks.treasuryShares remain the ownership ledger. The manager-only companyShareholders documents are projections, not account records.

The existing five-minute event job now checks book versions and rebuilds only changed companies. GitHub scheduling/queue delays can extend this interval. Each rebuild transaction reads the book and a query of positive positions for that company, then publishes only names, opaque investor keys and share counts. It verifies holderShares + treasuryShares === issuedShares. Concurrent fills retry the transaction; inconsistent ledgers leave the previous snapshot intact and fail the job. Existing names are reused to avoid repeated profile reads. No account balance, position, order or trade is written.

Rankings no longer overwrite shareholder projections from independently timed account/book reads. The manager UI reads current treasury shares from the book and marks stale per-investor quantities as awaiting aggregation. Permissions remain manager-only; no new account access is granted.

The shareholders-only job refreshes projections without events, settlement or issuance. The one-off ops/shareholder-refresh-2026-10-23.json marker triggers this mode. Tests cover sale of 50 additional shares, subsequent fills, unchanged refreshes, privacy, no asset mutation, conservation failure and reset lock.
