# Overoll Club v2 — design direction

Source: the redesign brief of 9 Nov 2026 (`docs/design-brief-v2.md`) and the Overoll website design
(`docs/design-ref/website-v2-reference.jpg`). A visual refinement of v1: same screens, flows and rules.
Built in the shared Figma file (GROW AGENCY team): https://www.figma.com/design/d7XLjDxLVN9sTfok1UfkIS

## What changes from v1

| v1 | v2 |
| --- | --- |
| Cream page background, white cards | **White** page; beige only for a few sections (gift, info, onboarding photo areas) |
| Grey-brown text (#48423e / #6b6560) | **Near-black** text (#171312); hierarchy from size and weight, not grey |
| Rounded cards (16/28 px), pill buttons | Thin lines, rows and dividers; 4 px radius on buttons and inputs, no card stacks |
| Pink fills for big areas | Pink and plum only for outlines, active states, labels, display headings, key CTA |
| Join on one long screen | 7-step onboarding: splash → welcome → how it works → rewards → registration → verification (+ your details) → success |
| No fixed chrome | Fixed white header with the logo + bottom navigation (Κάρτα · Δώρα · Καταστήματα · Προφίλ) on every signed-in screen; none on splash/onboarding/sign-in |

## Tokens

Colours (contrast on white):

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `bg` | `#FFFFFF` | Page | |
| `beige` | `#F6F1E8` | Selective sections: gift, info notices, onboarding photo bands | |
| `ink` | `#171312` | All primary text, icons, outlines of secondary buttons | 18:1 |
| `ink-2` | `#3F3735` | Secondary text, used sparingly (never light grey) | 11:1 |
| `pink` | `#EBABC5` | Brand pink: 1 px decorative outlines, active nav bar, progress fill, primary button fill (ink text), display headings **≥ 24 px only** | 3.4:1 (AA large) |
| `pink-tint` | `#FCF1F5` | Very light selected backgrounds (chips, selected row) | |
| `plum` | `#B2688A` | Icons, active nav icon + label, tier accents; text only ≥ 18 px bold / 24 px | 4.0:1 |
| `plum-deep` | `#924B6D` | Small accent text: links, section labels, "Πάρ' το" actions | 6.1:1 |
| `line` | `#E8E1DB` | Neutral hairlines and dividers (1 px) | |
| `success` | `#4F7A3A` | Success icon + short text | 5:1 |
| `error` | `#A3302B` | Error text and field outline | 6.6:1 |

Type: Manrope (Greek-capable, already in v1 and the Overoll DS). One family, light weights for editorial display.

| Style | Size / line | Weight | Notes |
| --- | --- | --- | --- |
| `display-xl` | 40 / 44 | 300 | tracking −2 %; pink or ink |
| `display` | 32 / 38 | 300 | tracking −1.5 % |
| `points` | 56 / 56 | 300 | tabular figures |
| `title` | 24 / 30 | 500 | |
| `heading` | 18 / 24 | 600 | |
| `body` | 16 / 24 | 400 | |
| `body-s` | 14 / 20 | 400 | |
| `label` | 12 / 16 | 700 | uppercase, tracking 8 %, plum-deep |
| `button` | 16 / 20 | 600 | |

Spacing: 4 px grid; screen side padding 24; section gaps 32–40. Radius: 4 (buttons, inputs, chips), 8 (QR container,
bottom sheet top), 0 (rows, sections). No shadows except the bottom sheet (one soft 0 −1 12 rgba(23,19,18,.08)).
Frames: 390 × 844 (iPhone 15). Touch targets ≥ 44 px; bottom nav 64 px + home indicator.

## Brand language (from the website, translated)

Thin pink 1 px outlines and rules · black thin-line grids (the website menu grid) for structured info (how points
work, tier table) · large light-weight words as quiet display type · product photos in clean rectangular crops or
a slightly rotated "polaroid" frame on onboarding only · circular photo crops for stores/gallery details · generous
white space and one asymmetric element per screen at most. Logo unchanged (`assets/brand/overoll-logo.svg`,
wordmark for the header). Photos: `overoll-croissanterie/public/assets/*.jpg` (rights: covered by the authorization
letter; confirm before App Store use).

## Components

Header (white, logo wordmark centred 22 px high, 1 px `line` bottom; optional back/close icon left) · Bottom
navigation (4 outline icons 24 px + labels 11 px; active: plum icon + label, 2 px pink bar on top) · Buttons:
primary (pink fill, ink text), dark (ink fill, white text: one per screen at most), secondary (1 px ink outline),
text (plum-deep, underline) — states default / pressed / disabled / loading · Inputs: label above, 52 px, 1 px
`line`, focus plum outline, error `error` + message · 6-cell code input · Checkbox (20 px, 1 px ink; checked
plum-deep) · Progress: onboarding segments (thin bars, active pink), tier progress (2 px track, pink fill, plum
marker), reward progress · Tier badge (thin plum outline, label style) · Reward row (photo 56 px square, name, cost,
action or "λείπουν N") with available / locked / gift / pending-code variants · QR container (white, 1 px pink,
8 px radius, member code in groups of 4 below) · Notices: info (beige), success, error · Bottom sheet (redeem
confirm) · Store row (name, address, today's hours, open/closed, directions) · List rows for profile settings.

## Screens

Onboarding (no header or nav): 1 Splash · 2 Welcome · 3 How it works · 4 Rewards · 5 Registration (email; store
greeting when opened from a counter QR) · 6 Verification (6-digit code) · 6b Your details (first name, 15+ box,
three optional consents) · 7 Success (card ready + welcome croissant). Returning members: Registration screen in
"sign in" mode (same email → code).

Signed in (header + nav): Card (points, tier, QR, progress to next reward and tier, Wallet buttons, welcome-gift
banner) · Rewards (gift first, then "you can have these", then "next up"; tier prices) · Redeem confirm (sheet) ·
Redemption code (QR of the code, code in letters, reward, 15-minute countdown, cancel) · Stores · Profile (details,
status, settings, history, help, legal, delete account, sign out) · History.

## Rules kept from v1 (do not change in design)

10 points per €1; tiers Classic 0 / Gold 1,500 / Club 4,000 points in 12 months (×1.00 / ×1.25 / ×1.50, rewards
−0 / −20 / −30 %); reward base costs espresso 300, any coffee 400, butter croissant 400, croissant of choice 550,
sandwich 800, croissant + coffee 850, croissant box 1,950; welcome gift: butter croissant after the first purchase,
valid 30 days, not counted for tiers; reward code valid 15 minutes; minimum age 15; no double points; points expire
12 months after the last purchase. Copy: Greek from `docs/copy-deck.md` by key; new texts drafted as
`onboarding.*` in the copy deck (§a0) for Dimos to approve.
