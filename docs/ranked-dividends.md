# Ranked simulation dividends (rank-v1)

This replaces the operating-revenue distribution formula for new settlements. It is a simulation reward: investors receive a rank-based per-share reward, while the company's cost is independently computed from its operating revenue.

- Companies rank by the projected operating revenue used by that settlement, after applicable revenue/efficiency events. Equal revenue uses competition ranks (1, 1, 3). Rank 1 has base 150, decreasing by 5 per rank through rank 22 (base 45). Additional companies retain the minimum base 45.
- Per-share reward = floor(rank base * rateBps / 100). A 15% rate is the number 15 in this formula: first place pays 150 * 15 = 2,250 per owned share.
- Company charge = floor(operating revenue * rateBps / 10,000). Revenue 4,000,000 at 15% costs the company 600,000, independently of the investor payout and subscription level. Unsold shares receive no additional artificial company reward.
- Company closing cash = collected cash + revenue - company charge. Student credits remain quantity * per-share reward. The two sides are deliberately not a cash-conserving transfer.
- Configured/effective ranked rates are bounded at 10–30%. Existing lower/higher settings normalize to the nearest boundary, without resetting cash or the existing daily-change marker. New operation accounts start at 10%.

## Consistent settlement

At the first 07:55-or-later settlement, dividendRounds/d{KoreanDay} atomically freezes all company revenue/rate/rank inputs. It cannot subsequently be edited through client rules. Each company's day receipt records the frozen rank, base, rate, per-share amount, investor total and companyCharge. Later operating changes and the settlement order do not alter the frozen result. Existing locked old-formula payouts finish using their original receipts; already-completed settlements are never rewritten. New ranked operations fail closed if no rank context exists.

The trusted scheduled job resolves due choices and spy detection before freezing the round, then pays holders using the existing exactly-once per-holder receipts. Transfers from industrial spies continue to run after ordinary company revenue. The server still publishes dividendForecasts/main each scheduled pass. Interactive forecasts now rank a complete live set of company operations/effects at the same upcoming settlement time. They never substitute just the viewed company's fresh revenue into stale values for other companies. Existing live-document subscriptions and immutable effect caches reuse unchanged values. Forecasts are indicative; the immutable settlement round is authoritative. Forecasts before 07:55 refer to that morning; after the cutoff they refer to the next morning.

## Rate-change news and security

The 08:00-inclusive / 17:00-exclusive Korean window and one actual change per company/day remain. Assigned presidents and administrators use one transaction to change the rate, set lastDividendDay/lastDividendNews and create a news article. Rules enforce 10–30%, the window, assignment, unchanged cash and exact linked from/to/day metadata. Updating only the rate, forging a news item, editing another company, replaying a daily change or adding a cash mutation is denied. The news view renders the actual before/after percentage from the proven metadata. Legacy automatic normalization is a policy migration, not a user rate-change news event.

## Rollout

Publish the tested firestore.rules before enabling the client and the ranked-dividends-migrate trusted workflow. The migration changes only operation dividendModel/dividendBps and the policy marker; it publishes the upcoming forecast and never resets company/student balances or old payout history. Migrations are idempotent. Manual market closure stays in effect.

## Forecast ranking tables

Competition ties are 1,1,3: the third company uses base140, never145. Expected-revenue rankings expose revenueRank/rankBase and effective dividend rate from the same complete input population. The per-share dividend table independently ranks floor(rankBase × rateBps /100), with its own competition ties. Missing inputs suppress dividend coefficients rather than inventing a higher rank. Issuer proceeds, company cash, cumulative revenue and spy transfers do not determine the operating-revenue rank.
