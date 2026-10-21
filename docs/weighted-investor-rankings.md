# Investor total ranking

Total ranking score = cash + floor(sum(holding quantity * current displayed reference quote) * 4 / 5).
The quote is the same smoothed market quote used by the company screen, not the initial issue price or a single last fill. All holdings (including sell reservations) are counted once; cash includes reserved cash once. BigInt arithmetic prevents rounding overflow.

The independent cash and full stock-value tables remain available. This changes the competition score, not account cash, shares or dividend rights. The ranking screen calls the value a ranking amount and shows the formula. A mismatched old snapshot is immediately due for replacement. Trusted scheduled publication and administrator publication use the same function. Publication stays atomic with public profiles, and private account access does not change.
