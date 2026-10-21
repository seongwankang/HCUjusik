# Production economy v1

Daily operating income = (unit sale price - unit production cost) * daily production capacity.
This is the amount used by the existing revenue events, ordinary dividends, spies, forecasts and revenue rankings. Historical settlement receipts are immutable and are not recomputed.

| Investment | Cost | Effect |
| --- | ---: | --- |
| Factory | 2,000,000 | +1,500 units/day; +25 staff places |
| Production equipment | 1,000,000 | -75 unit production cost, floor 300; +10 staff places |
| R&D | 500,000 | +50 unit sale price (5% of base 1,000); 6 centers maximum |
| Employee | 100,000 | +50 units/day, subject to existing staff capacity |

No purchases: sale price 1,000, production cost 600, production capacity zero, income zero. Basic staff capacity remains 10.

The unchanged version-4 investment ledger remains the authority for atomic purchases and facility destruction. Its factory/equipment/staff Revenue fields are legacy technology ledger units, NOT daily cash. The new model converts 440,000 factory units to 1,500 output units, 200,000 equipment units to a 75 cost reduction, and 20,000 staff units to 50 output units. R&D changes selling price; there is no final x2 multiplier. Pending investment activates at the existing 07:55 cutoff. Old additive research balances do not mint production. Facility efficiency events modify the relevant factor; revenue events modify the resulting operating income and expire under the existing settlement-count system.

A first-day budget of 20,000,000 consists of 10,000,000 startup capital plus up to 10,000,000 of actual initial share proceeds. Unsold shares do not generate fictional issuer cash. Exhaustive tests enumerate every affordable factory/equipment/research/staff combination and verify daily income <= 50% of actual investment. The highest is 9,712,500 (48.5625%): 7 factories, 3 equipment, 6 R&D centers, no staff; unit price 1,300, unit cost 375, output 10,500. This is a natural policy balance, not a payout clamp. Event grants, discounts and positive effects, or later reinvestment, can change these assumptions.

## Startup capital migration

Trusted job mode production-economy-initialize adds exactly 10,000,000 to each company's existing cash; it does not replace cash or reset facilities, shareholders, IPO proceeds, people or historical receipts. Private companyCapitalGrants/production-v1/companies/{id} receipts and cash updates are one transaction. Concurrent/repeated jobs do not double-pay. Negative company cash remains valid. Locked settlements fail for retry rather than overwriting the payout. Maintenance prevents grants.

The global private policy receipt initializes the existing economyConfig/main to the balanced default catalogue once. The regular full job funds later-created companies as well. A company created after today's settlement time starts with today already marked complete, preventing retroactive income. No Firebase security-rule schema changes are needed: grants use existing IAM, clients retain their existing exact investment and cash proofs, and private grant receipts default to denied.

## Manual market closure

The market remains closed until the user requests reopening. The client has no automatic reopening time. The trusted close job invalidates both today's and tomorrow's daily-band eligibility, so the already-published Rules reject placements/fills from old browsers too. It preserves orders, reservations, company listing state and assets; cancellation is still possible. Regular jobs re-enforce closure but continue operations/settlement and rankings. Reopening must restore normal calendar policy and republish valid daily bands before enabling clients. The separate historical reset freeze remains unchanged.
