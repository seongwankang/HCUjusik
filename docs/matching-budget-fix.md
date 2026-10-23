# Partial-fill recovery

A live crossed book with six entries (18 shares remaining on the buy and one on the sell) had valid price bands, funded reservations, active counterparties, correct indexes and matching private order records. An isolated emulator replay of the same historical state failed under the original rules with the 1,000-expression limit and succeeded with cached participant profile checks. No production account data is included in source or fixtures.

The rules now read the participant profile and token claims once per authorization check. Active status, verified school email/admin rules, amount and stock conservation, price/time priority, price limits, settlement locks, counterparty writes and immutable fills remain enforced. A synthetic regression covers one-share partial fills with 82 orders, 22 unrelated positions, negative seller cash and buyer/seller/third-party student execution. Unverified, other-domain and inactive accounts remain denied.

The exchange view continues to report an eligible cross as pending after a transient matching error. Visible trading screens retry with backoff (2, 4, 8, 16, at most 30 seconds) instead of stopping permanently or reading in a tight loop. Successful matching clears the retry. Existing orders are not cancelled or repriced.

Validation: historical state fails original rules and passes optimized rules; synthetic partial-fill and adversarial daily-band rule tests pass; 257 unit tests pass with three obsolete manual-closure tests skipped because main has already reopened the market; local UI verifies retry after a transport error, increasing delay and stopping once matched; site build passes. The security rule update is deployed before the client bundle.
