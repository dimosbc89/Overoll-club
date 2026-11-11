# Koala Club (Koala Coffee)

Second brand on the platform. Dimos decided on 11 Nov 2026 to build it for launch (not as a demo), on its own Supabase project.

| What | Where |
| --- | --- |
| Brand slug | `koala` |
| Supabase project | `rkyoynrsimtotdirqkns` (koala-club, eu-central-1, GROW Agency org), settings in `supabase/projects/koala.json` |
| Data | `data/koala/` (brand, stores, menu, rewards) → `supabase/seed/koala.sql`, applied once by CI on the first deploy |
| Design | Figma `MHtMmw4vUc80oY5PuaBytx` (Koala Club — loyalty app concept), official logo mark `assets/brand/koala/` |
| Pitch deck | https://claude.ai/artifact/3rpyBDM6n5R9CPucpx3TWH |
| Web app / back office | `koala-club.pages.dev` / `koala-club-admin.pages.dev` until Koala has a domain |

## Programme

Same rules as Overoll (`packages/core` defaults): 10 points per €1; tiers Joey (classic) 0 / Koala (gold) 1.500 / Eucalyptus (club) 4.000 points in 12 months, ×1.00 / ×1.25 / ×1.50, rewards −0 / −20 / −30 %; codes valid 15 minutes; minimum age 15; points expire 12 months after the last purchase. Welcome gift: cinnamon roll, 30 days.

Reward catalog (draft, efood prices of 11 Nov 2026, costs from `packages/core`):

| Reward | Shelf price | Joey | Koala | Eucalyptus |
| --- | ---: | ---: | ---: | ---: |
| Espresso ή ελληνικός | €2.20 | 300 | 240 | 210 |
| Καφές της επιλογής σου | €2.80 | 400 | 320 | 280 |
| Χειροποίητη πίτα | €3.10 | 450 | 360 | 320 |
| Cookie ή muffin | €3.30 | 450 | 360 | 320 |
| Κρουασάν με πραλίνα | €3.40 | 500 | 400 | 350 |
| Cinnamon roll (welcome gift) | €4.00 | 550 | 440 | 390 |
| Sandwich ή τορτίγια | €5.10 | 700 | 560 | 490 |
| Κέικ ή yogurt bowl | €5.30 | 750 | 600 | 530 |
| Καφές + χειροποίητη πίτα | €5.90 | 850 | 680 | 600 |

## Before launch: needed from Koala

- [ ] Approve the reward catalog and the in-store prices (we used efood prices).
- [ ] Confirm the welcome gift (cinnamon roll is on efood only for Αργυρούπολη).
- [ ] Opening hours of both stores (not published anywhere).
- [ ] Programme and tier names (Koala Club, Joey, Koala, Eucalyptus).
- [ ] Domain for the club site and the back office, and a sender address for the sign-in email (Resend + DNS). Until then the sign-in email only reaches Supabase org members.
- [ ] Legal entity for the terms and privacy policy (vrisko lists "KOALA - ΔΗΜΟΓΕΡΟΝΤΑ ΕΕ" for Αργυρούπολη; confirm for both stores).
- [ ] Official wordmark (we have the koala mark only).
- [ ] Whether efood orders earn points; tablet or phone at each till.
