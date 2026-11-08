# Menu, prices and the reward catalog (proposal)

Status: **proposal, 9 Nov 2026.** Dimos approves, then Overoll HQ confirms the in-store prices.

## Where the prices come from

The menus of all 10 stores on Wolt, read on 9 Nov 2026 (`data/menu.json`, 78 items). Prices are the same in every store, with four small exceptions in Thessaloniki (savoury croissants €0.10–0.20 cheaper or dearer) and two combo/frappe differences. Delivery-app prices can be higher than in the shop, so **Overoll must confirm the shop prices before we launch**. The reward costs below update by themselves when the shelf prices change (`npm run seed:generate`).

Typical visit: croissant €3.00–4.00 + coffee €2.20–2.70 ≈ **€5.50–6.50**, which matches the €5–8 average spend.

| Group | Examples (Wolt price) |
| --- | --- |
| Coffee | Espresso €2.20 · Cappuccino / Freddo espresso €2.50 · Flat white / Freddo cappuccino €2.70 · Matcha €4.20 |
| Sweet croissants | Butter €3.00 · Chocolate €3.40 · Praline / Cinnamon €3.70 · Almond €3.80 · Pistachio / Cheesecake €3.90 · Hazelnut €4.00 · Birthday cake €4.80 |
| Savoury croissants | Ham & cheese / Cheese pie €3.70 · Sausage roll €3.90 · Croque madame €4.20 · Scrambled egg €4.40 |
| Sandwiches | Mini brioche €3.50 · Classic delight €4.80 · Chicken parmesan / Focaccia caprese €5.80 |
| Combos | Daily Habit (croissant + coffee) €6.10 · Daily Break (sandwich + coffee) €7.80 |
| Boxes | Mini rolls box €10.00 · Croissant box (4) €14.00 · Mini rolls 24 pcs €27.00 |

## Reward catalog

Rule from the spec: points cost = shelf price × 140, rounded to the nearest 50. Gold pays 20% less, Club 30% less. Members earn 10 points per €1 (Gold ×1.25, Club ×1.50).

| Reward | Shelf price | Classic | Gold | Club | Spend to earn it (Classic) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Espresso or double Greek coffee | €2.20 | 300 | 240 | 210 | €30.00 |
| Any coffee (not matcha) | €2.70 | 400 | 320 | 280 | €40.00 |
| Butter croissant | €3.00 | 400 | 320 | 280 | €40.00 |
| Croissant of your choice (up to €4.00) | €4.00 | 550 | 440 | 390 | €55.00 |
| Sandwich of your choice | €5.80 | 800 | 640 | 560 | €80.00 |
| Croissant + coffee | €6.10 | 850 | 680 | 600 | €85.00 |
| Overoll Croissant Box (4) | €14.00 | 1950 | 1560 | 1370 | €195.00 |

At €6 a visit, a Classic member gets a free espresso after about 5 visits and a free coffee or butter croissant after about 7.

Value back on spend: Classic about 7%, Gold about 11%, Club about 15–16%. The Club figure is generous for a bakery margin; HQ may want Club at ×1.25 earn or a 20% discount instead. It is one setting in `packages/core/src/config.ts`.

"Choose any" rewards are priced at the most expensive item they cover, so the store never gives away more than the reward is worth. The seed script checks this.

## Welcome reward (proposal)

A **free butter croissant** after the first purchase, once per member. It is the signature product, costs the store less than a specialty coffee, and gives a reason to come back for a second visit. It does not count towards tiers. (The spec draft said espresso; this replaces it if Dimos agrees.)

## Not rewards

Matcha, smoothies, juices, bottled water, spreads and the 16/24-piece boxes stay out of the catalog: either low margin, sold mostly for delivery, or too expensive for a points reward. Members still earn points on them.

## Files

- `data/menu.json`: all items with Wolt prices (cents), stores listing each item.
- `data/rewards.json`: the catalog above, with the menu items each reward covers.
- `supabase/seed.sql`: generated from both by `npm run seed:generate`; `npm test` fails if it is out of date.
