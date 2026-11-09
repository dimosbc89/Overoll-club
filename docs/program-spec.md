# Overoll Club — Program spec (v0.1)

Status: working draft, 9 Nov 2026. Decided by GROW; Overoll HQ has agreed to the project.
All numbers live in `packages/core/src/config.ts` and can be changed by HQ later without code changes to the apps.

## 1. Decisions so far

| Topic | Decision |
| --- | --- |
| Name | **Overoll Club** (working name; final name before launch, it is a setting) |
| Stores | 10 confirmed so far (9 Athens, 1 Thessaloniki, `data/stores.json`); Overoll says 11–20, Nicosia to confirm. One program, same rules everywhere, decided by HQ |
| Average spend | €5–8 per visit |
| POS | Unknown. Version 1 does **not** integrate with the POS: staff type the receipt total on the staff console |
| Delivery orders | Not decided. Built behind a switch, **off at launch**; decide after the pilot |
| Existing customers | Overoll's newsletter list is a marketing task for later, not part of the launch |
| Landing page | Own subdomain `club.<overoll domain>`: the web app's home page is the landing page; the counter QR opens `/join?store=<code>` (domain and DNS from Overoll) |
| Pilot store | **Chalandri** (Κατσουλιέρη 10): a neighbourhood store with regulars and calmer mornings than Praxitelous, so staff learn the flow without a queue |
| App store accounts | Published under GROW's Apple Developer and Google Play accounts (see risk in §10) |
| Deadline | All stores live by the week of **4 January 2027** |
| Reward cost | Carried by the store where the reward is redeemed; monthly report per store |

## 2. Glossary

- **Member**: a customer who joined Overoll Club.
- **Points**: earned on purchases, spent on rewards. Integer, never fractional.
- **Tier**: Classic, Gold, Club (working names), based on points earned in the last 12 months.
- **Reward**: an item from the catalog (e.g. free coffee) that costs points.
- **Redemption code**: a single-use code created when a member redeems a reward.
- **Staff console**: the screen at the till where staff scan members.
- **Member QR**: the code on the member's card (app, web app, Wallet pass).

## 3. Earning points

| Rule | Value |
| --- | --- |
| Base | **10 points per €1** of the receipt total, rounded down |
| Tier multiplier | Classic ×1.00 · Gold ×1.25 · Club ×1.50 |
| Welcome reward | Unlocked after the first purchase, once per member: a free butter croissant. Does not count towards tiers |
| Birthday | A free croissant valid during the birthday week (from v1.1, see roadmap) |
| Referral | +100 points to both, after the friend's first purchase (v1.1) |
| Streak | 3 visits in 7 days → +50 points (v1.1) |
| Quiet hours | Double points in time windows set per store (v1.1) |
| Launch weeks | Double points for the first 2 weeks after network launch |

Calculation (integer maths, no floating point):
`points = floor(amount_cents × 10 × multiplier_pct / 10 000)` where `multiplier_pct` is 100, 125 or 150. A bonus (e.g. double points = 200) multiplies on top. Implemented in `packages/core/src/points.ts`.

Example: €6.40 receipt, Gold member → floor(640 × 10 × 125 / 10 000) = 80 points.

## 4. Rewards

- Price rule: **points cost = shelf price in € × 140**, rounded to the nearest 50 → about 7% back on spend.
  - €2.50 coffee → 350 points (≈ €35 of purchases, about 5 visits at €6.50)
  - €3.50 croissant → 500 points (≈ €50, about 7–8 visits)
- Gold pays 20% fewer points, Club 30% fewer (rounded to the nearest 10).
- Some rewards can be limited to a tier ("Gold and above").
- Catalog of 7 rewards (espresso → croissant box) in `docs/menu-and-rewards.md`, approved 9 Nov. Shelf prices are the Wolt prices; HQ can change them later.

## 5. Tiers

| Tier | Points earned in last 12 months | Earn | Reward discount |
| --- | --- | --- | --- |
| Classic | 0 | ×1.00 | – |
| Gold | 1,500 | ×1.25 | 20% |
| Club | 4,000 | ×1.50 | 30% |

- Moving up is instant. Tiers are reviewed on the member's join anniversary and drop at most one level per year.
- "Points earned" counts earn and bonus entries minus their undos, not redemptions or HQ adjustments. The window is `tierWindowMonths` (12) in the config.
- Undoing an earn never lowers the tier straight away; the annual review does.

## 6. Expiry

- Points expire **12 months after the member's last purchase**. Any purchase resets the clock.
- 30 days and 7 days before expiry, the member gets a reminder.

## 7. Redemption flow

1. Member picks a reward in the app / web app → a redemption code is created, points are taken. Codes are 8 characters without look-alikes (no 0/O, 1/I); staff can type them with or without spaces and dashes.
2. The code is valid for **15 minutes**. The member can cancel before use and gets the points back.
3. Staff scan the code on the staff console → it is marked used, with store and employee.
4. The cashier rings the item on the POS as a 100% discount line (keeps receipts correct for AADE/myDATA).
5. Unused codes expire automatically and the points return.

## 8. Fraud limits

| Limit | Value |
| --- | --- |
| Member QR in app / web | Rotates every 30 seconds, works offline; codes one step (30 s) either side are accepted for clock differences |
| Wallet pass QR | Static but signed member code (Wallet can't rotate offline); reissuing the pass kills the old code; staff see the member's first name |
| Max receipt total per transaction | €80 |
| Max earn transactions per member per day | 5 (network-wide, Athens calendar day) |
| Double scans | Same member can't earn twice within 2 minutes |
| Undone earns | Don't count towards the daily limit or the 2-minute rule, so a cashier can fix a typo straight away |
| Undo | Last transaction within 10 minutes (store device, with an employee PIN); older needs the store manager or HQ |
| Staff identity | Every action is tied to an employee PIN |
| Refunds | Points taken back; balance may go negative |
| Alerts | Same employee + same member more than 3 times a day; awards above €50 |

## 9. Roles

| Role | Can do |
| --- | --- |
| Platform admin (GROW) | Everything, all brands |
| HQ admin (Overoll) | Whole network: rules, rewards, stores, staff, members, messages, reports |
| Store manager | Own store: dashboard, employees, transactions, undo older than 10 minutes |
| Store device | The till tablet/phone: scan, award, redeem, undo within 10 minutes, with an employee PIN |
| Member | Own card, points, rewards, profile, data export and deletion |

## 10. Risks and how we handle them

| Risk | Plan |
| --- | --- |
| Apple guideline 4.2.6: apps made from a template platform should be submitted by the business itself, not the agency | Launch does not depend on the app (web + Wallet work alone). Submit under GROW with Overoll's written authorization; if Apple refuses, transfer the app to an Overoll account |
| App review slower around Christmas | Submit native apps by 14 December |
| Staff don't ask customers to join | Counter QR stands, 15-minute training, monthly prize for the store with most sign-ups |
| Christmas peak in the pilot store | Pilot starts 7 December, before the peak; code freeze 21 Dec – 3 Jan except fixes |

## 11. Still open

- [ ] Final program name, points name, tier names
- [x] Reward catalog (`docs/menu-and-rewards.md`), approved; Wolt prices used
- [x] Welcome reward: free butter croissant, approved
- [ ] Delivery orders: on or off after the pilot
- [x] Pilot store: Chalandri
- [x] Store list: launch with the 10 stores in `data/stores.json`; more stores can be added from the back office
- [x] Logo files, colours, fonts from the website project (`docs/brand.md`)
- [x] Club tier stays as is (×1.50 earn, 30% cheaper rewards), decided 9 Nov
- Newsletter list: deferred to marketing, not needed for launch
