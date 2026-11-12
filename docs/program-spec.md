# Overoll Club — Program spec (v0.1)

Status: working draft, 9 Nov 2026. Decided by GROW; Overoll HQ has agreed to the project.
All numbers live in `packages/core/src/config.ts` and can be changed by HQ later without code changes to the apps.

## 1. Decisions so far

| Topic | Decision |
| --- | --- |
| Name | **Overoll Club** (working name; final name before launch, it is a setting) |
| Stores | 10 confirmed so far (9 Athens, 1 Thessaloniki, `data/overoll/stores.json`); Overoll says 11–20, Nicosia to confirm. One program, same rules everywhere, decided by HQ |
| Average spend | €5–8 per visit |
| POS | Unknown. Version 1 does **not** integrate with the POS: staff type the receipt total on the staff console |
| Delivery orders | Not decided. Built behind a switch, **off at launch**; decide after the pilot |
| Existing customers | Overoll's newsletter list is a marketing task for later, not part of the launch |
| Web address | **`loyalty.overoll.gr`** (decided 9 Nov): landing page + member web app; the logged-out home page is the landing page; the counter QR opens `https://loyalty.overoll.gr/join?store=<code>`. Back office and till console: `admin.loyalty.overoll.gr`. Both on Cloudflare Pages |
| DNS and email | `overoll.gr` DNS is at Papaki, managed by Overoll's IT; their Microsoft 365 email and the `overoll.gr` SPF stay untouched. Sign-in codes are sent from **`app@overoll.gr`** (decided 9 Nov) via Resend (EU region, Ireland): DKIM on `resend._domainkey.overoll.gr` and Resend's return path on `send.overoll.gr`, so their own mail setup is unchanged (`docs/dns-records.md`) |
| Minimum age | 15 (GDPR digital consent age in Greece): "I am 15 or older" at sign-up (`minimumAge`) |
| Support email | `club-support@growagency.online` for testing; replace with Overoll's address before launch |
| Rejoining | A member who deleted their account can join again as a new member (old points are not restored) |
| Account deletion | In the app, Profile → Delete account (type ΔΙΑΓΡΑΦΗ / DELETE). At once: pending reward codes are cancelled **without giving the points back**, an unused welcome gift lapses, personal details are erased (name, email, mobile, birthday, contact choices), the card (app, web, Wallet) stops working and the sign-in account is deleted. The points history stays without personal data (stores' accounts); the points left simply expire 12 months after the last purchase. Only HQ still sees the erased record. The same email can join again later as a new member. "Download my data" comes later |
| Notifications | Service messages (points added, reward ready, points expiring, code expired) need no marketing consent; offers and news only with the email / SMS / push consent. Push also needs the phone's permission |
| Points after paying | Allowed: a customer who forgot to show the card can get the points later the same day, at the same store, by giving the receipt; the cashier enters the receipt number so a receipt earns points only once |
| Double points | **None**: no double-points weeks in the pilot or at launch (decided 9 Nov) |
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
| Welcome reward | A free butter croissant, unlocked by the first purchase, once per member, redeemed with a code like any reward; valid **30 days** after it unlocks (`welcome.validDays`). Not points: it never counts towards tiers. Which reward is a setting (`welcome.rewardId`; no setting = no welcome gift). It stays if that first purchase is undone. Only the very first purchase unlocks it |
| Birthday | A free croissant valid during the birthday week (from v1.1, see roadmap) |
| Referral | +100 points to both, after the friend's first purchase (v1.1) |
| Streak | 3 visits in 7 days → +50 points (v1.1) |
| Quiet hours | Possible later (v1.1+), only if HQ asks; not planned |

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
- HQ edits the catalog in the back office (v0.6): names, descriptions, in-store price, lowest tier, order, on/off. The point cost always follows the price through `rewardBaseCost` (never typed by hand); a new price leaves codes already made as they were. A reward switched off leaves the app at once; its codes stay valid until they expire. The welcome gift can't be switched off while it is the welcome gift.
- HQ also edits stores (names in Greek and English, address, phone, coordinates, opening hours), opens new ones and closes them. A store's code is fixed: it is printed in the counter QR. A closed store disappears from the app and its till stops earning; its people and history stay.

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

- Points expire **12 months after the member's last purchase**. Any purchase resets the clock. A member who never bought anything counts from the day they joined.
- A daily job takes the whole remaining balance off with one `expire` entry, once per member and expiry date. A member with a reward code still pending is done the next day. Points HQ adds after an expiry stay until 12 months after the next purchase.
- 30 days and 7 days before expiry, the member gets a reminder.
- The welcome gift has its own expiry (30 days, §3): an unused one simply expires.

## 7. Redemption flow

1. Member picks a reward in the app / web app → a redemption code is created, points are taken. Codes are 8 characters without look-alikes (no 0/O, 1/I); staff can type them with or without spaces and dashes, on a Greek or a Latin keyboard (Greek capitals that look Latin count as Latin).
2. The code is valid for **15 minutes**. The member can cancel before use and gets the points back.
3. Staff scan the code on the staff console → it is marked used, with store and employee.
4. The cashier rings the item on the POS as a 100% discount line (keeps receipts correct for AADE/myDATA).
5. Unused codes expire automatically and the points return.
6. The welcome gift works the same way, for 0 points: the member makes a code from the gift, staff scan it. If that code is cancelled or expires, the gift is available again (until the gift's own 30 days are over).

## 8. Fraud limits

| Limit | Value |
| --- | --- |
| Member QR in app / web | Rotates every 30 seconds, works offline; codes one step (30 s) either side are accepted for clock differences. The secret behind it stays on the member's device: Keychain / Keystore in the iOS and Android apps (this device only, never in backups), browser storage on the web; removed on sign-out |
| Wallet pass QR | Static but signed member code (Wallet can't rotate offline); reissuing the pass kills the old code; staff see the member's first name |
| Typed member code | When the card won't scan, the cashier types the 8-character member code printed under the QR (groups of 4; case, spaces, dashes and Greek look-alike capitals don't matter). It only identifies the member for points: staff check the first name shown, and rewards always need a redemption code from the member's app |
| Max receipt total per transaction | €80. For a bigger receipt the cashier enters €80: points up to the limit, no override |
| Max earn transactions per member per day | 5 (network-wide, Athens calendar day) |
| Double scans | Same member can't earn twice within 2 minutes |
| Points after paying | The receipt number earns points once per store per calendar day (Athens), for any member. An undone earn frees it again. All other limits still apply |
| Undone earns | Don't count towards the daily limit or the 2-minute rule, so a cashier can fix a typo straight away |
| Undo | Last transaction within 10 minutes (store device, with an employee PIN); older needs the store manager or HQ |
| Staff identity | Every action is tied to an employee. The cashier enters their PIN once per shift; the console locks after 5 idle minutes (`limits.staffPinIdleMinutes`) |
| PIN guessing | 5 wrong PINs for one employee within 15 minutes lock that employee for 15 minutes on every device (`limits.pinMaxAttempts`, `limits.pinLockMinutes`). The right PIN clears the count. Each lock is logged for HQ |
| Cashier PINs | HQ or the store manager sets each cashier's PIN in the back office: 4–6 digits (`limits.staffPinMinDigits`, `limits.staffPinMaxDigits`), not one repeated digit and not a run up or down such as 1234 or 9876 (core `staffPinProblem`). A new PIN also clears the cashier's wrong-PIN count |
| Refunds | Points taken back; balance may go negative |
| Alerts | Same employee + same member more than 3 times a day; awards above €50 |

## 9. Roles

| Role | Can do |
| --- | --- |
| Platform admin (GROW) | Everything, all brands |
| HQ admin (Overoll) | Whole network: rules, rewards, stores, staff, members, messages, reports |
| Store manager | Own store: dashboard, employees, transactions, undo older than 10 minutes |
| Store device | The till tablet/phone: scan, award, redeem, undo within 10 minutes, with an employee PIN |
| Member | Own card, points, rewards, profile, account deletion (data export later) |

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
- [x] Store list: launch with the 10 stores in `data/overoll/stores.json`; more stores can be added from the back office
- [x] Logo files, colours, fonts from the website project (`docs/brand.md`)
- [x] Club tier stays as is (×1.50 earn, 30% cheaper rewards), decided 9 Nov
- Newsletter list: deferred to marketing, not needed for launch
