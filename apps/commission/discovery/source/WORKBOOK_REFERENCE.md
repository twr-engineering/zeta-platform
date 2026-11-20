# WORKBOOK REFERENCE — ZETA GCI Calculator + Collections v30.20 (verified extraction)

This file is the verified, structured extraction of the source workbook. It was produced by dumping every sheet (values + formulas) with openpyxl and re-deriving all money math with decimal arithmetic. Use it together with the task prompt (`/root/zeta/prompt.md`). Where the workbook and prompt disagree, the DISCREPANCY REGISTER at the bottom lists it — flag those in Open Questions, do not silently resolve.

## 1. Sheet inventory (tab order)
Start Here, Settings, Deal Log, Payments Log, Collectibles, Collections Dashboard, Source Performance, Collection Reports, Yield Summary, GCI Calculator, Search Console.
Capacity: 1,000 deals (Deal Log rows 6–1004... actually range refs run to 1004/1005), 1,000 payments. Only BLUE cells editable; computed columns ARRAYFORMULA-driven and locked. Legend: Blue = input, Black = formula, Green = linked from another tab.

## 2. Settings sheet (named ranges in parentheses)
- VAT rate (VATRate) = 0.12 — "Output VAT on commission (BIR standard 12%)."
- EWT rate (EWTRate) = 0.10 — "creditable, Form 2307. 10% individual broker; 5% if ≤₱3M sworn declaration."
- VAT threshold = 3,600,000 — "BIR RR 1-2024 dwelling threshold — Threshold-rule types are exempt at or below this List price."
- Chase idle threshold (ChaseIdleMonths) = 3 — "Chase list flags ⚠ chase when months idle ≥ this."
- PROPERTY TYPES (PropertyTypeList), each with VAT Rule: House & Lot=Threshold, Condo=Threshold, Townhouse=Threshold, Lot=Always VAT, Commercial=Always VAT, Parking=Always VAT, Condotel=Threshold. "Add a row to introduce a new type (appears in Deal Log dropdown automatically)." Rule values supported: Threshold / Always VAT / Always Exempt.
- DEVELOPERS (DeveloperList) with Comm Base: Megaworld GERI=Gross, CLI=Net, Abrown Inc.=Net, Pueblo de Oro=Net, Weecomm=Net. "Comm Base: Gross (rate applies to gross TCP, e.g. Megaworld) or Net (net-of-VAT price). Default Net."
- LEAD SOURCES (rows B155:B204, 50 slots, blanks ignored): Referral, Repeat Client, Sphere / Personal Network, Open House, Sign Call / Walk-in, Facebook Organic, Facebook Ads, TikTok, YouTube, Instagram, LinkedIn, Website, Lamudi. "Feeds the Source dropdown in the Deal Log."
NOTE: these lists are SEED EXAMPLES for the importer — user-configurable per workspace, never hard-coded product defaults.

## 3. Deal Log (columns B–AJ, header row 5, data rows 6–1004)
Columns (I=input, C=computed):
B Deal ID (permanent value, Apps-Script auto "D001…"; never renumbered) | C Date (I) | D Transaction Type (I: Sale/Rental) | E Deal Type (I: Developer/Resale/N/A) | F Developer (I, dropdown from Settings) | G Client / Counterparty (I) | H Agent Representation (I: Double Ended/Seller/Buyer/Lessor/Lessee/Referrer) | I Property Type (I, dropdown) | J Source (I, dropdown from LEAD SOURCES) | K Property Details (I) | L Mode of Payment (I: Cash/Bank/Pagibig/Deferred Cash) | M List Price ₱ (I) | N Force VAT? (I: Yes/blank) | O Property VAT (C: VAT-able/Exempt/n/a) | P Net List Price (C) | Q Basis (I: %/Fixed) | R Rate % (I) | S Fixed ₱ (I) | T Comm Base (C from Developer; N/A for non-developer or unreceipted) | U Receipt Issued? (I: Yes/No; resale/rental default No) | V VAT Basis (comm.) (C/I: Inclusive/Exclusive/N/A) | W Commission GCI (Net of VAT) (C) | X Incentive ₱ as billed (I) | Y Incentive Taxable? (I: Yes/No/blank; blank=Yes) | Z Incentive (Net of VAT) (C) | AA Referral Out % (I) | AB Referral Out Fixed ₱ (I) | AC Referral Out ₱ (C = AA×billed + AB) | AD NET GCI (Net of VAT) (C = W + Z − AC) | AE Referral Paid? (I) | AF VAT (memo) (C = AD×VAT? see note) | AG EWT (memo) (C) | AH Yield on List (C = AD ÷ M) | AI Year (C from Date) | AJ "Deal + Client" dropdown helper (C: "D002 — Samia Bulao").
Header note (verbatim, key rules): "Property VAT auto-computes per BIR RR 1-2024 (developer sales). Force VAT? = Yes for the adjacent-property trap. Developer drives Comm Base automatically. Comm Base and VAT Basis show N/A when no receipt is issued (untaxed). For developer deals, Client/Counterparty = the actual unit buyer. Referrer deals sit on their own Yield-Summary line. Incentive = developer bonus on top of commission (as billed; VAT rules follow the deal). Referral Out = fee you pay a 3rd party (% of commission and/or fixed) — NET GCI is what you actually earn; mark Referral Paid? once settled. Incentive Taxable? = No means the incentive carries no VAT/EWT (entered as-is, excluded from tax memos); blank/Yes = follows the deal's receipt rules."
VAT/EWT memo basis: verified against data — AF = (W+Z_taxable)×12% where Z counts only when taxable; concretely for D021 AF = 42,551.02 = 354,591.84×12% (NET GCI includes no referral out on D021). For D004 (referral out, untaxed) AF=0. The memo base in all live taxable rows = GCI + taxable incentive (no referral-out present on any taxable row) — the prompt states memo = GCI(+incentive)×rate; on referral-out interaction see DISCREPANCY 7.

### Live deals (test fixtures; rows sorted by date, IDs permanent — note D006/D007 out of ID order)
| ID | Date | Txn | Type | Developer | Client | Rep | PropType | Source | MoP | List ₱ | PropVAT | NetList | Basis | Rate/Fixed | CommBase | Rcpt | VATBasis | GCI(NetVAT) | Incentive | IncTax | Inc(Net) | RefOut | NET GCI | VATmemo | EWTmemo | Yield |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D001 | 2026-01-01 | Sale | Resale | — | Ni Trading Inc. | Double Ended | Lot | Lamudi | Cash | 8,721,000 | n/a | 8,721,000 | % | 5% | N/A | No | N/A | 436,050 | | | | | 436,050 | 0 | 0 | 5% |
| D002 | 2026-02-09 | Sale | Resale | — | Samia Bulao | Double Ended | House & Lot | Repeat Client | Cash | 2,530,000 | n/a | 2,530,000 | % | 5% | N/A | No | N/A | 126,500 | | | | | 126,500 | 0 | 0 | 5% |
| D003 | 2026-02-26 | Sale | Resale | — | Maria Victoria Tacogue | Seller | Lot | Repeat Client | Bank | 2,350,000 | n/a | 2,350,000 | % | 5% | N/A | No | N/A | 117,500 | | | | | 117,500 | 0 | 0 | 5% |
| D004 | 2026-03-10 | Sale | Resale | — | Mndanao Korean Baptist | Double Ended | House & Lot | Referral | Bank | 17,500,000 | n/a | 17,500,000 | % | 5% | N/A | No | N/A | 875,000 | | | | Fixed 75,000 (Paid=Yes) | 800,000 | 0 | 0 | 4.5714% |
| D005 | 2026-03-16 | Sale | Resale | — | Shang Lagrosas | Double Ended | House & Lot | Repeat Client | Bank | 13,500,000 | n/a | 13,500,000 | % | 5% | N/A | No | N/A | 675,000 | | | | | 675,000 | 0 | 0 | 5% |
| D008 | 2026-04-07 | Sale | Developer | CLI | Jessica Cequina | Double Ended | Condo | Repeat Client | Bank | 6,955,300 | VAT-able | 6,210,089.29 | % | 5% | Net | Yes | Inclusive | 277,236.13 | 45,000 | Yes | 40,178.57 | | 317,414.70 | 38,089.76 | 31,741.47 | 4.5636% |
| D017 | 2026-04-13 | Rental | N/A | — | Joy Trenholme | Lessor | House & Lot | Repeat Client | Cash | 270,000 | n/a | 270,000 | % | =1/12 (8.333%) | N/A | No | N/A | 22,500 | | | | | 22,500 | 0 | 0 | 8.333% |
| D018 | 2026-04-13 | Rental | N/A | — | Allan Ross Cumming | Double Ended | House & Lot | Repeat Client | Cash | 1,560,000 | n/a | 1,560,000 | % | 1/12 | N/A | No | N/A | 130,000 | | | | | 130,000 | 0 | 0 | 8.333% |
| D007 | 2026-04-15 | Sale | Resale | — | Eric Dominguiano | Double Ended | Lot | Repeat Client | Bank | 3,600,000 | n/a | 3,600,000 | % | 5% | N/A | No | N/A | 180,000 | | | | | 180,000 | 0 | 0 | 5% |
| D019 | 2026-05-12 | Rental | N/A | — | Carla Dy | Lessor | House & Lot | Repeat Client | Cash | 120,000 | n/a | 120,000 | % | 1/12 | N/A | No | N/A | 10,000 | | | | | 10,000 | 0 | 0 | 8.333% |
| D020 | 2026-05-12 | Rental | N/A | — | Moret Montilla | Lessor | House & Lot | Repeat Client | Cash | 450,000 | n/a | 450,000 | % | 1/12 | N/A | No | N/A | 37,500 | | | | | 37,500 | 0 | 0 | 8.333% |
| D006 | 2026-05-20 | Sale | Resale | — | Helen Chin | Buyer | House & Lot | YouTube | Cash | 7,050,000 | n/a | 7,050,000 | % | 5% | N/A | No | N/A | 352,500 | | | | | 352,500 | 0 | 0 | 5% |
| D009 | 2026-06-25 | Sale | Developer | Megaworld GERI | Marianne Canedo | Double Ended | Condo | Facebook Organic | Bank | 12,048,370 | VAT-able | 10,757,473.21 | % | 3% | Gross | Yes | Inclusive | 322,724.20 | | | | | 322,724.20 | 38,726.90 | 32,272.42 | 2.6786% |
| D010 | 2026-06-26 | Sale | Developer | Abrown Inc. | Broderick Arcilla | Double Ended | Lot | Lamudi | Deferred Cash | 7,011,000 | VAT-able | 6,259,821.43 | % | 7% | Net | Yes | Inclusive | 391,238.84 | 40,000 | Yes | 35,714.29 | | 426,953.13 | 51,234.38 | 42,695.31 | 6.0898% |
| D011 | 2026-06-27 | Sale | Developer | Megaworld GERI | Jeralyn So | Double Ended | Lot | YouTube | Bank | 12,359,740 | VAT-able | 11,035,482.14 | Fixed | 174,500 | Gross | Yes | Inclusive | 155,803.57 | | | | | 155,803.57 | 18,696.43 | 15,580.36 | 1.2606% |
| D012 | 2026-06-29 | Sale | Developer | Megaworld GERI | Angel Tactay | Double Ended | Lot | YouTube | Bank | 13,218,975 | VAT-able | 11,802,656.25 | Fixed | 231,500 | Gross | Yes | Inclusive | 206,696.43 | | | | | 206,696.43 | 24,803.57 | 20,669.64 | 1.5636% |
| D013 | 2026-06-30 | Sale | Developer | CLI | Lainie Vale | Double Ended | Condo | YouTube | Bank | 19,500,600 | VAT-able | 17,411,250 | % | 5% | Net | Yes | Inclusive | 777,287.95 | 145,000 | Yes | 129,464.29 | | 906,752.23 | 108,810.27 | 90,675.22 | 4.6499% |
| D014 | 2026-06-30 | Sale | Developer | CLI | Lainie Vale | Double Ended | Condo | YouTube | Bank | 7,956,500 | VAT-able | 7,104,017.86 | % | 5% | Net | Yes | Inclusive | 317,143.65 | 95,000 | Yes | 84,821.43 | | 401,965.08 | 48,235.81 | 40,196.51 | 5.0520% |
| D015 | 2026-06-30 | Sale | Developer | CLI | Lainie Vale | Double Ended | Parking | YouTube | Bank | 1,601,600 | VAT-able | 1,430,000 | % | 5% | Net | Yes | Inclusive | 63,839.29 | 15,000 | Yes | 13,392.86 | | 77,232.14 | 9,267.86 | 7,723.21 | 4.8222% |
| D016 | 2026-07-04 | Sale | Developer | Pueblo de Oro | Jun Castrodes | Double Ended | Lot | Sphere / Personal Network | Bank | 15,377,860 | VAT-able | 13,730,232.14 | % | 5% | Net | Yes | Inclusive | 612,956.79 | 20,000 | Yes | 17,857.14 | | 630,813.93 | 75,697.67 | 63,081.39 | 4.1021% |
| D021 | 2026-07-10 | Sale | Developer | Abrown Inc. | Daria & John Salon | Double Ended | House & Lot | YouTube | Bank | 8,000,000 | VAT-able | 7,142,857.14 | % | 5% | Net | Yes | Inclusive | 318,877.55 | 40,000 | Yes | 35,714.29 | | 354,591.84 | 42,551.02 | 35,459.18 | 4.4324% |

(D001's computed cells lost their cache in the export — its row hosts the ARRAYFORMULA anchor — but its values are recoverable and consistent: untaxed resale, GCI = NET GCI = 436,050 = 5% × 8,721,000; the 436,050 payment in the Payments Log and the all-time planning-basis numbers confirm it.)
IDs D001–D021 exist except none missing; 21 deals total. Rows are date-sorted, not ID-sorted (D006, D007 sit out of sequence) — proof IDs are permanent, not positional.

## 4. Payments Log (header row 5, data rows 6–1005)
Inputs: B Date, C Deal ID (dropdown shows "D001 — Client"; helper column R strips to clean ID; a picker-cleanup Apps Script optionally trims on entry), H Gross Commission ₱ (as billed), I Type (blank = Commission; "Incentive" for standalone incentive release; live data uses explicit "Commission" too), O OR/Invoice/Note.
Computed from the referenced deal: D Deal Year (booking year), E Developer, F Client/Buyer, G Property Details, J VAT Basis, K Commission (Net of VAT), L VAT, M EWT, N Net Cash, P Year(paid), Q Month(paid), R clean Deal ID helper.
Split rules (verified): Inclusive → K = H÷1.12, L = H−K, M = K×EWTRate, N = H−M. N/A (untaxed) → K=H, L=M=0, N=H. Incentive-type payment where deal's Incentive Taxable?=No → L=M=0. Retained Cash = H−L−M (dashboard-level concept). Nonexistent Deal ID → row computes nothing (typo safeguard).
Live payments (8):
| Date | Deal | Gross | Type | VAT Basis | Net of VAT | VAT | EWT | Net Cash |
|---|---|---|---|---|---|---|---|---|
| 2026-01-13 | D001 | 436,050 | Commission | (N/A — cache lost on anchor row) | 436,050 | 0 | 0 | 436,050 |
| 2026-07-03 | D004 | 875,000 | Commission | N/A | 875,000 | 0 | 0 | 875,000 |
| 2026-07-04 | D017 | 22,500 | Commission | N/A | 22,500 | 0 | 0 | 22,500 |
| 2026-07-05 | D018 | 130,000 | Commission | N/A | 130,000 | 0 | 0 | 130,000 |
| 2026-07-06 | D019 | 10,000 | Commission | N/A | 10,000 | 0 | 0 | 10,000 |
| 2026-07-07 | D020 | 37,500 | Commission | N/A | 37,500 | 0 | 0 | 37,500 |
| 2026-07-08 | D006 | 352,500 | Commission | N/A | 352,500 | 0 | 0 | 352,500 |
| 2026-07-09 | D021 | 50,000 | Incentive | Inclusive | 44,642.86 | 5,357.14 | 4,464.29 | 45,535.71 |

## 5. Collectibles (one auto row per deal, mirrors Deal Log; header row 5, rows 6–1005)
Columns: B Deal ID | C Year (booked) | D Developer | E Client/Buyer | F Property Details | G Deal Type | H Booked NET GCI (earned) | I Total Collectible (cash in) = Confirmed Collectible if entered else booked GCI | J Status (INPUT: Open/Closed/Cancelled) | K Collected (Net of VAT) = Σ payments K for the deal (commission AND incentive payments both count) | L Balance = I − K (open basis) | M % Coll. = K÷I | N Variance (Closed: K − I) | O Last Payment = MAXIFS(payment date by deal) | P Months Idle = DATEDIF(last payment, today, "m"), blank if Closed/Cancelled or no payment | Q Chase Priority (cached values = Balance + row×10⁻⁶ — a sortable key: largest balance first, row index as epsilon tiebreaker) | R Confirmed Collectible (INPUT, turns the cell blue when used) | S Payor (chase helper) | T Next Action / Follow-up (INPUT; surfaces on Dashboard chase list) | U Booking Date helper | V Age Months helper = months since last payment, else since booking; blank when Closed/Cancelled | W First Payment = MINIFS | X Days to 1st Release = W − U | Y Source helper = VLOOKUP(deal → Deal Log col J) — feeds Source Performance.
Header doctrine (verbatim): "Booked NET GCI = earned after referral-outs; Total Collectible = full cash you expect in (you pay referrers separately — tracked on the Dashboard)."
Verified state: D004 → H 800,000, I 875,000, Closed, K 875,000, Variance 0. D021 → H=I=354,591.84 (Total Collectible includes the booked net incentive), Open, K 44,642.86 (the incentive release counts as collected), L 309,948.98, %12.59. D001 → Closed. D017/D018/D019/D020/D006 → Closed, variance 0. All others Open with K=0.
NOTE: v30.20 removed per-deal cash-reconciliation columns (Collected Gross/Output VAT/EWT/Net Cash/Retained) from this sheet; that detail lives ONLY in the Payments Log, period totals in Collection Reports.

## 6. Collections Dashboard (single "Dashboard year (paid)" filter cell C4 = 2026)
Section 1 — POSITION (all deals): Total Collectible = ΣI; Total Collected Net = ΣK; Balance Outstanding = ΣL; % = ΣK/ΣI; Written-off (Cancelled) = Σ(I−K) over Cancelled; Variance realized (Closed) = Σ(K−I) over Closed; Net Cash received = Σ Payments N; Referral fees owed out = Σ Deal Log AC where AC>0 AND Referral Paid?≠Yes, with "across N deal(s)".
Section 2 — COLLECTED vs TARGET (selected year): Annual GCI target D15 = manual override E15 if set, else ROUNDUP(NetIncomeTarget_year ÷ (1−Opex%−CoS%), −4) from the GCI Calculator TargetTable; Collected Net (year, from payments); % of target; Pace to date = MIN(1, MAX(0, (TODAY()−Jan1+1) ÷ days-in-year)) × target (day-accurate); vs pace → "ahead"/"behind".
Section 3 — CASH & TAX (all collected): Gross ΣH; less Output VAT ΣL; less EWT ΣM; Net Cash ΣN; Retained = Gross−VAT−EWT. Note: "Net Cash = Gross − EWT (bank). Retained = also net of the VAT you owe. EWT comes back as an income-tax credit (Form 2307)."
Section 4 — AGING of open balances (uses helper V, open deals with balance>0): buckets <1, 1–3, 3–6, 6+ months; count, balance, % of outstanding; total ties to Balance Outstanding.
Section 5 — RECEIVABLES BY DEVELOPER: per developer — deals w/ balance (open, bal>0), Balance, Collected Net (all statuses), % Collected = collected ÷ Σ collectible for that developer, Avg Days → 1st Release = AVERAGE(X helper); plus a "Resale / Rental (no developer)" row (Developer = blank) and TOTAL.
Section 6 — MONTHLY CASH-IN (selected year): per month Collected Net (ΣK), Net Cash (ΣN), # payments, cumulative collected, cumulative target = target×n/12, +/- vs target.
Section 7 — DATA HEALTH: (a) deals with no Status set; (b) fully paid but not marked Closed (open, balance ≤ 0); (c) Closed deals short/over by more than ₱0.50 (|Variance| > 0.5); (d) referral fees not yet paid out; (e) Property Type missing from Settings (deals affected) → "⚠ VAT falls back to Always-VAT — restore the type in Settings"; (f) Developer missing from Settings → "⚠ Comm Base falls back to Net — restore the developer in Settings".
Section 8 — CHASE LIST: every open balance, largest first (sorted by Chase Priority), showing Deal ID, Client, Balance, Last Payment, Months Idle, Follow up? (= "no payment yet" if never paid, "⚠ chase" if idle ≥ ChaseIdleMonths, else "ok"), Developer, Booked GCI, Next Action (edited in Collectibles). Warning row if >30 open balances.

## 7. Source Performance (Year filter B3 = "All" or a booking year)
One row per Settings lead source (B155:B204 → rows 5–34), aggregating COLLECTIBLES by Source helper Y: Deals (count), Booked NET GCI (ΣH), % of NET GCI (÷ grand total C35), Avg NET GCI/deal, Collected NET = Booked − Outstanding (F = C − H(col)), % Collected, Outstanding NET (ΣL), Resale+Rental NET GCI (ΣH where Deal Type≠Developer), Resale+Rental Outstanding, Developer/Pre-selling NET GCI (ΣH where Deal Type=Developer). TOTAL row sums. Year filter compares Collectibles C (booking year). Note Collected is DERIVED (booked − outstanding), not summed from payments.

## 8. Collection Reports
Report 1 — CASH COLLECTED PER YEAR (paid year rows 2020–2030): Net of VAT (ΣK), Net Cash (ΣN), Output VAT (ΣL), EWT (ΣM), # payments.
Report 2 — COLLECTION × BOOKING-YEAR MATRIX: rows = year paid, columns = deal booking year (2020–2030), value toggle F5 = "Net of VAT" (ΣK) or "Net Cash" (ΣN); "Diagonal = collected in the year booked; below diagonal = pre-selling collection tail." Row totals.
Report 3 — MONTHLY CASH FLOW (selected year C5): per month Net of VAT + Net Cash.
Report 4 — TAX COLLECTED PER MONTH (selected year): Output VAT (to remit), EWT withheld (2307 credit), Net of VAT base, # payments.
Report 5 — BOOKING-YEAR SUMMARY: per booking year — Deals, GCI (Net of VAT), Collected, Outstanding.

## 9. Yield Summary
Report-year filter C4 (booked year or "All"). Segments and exact criteria (COUNTIFS/SUMIFS on Deal Log):
- Resale: Transaction=Sale AND Deal Type=Resale AND Representation<>Referrer.
- Developer: Sale AND Developer AND <>Referrer.
- SALES SUBTOTAL = Resale + Developer (feeds calculator).
- Rental (on rent): Transaction=Rental AND <>Referrer. Share of Sales = "—".
- Referral (fees): Representation=Referrer (any transaction type), own line, excluded from all other segments.
Per segment: Deals, Volume = Σ List Price, GCI = Σ NET GCI (col AD), Realized Yield = GCI÷Volume, Share of Sales = segment volume ÷ sales volume.
TOTAL GCI (ALL OPERATIONS) = sales + rental + referral GCI. Memo: Incentives (+) = ΣZ, Referral-outs (−) = ΣAC (year-filtered).
Avg prices: Resale avg = vol÷deals; Developer avg; BLENDED SALE avg price = sales vol ÷ sales deals; Rental annual GCI (YTD) = rental GCI.
PLANNING BASIS (all-time, ignores the year filter): All-time blended yield = all-time sales NET GCI ÷ all-time sales volume (named AllTimeYield); All-time blended avg price = volume ÷ deals (AllTimePrice). Current live values: 17 sales deals, volume ₱159,280,945, NET GCI ₱6,488,497.25, blended yield 4.0736% (0.040736...), avg price ₱9,369,467.35.

## 10. GCI Calculator (named ranges: PlanYear=D4, TargetTable=B42:G48, AllTimeYield, AllTimePrice)
- Planning Year D4 = 2026. Per-year TARGETS table rows 2026–2032: Net Income Target, Opex %, CoS %, Yield (blank=all-time), Avg Price (blank=all-time). Only 2026 filled: NIT 11,500,000, Opex 22%, CoS 10%.
- Net Income % D5 = 1 − Opex − CoS (VLOOKUP defaults: opex 0.22, cos 0.10 when blank/0). GCI raw target E8 = NIT ÷ NetIncome% = 16,911,764.71. Working GCI goal F8 = ROUNDUP(E8, −4) = 16,920,000 (auto round-UP to nearest ₱10,000).
- Average Sales Price D10 = per-year override else AllTimePrice (9,369,467.35). Average Commission D11 = per-year override else AllTimeYield (4.0736%). Professional Fees per deal D12 = D10 × D11 = 381,676.31 ("price × yield (no /1.12)").
- GOAL rows: GCI Yearly = F8, Monthly = ÷12, Weekly = Monthly ÷ 4 (i.e., ÷48/yr). Net Income likewise.
- Total Listings SOLD D19 = F8 ÷ D12 = 44.33; Buyer ATP D30 = D19. Both broken Yearly/Monthly(÷12)/Weekly(÷4 of monthly).
- Seller funnel (divide upward): Listings to take = SOLD ÷ 25% (Listing-to-Sold); Listing Appointments = ÷ 70%; Seller Contacts = ÷ 30%; Seller Leads = ÷ 20%. Buyer funnel: Viewings = ATP ÷ 30%; Buyer Contacts = ÷ 70%; Buyer Leads = ÷ 10%. All rates editable inputs.
- Total Sales target J8 = D10 × D30 (≡ GCI goal ÷ blended yield). YTD ACTUAL SALES J9 = Σ List Price of (Sale, <>Referrer, Year=PlanYear) PLUS (Rental, <>Referrer, Year=PlanYear) — rentals' annual-rent volume IS included. BALANCE J10 = J8 − J9.
- Hidden scratch block Q7:T13 (labels "Cost of Sale calculation", "GCI" 892,858, "Amount paid to Agency"): a graduated 80/20–90/10–98/2 split table with breakpoints 123,000/250,000 and effective-rate output — a side calculation justifying the CoS assumption, not part of the planning model.

## 11. Search Console
Filters (blue): What to search C4 = Deals/Collectibles/Payments; Year C5 (booked for deals/collectibles, paid for payments); Deal ID C6; Status C7 (Collectibles only); Only with balance? C8 (Collectibles only); Text contains C9 (searches client + property, case-insensitive SEARCH); Sort C10 = Default / Date (oldest) / Amount (high→low).
Result columns — Deals: ID, Date, Transaction, Deal Type, Developer, Client, Property, NET GCI (default sort: date newest first; amount sort on NET GCI). Payments: Date, Deal ID, Client, Property, Gross, Net of VAT, Net Cash (default newest first). Collectibles: ID, Client, Property, Deal Type, Total Collectible, Collected, Balance, Status (sorted balance high→low). Empty result → "No matching records — adjust your filters above." Read-only; a helper column R lists all deal IDs for the dropdown.

## 12. Start Here doctrines (verbatim anchors, reproduce in relevant PRDs)
- Flow: Deal Log → Yield Summary → GCI Calculator (rate AND avg price link live). Collections: Collectibles → Payments Log → Dashboard; Source Performance; Collection Reports.
- Philosophy: "track total commission owed per deal vs cash actually collected = balance left. No forecasting of buyer-to-developer payment cycles." Reactive logging. Only blue cells editable.
- Property VAT (RR 1-2024, developer sales only), threshold/always rules, Force VAT? adjacent-property toggle (2+ adjacent units, same developer, same buyer, 12 months, aggregate over threshold — one deliberate toggle, no automation).
- Agent Representation definitions incl. Referrer ("represent NEITHER side; referral fee; own Yield-Summary line").
- Client/Counterparty: party you represent; Double Ended → primary contact (seller, or developer-sale buyer); Referrer → the party introduced. Rate % = the rate you actually earn net of co-broke.
- Mode of Payment: Cash/Bank/Pagibig/Deferred Cash "for the collection-timing view: pre-selling Cash = current <1yr; Bank/Pagibig/Deferred = long-term; resale/rental all current."
- Receipt Issued?: resale/rental untaxed by default; Yes makes taxable.
- Closed vs Cancelled; balance on Net-of-VAT basis; Net Cash ties to bank.
- Commission VAT flag Inclusive/Exclusive + "Quick test": statement divides by 1.12 → Inclusive; adds 12% → Exclusive. Megaworld ex.: 3%×TCP = 322,369.80 billed; ÷1.12 = 287,830.18 income.
- Deal IDs permanent via Apps Script; payments picker cleanup script optional.
- COLLECTIBLE CORRECTIONS 3-case doctrine and WHAT TO BOOK doctrine (splits at source vs Referral Out; split-at-source is a resale pattern).

## 13. VERIFIED FIXTURES (decimal-arithmetic, reproduce to the centavo)
- D021: Net List 8,000,000÷1.12 = 7,142,857.14; billed 5% = 357,142.86; GCI = ÷1.12 = 318,877.55; incentive 40,000÷1.12 = 35,714.29; NET GCI 354,591.84; VAT memo 42,551.02; EWT memo 35,459.18; yield 4.4324%.
- D004: GCI 875,000; NET GCI 800,000; yield 4.5714%. Collectible: booked NET 800,000 but Total Collectible 875,000; Closed, Variance 0.
- D011 (Fixed on developer deal): 174,500 ÷ 1.12 = 155,803.57; VAT 18,696.43; EWT 15,580.36.
- D021 incentive payment: Gross 50,000 → Net 44,642.86 / VAT 5,357.14 / EWT 4,464.29 / Net Cash 45,535.71 / Retained 40,178.57. Counts toward Collected on the receivable (D021 Collected = 44,642.86; Balance = 309,948.98).
- Planning: 11,500,000 ÷ 0.68 = 16,911,764.71 → working goal 16,920,000; fees/deal 9,369,467.35 × 4.0736% = 381,676.31; deals needed 16,920,000 ÷ 381,676.31 = 44.33.
- D008 GCI 277,236.13, NET 317,414.70; D009 GCI 322,724.20 (Gross base: 3%×12,048,370=361,451.10 billed ÷1.12); D010 NET 426,953.13.

## 14. DISCREPANCY / OBSERVATION REGISTER (flag, don't resolve silently)
1. **Stale Start-Here text:** claims the ₱3.6M threshold "is an editable cell on Yield Summary"; in v30.20 it lives on Settings. Doc drift only.
2. **Chase Priority tiebreaker:** cached values = Balance + row-index×10⁻⁶ (row order ≈ booking order), while the prompt says "idle time as tiebreaker." Sheet evidence supports row-index epsilon; SaaS should decide (balance DESC, then idle DESC recommended) — open question M4/M6.
3. **YTD Actual Sales includes Rental volume** (Sale + Rental list prices for the plan year); prompt 3.7 mentions only sales. Open question M3.
4. **Working GCI goal auto-rounds**: F8 = ROUNDUP(raw target, −4) — automatic, not a user-entered rounded goal. Dashboard annual target repeats this ROUNDUP and allows a manual override cell. Document as a rule.
5. **Hidden scratch block** in GCI Calculator (Q7:T13 graduated agency-split table, GCI 892,858) — appears to be a personal side-calculation; exclude from product scope, confirm with owner (M3 open question).
6. **Exclusive VAT payment split** (from the prompt itself): how to interpret the gross payment figure for Exclusive deals — open question M1 + M5.
7. **VAT/EWT memo base vs Referral Out:** memo = (GCI + taxable incentive) × rate in all live rows; no live row combines a taxable deal with Referral Out, so whether the memo base nets out referral-outs is unverifiable from data (formulas are ARRAYFORMULA, cache-only). D021 memo ties exactly to NET GCI×12% with zero referral out. Open question M1: confirm memo base when Referral Out > 0 on a taxable deal (booked AF/AG appear to be computed on NET GCI which nets referral out).
8. **Settings-list deletion fallbacks** (from Data Health): missing Property Type → engine falls back to Always-VAT; missing Developer → Comm Base falls back to Net. In the SaaS, make these referential-integrity rules + soft-delete instead of silent fallbacks.
9. **Payments "Type"** stores explicit "Commission" in live rows even though blank is documented as commission — treat blank and "Commission" as equivalent on import.
10. **Source Performance "Collected NET"** is derived (Booked − Outstanding), not Σ payments; on Cancelled deals with partial collections the derived figure diverges from cash collected (balance stops mattering). Open question M7 (define Collected per source as Σ Collectibles.K instead — sheet uses C−H(col L sum)).
11. **Incentive cash vs booked incentive:** booked NET GCI includes incentive at its *booked* amount (÷1.12 when taxable); the actual release can differ (D021: booked 40,000 → 35,714.29 net; released 50,000 gross → 44,642.86 net). The receivable never adjusts booked; the gap lands in Variance at close. Document in M4.
12. **Rental rate 1/12** entered as a formula (=1/12 = 8.333%) in Rate % — SaaS should support precise fraction entry or a "1 month of annual rent" preset.
