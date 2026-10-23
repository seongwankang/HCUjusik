# One-time participant cash grant

The participant-bonus-500k job freezes all current users with role student or president (including inactive participants) in the private participantGrants/participant-bonus-500000-2026-10-23-v1 document. Admin-only accounts and later registrations are excluded.

Each account receives 500,000 in additional cash. A transaction updates sparkAccounts cash and portfolio cash/version alongside a private per-user receipt. Existing negative balances are supported. Positions, reserved cash, reserved stock, open orders, initialCapital, company funds and signup defaults are unchanged. A missing trading account is initialized from its existing portfolio only if there are no legacy holdings. Invalid balances or maintenance stop the run for review.

Retries and simultaneous runs reuse the same roster and receipts. Each receipt verifies an exact +500,000 change in each cash representation. Partial failures resume with unpaid users; a failure publishing rankings can be retried without crediting again. Public logs contain aggregate totals only, never user IDs, names or balances. No credentials or real user records are stored in Git.
