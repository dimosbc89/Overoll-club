# Overoll Club — Copy deck (v0.1)

Status: **draft for Dimos's review**, 9 Nov 2026. Nothing here ships until Dimos approves it. The consents (§a), account deletion (§b6), the privacy answer (§h) and the terms summary (§j) also need a lawyer.

Sources: `docs/program-spec.md` v0.1, `packages/core/src/config.ts`, `docs/brand.md`, `docs/menu-and-rewards.md`, `data/rewards.json`, `data/stores.json`, `packages/server/src/result.ts`, `packages/core/src/points.ts`, `packages/api/src/handler.ts`, and the tone of `overoll-croissanterie/public/index.html`.

## How to use this deck

- **Keys** are stable, dot.case. Greek is the reference language, as in `apps/*/src/i18n/messages.ts`: the Ελληνικά column goes into `el.json`, the English column into `en.json`. Keys that already exist in the apps (`card.joinTitle`, `card.points`, `rewards.title`, `console.award`, …) keep their current text; this deck only adds keys.
- **Error messages** live in `data/copy/errors.el.json` and `data/copy/errors.en.json` (keys = error codes, §f). The API's `message` field is English developer text: never show it, always map `code`.
- **Numbers.** App strings that show a number HQ can change get it as a placeholder (`{minutes}`, `{maxAmount}`, …) filled from the program config, so a config change needs no app release. Marketing copy (tiers, print, landing page, store listings, terms) spells out today's numbers so it reads well; if the config changes, that copy changes too (search this file for the values below).
- **Character counts** (push, SMS, store listings) were computed with a script, filling placeholders with the longest current values.

### Placeholders

| Placeholder | What it is |
| --- | --- |
| `{programName}` | Program name setting, default "Overoll Club" |
| `{clubUrl}` | The club site and web app, `loyalty.overoll.gr` (written without `https://` in copy). Logged-out home = landing page (§h) |
| `{storeCode}` | `code` from `data/stores.json`, e.g. `chalandri` |
| `{firstName}` | Member's first name, as typed |
| `{points}`, `{balance}` | A number of points / the member's balance, formatted per locale (el-GR "1.250", en-GB "1,250") |
| `{reward}` | `name_el` / `name_en` from `data/rewards.json` |
| `{store}` | `name_el` / `name_en` from `data/stores.json`, e.g. "Overoll Χαλάνδρι" |
| `{tier}` | Classic, Gold or Club (not translated) |
| `{date}` | Date, Intl `{ day: 'numeric', month: 'long' }`: el "17 Ιανουαρίου", en "17 January" |
| `{time}` | Countdown, `mm:ss` |
| `{days}`, `{minutes}`, `{seconds}`, `{months}` | Durations from the config |
| `{code}` | One-time sign-in code or redemption code |
| `{email}`, `{phone}` | What the member typed |
| `{amount}`, `{maxAmount}` | Money via Intl: el "6,40 €", en "€6.40" |
| `{maxEarns}` | `limits.maxEarnsPerDay` |
| `{supportEmail}` | Support address (to confirm, see questions) |
| `{termsUrl}`, `{privacyUrl}` | Terms and privacy pages under `{clubUrl}` (to write) |

### Today's numbers (spec + `config.ts`)

| Rule | Value | Config |
| --- | --- | --- |
| Points | 10 per €1 of the receipt total, rounded down | `pointsPerEuro` |
| Gold | 1,500 points earned in 12 months · ×1.25 earn · 20% fewer points on rewards | `tiers` |
| Club | 4,000 points earned in 12 months · ×1.50 earn · 30% fewer points on rewards | `tiers` |
| Expiry | 12 months after the last purchase; reminders 30 and 7 days before | `expiryMonths`, `expiryReminderDays` |
| Redemption code | valid 15 minutes, 8 characters | `redemptionValidMinutes` |
| Max receipt | €80 | `limits.maxAmountCents` |
| Earns per day | 5, network-wide | `limits.maxEarnsPerDay` |
| Between two earns | 2 minutes | `limits.minSecondsBetweenEarns` (120 s) |
| Undo by staff | 10 minutes | `limits.undoWindowMinutes` |
| Member QR | changes every 30 seconds, works offline | `qr.stepSeconds` |
| Welcome | a free butter croissant after the first purchase, once | spec §3 |

### Greek writing notes (for developers too)

- **No names in greetings.** Greek addresses people in the vocative (Γιώργος → Γιώργο, Νίκος → Νίκο), so "Γεια σου, {firstName}" reads wrong for many men's names. Greek strings never address the member by name; `{firstName}` appears only as a label ("{firstName}: +80 πόντοι"). English may use it.
- **Program name is neuter** (το Overoll Club → στο / του {programName}). If the final name is feminine (e.g. η Παρέα), search this file for `το {programName}`, `στο {programName}`, `του {programName}`.
- **Plurals and case.** 1 πόντος / 2 πόντοι (nominative), 1 πόντο / 2 πόντους (accusative). Strings are written for the plural; keys with `.one` / `.other` exist where 1 is likely.
- **All caps drop the accents** in Greek (ΠΟΝΤΟΙ, not ΠΌΝΤΟΙ). Use `lang="el"` so CSS `text-transform: uppercase` does this, and write caps without accents where we type them.
- Greek question mark is `;`, quotes are «», money is "6,40 €".
- English is British: programme, savoury, cancelled, favourite.

---

## a. Join flow

Counter QR → `{clubUrl}/join?store={storeCode}` → email or mobile → one-time code → name → consents → welcome. Existing members use the same code step to sign in.

### a1. Join start (what the counter QR opens)

| Key | Ελληνικά | English |
| --- | --- | --- |
| `join.hero.storeHello` | Γεια σου από το {store}! | Hello from {store}! |
| `join.hero.title` | Κάθε επίσκεψη προσθέτει μια στρώση. | Every visit adds a layer. |
| `join.hero.body` | Μάζευε πόντους σε κάθε αγορά και εξαργύρωσέ τους σε καφέ και κρουασάν. Με την πρώτη σου αγορά, ένα κρουασάν βουτύρου είναι κερασμένο. | Collect points every time you buy and swap them for coffee and croissants. After your first purchase, a butter croissant is on us. |
| `join.hero.cta` | Γίνε μέλος, δωρεάν | Join for free |
| `join.hero.signIn` | Είσαι ήδη μέλος; Σύνδεση | Already a member? Sign in |
| `join.hero.noApp` | Δεν χρειάζεται να κατεβάσεις τίποτα. | Nothing to download. |

`join.hero.storeHello` shows only when `?store=` matches an active store.

### a2. Email or mobile

| Key | Ελληνικά | English |
| --- | --- | --- |
| `join.method.title` | Με τι θες να συνδέεσαι; | How would you like to sign in? |
| `join.method.body` | Χωρίς κωδικό πρόσβασης: κάθε φορά που συνδέεσαι, σου στέλνουμε έναν κωδικό μιας χρήσης. | No password: whenever you sign in, we send you a one-time code. |
| `join.method.email` | Με email | With email |
| `join.method.phone` | Με κινητό | With my mobile |
| `join.email.label` | Email | Email |
| `join.email.placeholder` | onoma@example.com | name@example.com |
| `join.email.invalid` | Αυτό δεν μοιάζει με email. Ρίξε του μια ματιά. | That doesn't look like an email address. Have another look. |
| `join.phone.label` | Κινητό | Mobile number |
| `join.phone.placeholder` | 69X XXX XXXX | 69X XXX XXXX |
| `join.phone.invalid` | Αυτό δεν μοιάζει με αριθμό κινητού. | That doesn't look like a mobile number. |
| `join.send` | Στείλε μου κωδικό | Send me a code |
| `auth.signIn.title` | Καλώς ήρθες ξανά | Welcome back |
| `auth.signIn.body` | Γράψε το email ή το κινητό με το οποίο έγινες μέλος. | Enter the email or mobile number you joined with. |

### a3. One-time code

These come from Supabase Auth, not from the `ErrorCode` union.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `join.code.titleEmail` | Σου στείλαμε κωδικό στο {email} | We've sent a code to {email} |
| `join.code.titlePhone` | Σου στείλαμε SMS με κωδικό στο {phone} | We've texted a code to {phone} |
| `join.code.label` | Κωδικός | Code |
| `join.code.submit` | Συνέχεια | Continue |
| `join.code.change` | Αλλαγή email ή κινητού | Use a different email or number |
| `join.code.resend` | Δεν ήρθε; Στείλε ξανά | Didn't get it? Send again |
| `join.code.resendIn` | Νέος κωδικός σε {seconds} δευτ. | New code in {seconds}s |
| `join.code.spam` | Δεν το βλέπεις; Κοίτα και στα ανεπιθύμητα. | Can't see it? Check your spam folder. |
| `join.code.wrong` | Ο κωδικός δεν είναι σωστός ή έχει λήξει. Δοκίμασε ξανά ή ζήτα νέο. | That code is wrong or has expired. Try again or ask for a new one. |
| `join.code.tooMany` | Πολλές προσπάθειες. Περίμενε λίγο και δοκίμασε ξανά. | Too many tries. Wait a little and try again. |

### a4. Name

| Key | Ελληνικά | English |
| --- | --- | --- |
| `join.profile.title` | Πώς να σε λέμε; | What should we call you? |
| `join.profile.firstName` | Όνομα | First name |
| `join.profile.firstNameHint` | Το βλέπουμε στο ταμείο όταν σκανάρουμε την κάρτα σου. | We see it at the till when we scan your card. |
| `join.profile.lastName` | Επώνυμο (προαιρετικό) | Surname (optional) |
| `join.profile.language` | Γλώσσα | Language |
| `join.profile.continue` | Συνέχεια | Continue |
| `join.profile.birthday` *(v1.1: hide at launch)* | Γενέθλια (προαιρετικό) | Birthday (optional) |
| `join.profile.birthdayHint` *(v1.1)* | Για ένα κρουασάν κερασμένο την εβδομάδα των γενεθλίων σου. | For a croissant on us in your birthday week. |

### a5. Consents (GDPR)

Rules for the screen: three **separate** checkboxes, **all unticked** by default, **none required** to join. Save each choice with the time (`consent_email`, `consent_sms`, `consent_push`, `consents_updated_at`). Show the push checkbox only where push is possible; ticking it triggers the phone's own prompt. Accepting the terms is a line of text, not a checkbox.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `join.consents.title` | Να τα λέμε; | Shall we keep in touch? |
| `join.consents.body` | Όλα είναι προαιρετικά. Η κάρτα και οι πόντοι σου δουλεύουν κανονικά και χωρίς αυτά, και τα αλλάζεις όποτε θες από το Προφίλ. | All optional. Your card and points work just the same without them, and you can change them any time in Profile. |
| `join.consents.email` | Θέλω να λαμβάνω email από το Overoll Croissanterie με προσφορές, νέα και ενημερώσεις για το {programName}. Μπορώ να το σταματήσω όποτε θέλω. | I'd like to receive emails from Overoll Croissanterie with offers, news and {programName} updates. I can stop them at any time. |
| `join.consents.sms` | Θέλω να λαμβάνω SMS από το Overoll Croissanterie με προσφορές και νέα. Μπορώ να το σταματήσω όποτε θέλω. | I'd like to receive text messages from Overoll Croissanterie with offers and news. I can stop them at any time. |
| `join.consents.push` | Θέλω ειδοποιήσεις σε αυτή τη συσκευή για τους πόντους, τα δώρα και τις προσφορές μου. Μπορώ να τις κλείσω όποτε θέλω. | I'd like notifications on this device about my points, rewards and offers. I can turn them off at any time. |
| `join.consents.pushOs` | Μετά θα σε ρωτήσει και το κινητό σου. | Your phone will ask you too. |
| `join.consents.terms` | Πατώντας «Γίνε μέλος» αποδέχεσαι τους όρους του {programName}. | By tapping "Join" you accept the {programName} terms. |
| `join.consents.termsLink` | Όροι | Terms |
| `join.consents.privacyLink` | Πώς χρησιμοποιούμε τα στοιχεία σου | How we use your data |
| `join.consents.submit` | Γίνε μέλος | Join |

> **A lawyer should review these consent texts** before launch: the controller's legal name (written here as "Overoll Croissanterie"), whether push should be split into service ("my points and rewards") and marketing ("offers") (today there is one `consent_push`), and whether the welcome email, expiry reminders and points-added messages count as service messages.

### a6. Welcome

| Key | Ελληνικά | English |
| --- | --- | --- |
| `join.welcome.title` | Καλώς ήρθες στο {programName}! | Welcome to {programName}! |
| `join.welcome.body` | Η κάρτα σου είναι έτοιμη. Δείχνε τη στο ταμείο σε κάθε αγορά και μάζευε πόντους. | Your card is ready. Show it at the till every time you buy and collect points. |
| `join.welcome.croissant` | Με την πρώτη σου αγορά ξεκλειδώνεις ένα κρουασάν βουτύρου, κερασμένο. | Your first purchase unlocks a butter croissant, on us. |
| `join.welcome.wallet` | Πρόσθεσέ την και στο Wallet, για να είναι πάντα πρόχειρη. | Add it to your Wallet so it's always to hand. |
| `join.welcome.cta` | Δες την κάρτα μου | Show my card |

---

## b. Member screens

### b1. Card

| Key | Ελληνικά | English |
| --- | --- | --- |
| `card.tier` | Επίπεδο {tier} | {tier} tier |
| `card.nextReward.other` | Ακόμα {points} πόντοι για το επόμενο κέρασμα: {reward} | {points} points to your next free treat: {reward} |
| `card.nextReward.one` | Ακόμα 1 πόντος για το επόμενο κέρασμα: {reward} | 1 point to your next free treat: {reward} |
| `card.nextReward.ready` | Έχεις αρκετούς πόντους για δώρο. Ρίξε μια ματιά στα Δώρα! | You've got enough points for a reward. Have a look in Rewards! |
| `card.nextTier` | Ακόμα {points} πόντοι για να ανέβεις στο {tier}. | {points} more points to reach {tier}. |
| `card.topTier` | Πιο ψηλά δεν έχει. Ευχαριστούμε που είσαι εδώ! | It doesn't get any higher. Thanks for being here! |
| `card.qr.hint` | Δείξε αυτόν τον κωδικό στο ταμείο όταν πληρώνεις. | Show this code at the till when you pay. |
| `card.qr.rotates` | Ο κωδικός αλλάζει κάθε {seconds} δευτερόλεπτα για να είναι ασφαλής και δουλεύει και χωρίς ίντερνετ. | The code changes every {seconds} seconds to keep it safe, and it works offline too. |
| `card.qr.noScreenshot` | Τα screenshot δεν περνάνε: δείξε την κάρτα ζωντανά. | Screenshots won't scan: show the live card. |
| `card.qr.brightness` | Δεν σκανάρεται; Ανέβασε τη φωτεινότητα της οθόνης. | Won't scan? Turn up your screen brightness. |
| `card.wallet.apple` | Προσθήκη στο Apple Wallet | Add to Apple Wallet |
| `card.wallet.google` | Προσθήκη στο Google Wallet | Add to Google Wallet |
| `card.wallet.hint` | Στο Wallet η κάρτα σου ανοίγει χωρίς την εφαρμογή και ενημερώνεται μόνη της με τους πόντους σου. | In Wallet your card opens without the app and updates itself with your points. |
| `card.wallet.added` | Η κάρτα σου είναι στο Wallet. | Your card is in your Wallet. |
| `card.welcome.locked` | Κάνε την πρώτη σου αγορά και ξεκλείδωσε ένα κρουασάν βουτύρου, κερασμένο. | Make your first purchase to unlock a butter croissant, on us. |
| `card.welcome.ready` | Το κρουασάν καλωσορίσματος σε περιμένει στα Δώρα. | Your welcome croissant is waiting in Rewards. |
| `card.expiry` | Οι πόντοι σου ισχύουν μέχρι τις {date}. Κάθε αγορά τους ανανεώνει για {months} μήνες. | Your points are valid until {date}. Every purchase renews them for {months} months. |

The Wallet buttons must use Apple's and Google's official badge artwork (Greek and English versions exist); the two strings above are the accessibility labels.

### b2. Rewards

Reward names and descriptions come from `data/rewards.json`; `rewards.title`, `rewards.intro`, `rewards.cost`, `rewards.empty` already exist.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `rewards.canHave` | Το παίρνεις! | You can have this! |
| `rewards.toGo` | Ακόμα {points} | {points} to go |
| `rewards.tierPrice` | Με το {tier}: {points} πόντοι | With {tier}: {points} points |
| `rewards.basePrice` | αντί για {points} | instead of {points} |
| `rewards.tierOnly` | Για {tier} και πάνω | {tier} and above |
| `rewards.welcome.badge` | Κερασμένο | On us |
| `rewards.welcome.title` | Κρουασάν καλωσορίσματος | Welcome croissant |
| `rewards.welcome.body` | Ένα κρουασάν βουτύρου κερασμένο, μία φορά, μετά την πρώτη σου αγορά. | A butter croissant on us, once, after your first purchase. |
| `rewards.redeem` | Εξαργύρωση | Redeem |

### b3. Redeem flow

| Key | Ελληνικά | English |
| --- | --- | --- |
| `redeem.confirm.title` | Να ετοιμάσουμε τον κωδικό; | Shall we make your code? |
| `redeem.confirm.body` | Ο κωδικός ισχύει {minutes} λεπτά, οπότε πάτα όταν είσαι στο ταμείο. Αφαιρούμε {points} πόντους, που γυρίζουν πίσω αν τον ακυρώσεις ή αν λήξει. | The code works for {minutes} minutes, so tap when you're at the till. We take {points} points, and they come back if you cancel or the code expires. |
| `redeem.confirm.yes` | Δώσε μου τον κωδικό | Get my code |
| `redeem.confirm.no` | Όχι ακόμα | Not yet |
| `redeem.code.title` | Δείξε αυτόν τον κωδικό στο ταμείο | Show this code at the till |
| `redeem.code.timer` | Λήγει σε {time} | Expires in {time} |
| `redeem.code.manual` | Δεν σκανάρεται; Ο κωδικός πληκτρολογείται και με το χέρι: {code} | Won't scan? Staff can type it in: {code} |
| `redeem.code.cancel` | Ακύρωση κωδικού | Cancel code |
| `redeem.cancel.title` | Να ακυρώσουμε τον κωδικό; | Cancel this code? |
| `redeem.cancel.body` | Οι {points} πόντοι γυρίζουν αμέσως στην κάρτα σου. | Your {points} points go straight back on your card. |
| `redeem.cancel.yes` | Ναι, ακύρωση | Yes, cancel |
| `redeem.cancel.no` | Όχι, τον κρατάω | No, keep it |
| `redeem.cancelled` | Ακυρώθηκε. Οι πόντοι σου γύρισαν πίσω. | Cancelled. Your points are back. |
| `redeem.expired` | Ο κωδικός έληξε και οι πόντοι γύρισαν στην κάρτα σου. Φτιάξε νέο όταν είσαι στο ταμείο. | The code expired and your points are back on your card. Get a new one when you're at the till. |
| `redeem.used` | Καλή απόλαυση! Το δώρο σου εξαργυρώθηκε. | Enjoy! Your reward has been redeemed. |
| `redeem.active` | Έχεις ενεργό κωδικό: {reward}. Λήγει σε {time}. | You have an active code: {reward}. Expires in {time}. |

### b4. History

One line per ledger kind (`earn`, `bonus`, `redeem`, `refund_redeem`, `reverse`, `adjust`, `expire`).

| Key | Ελληνικά | English |
| --- | --- | --- |
| `history.title` | Ιστορικό | History |
| `history.empty` | Εδώ θα βλέπεις τους πόντους σου μετά την πρώτη σου αγορά. | Your points will show up here after your first purchase. |
| `history.earn` | Αγορά · {store} | Purchase · {store} |
| `history.receipt` | Απόδειξη {amount} | Receipt {amount} |
| `history.bonus` | Bonus πόντοι | Bonus points |
| `history.redeem` | Δώρο: {reward} | Reward: {reward} |
| `history.refundRedeem` | Επιστροφή πόντων: {reward} | Points returned: {reward} |
| `history.reverse` | Διόρθωση αγοράς · {store} | Purchase corrected · {store} |
| `history.adjust` | Διόρθωση από την ομάδα του Overoll | Adjustment by the Overoll team |
| `history.expire` | Οι πόντοι έληξαν | Points expired |

### b5. Profile

`profile.title` and `profile.language` already exist.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `profile.memberSince` | Μέλος από {date} | Member since {date} |
| `profile.name` | Όνομα | Name |
| `profile.email` | Email | Email |
| `profile.phone` | Κινητό | Mobile number |
| `profile.tierReview` | Το επίπεδό σου ελέγχεται κάθε χρόνο, την επέτειο της εγγραφής σου ({date}). | Your tier is reviewed every year on the anniversary of the day you joined ({date}). |
| `profile.contact.title` | Να τα λέμε | Keeping in touch |
| `profile.contact.email` | Email με προσφορές και νέα | Emails with offers and news |
| `profile.contact.sms` | SMS με προσφορές και νέα | Texts with offers and news |
| `profile.contact.push` | Ειδοποιήσεις για πόντους, δώρα και προσφορές | Notifications about points, rewards and offers |
| `profile.contact.pushOff` | Οι ειδοποιήσεις είναι κλειστές στις ρυθμίσεις του κινητού σου. | Notifications are turned off in your phone's settings. |
| `profile.export` | Κατέβασε τα δεδομένα μου | Download my data |
| `profile.exportBody` | Ένα αρχείο με τα στοιχεία σου, τους πόντους και το ιστορικό σου. | A file with your details, points and history. |
| `profile.terms` | Όροι του προγράμματος | Programme terms |
| `profile.privacy` | Πολιτική απορρήτου | Privacy policy |
| `profile.help` | Βοήθεια και επικοινωνία | Help and contact |
| `profile.signOut` | Αποσύνδεση | Sign out |
| `profile.delete` | Διαγραφή λογαριασμού | Delete account |
| `profile.saved` | Αποθηκεύτηκε | Saved |

### b6. Delete account

Matches the schema: personal fields are wiped, the points ledger stays without them.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `delete.title` | Να διαγράψουμε τον λογαριασμό σου; | Delete your account? |
| `delete.body` | Σβήνουμε τα προσωπικά σου στοιχεία: όνομα, email, κινητό, γενέθλια και επιλογές επικοινωνίας. Οι πόντοι και τα δώρα σου χάνονται και η κάρτα σου, και στο Wallet, σταματά να δουλεύει. Αυτό δεν αναιρείται. | We erase your personal details: name, email, mobile number, birthday and contact choices. Your points and rewards are lost, and your card, in Wallet too, stops working. This can't be undone. |
| `delete.keep` | Κρατάμε μόνο τις κινήσεις πόντων, χωρίς τα στοιχεία σου, για τα λογιστικά των καταστημάτων. | We only keep the points history, without your details, for the stores' accounts. |
| `delete.exportFirst` | Θες πρώτα αντίγραφο; Κατέβασε τα δεδομένα σου. | Want a copy first? Download your data. |
| `delete.confirmLabel` | Γράψε ΔΙΑΓΡΑΦΗ για επιβεβαίωση | Type DELETE to confirm |
| `delete.confirmWord` | ΔΙΑΓΡΑΦΗ | DELETE |
| `delete.confirm` | Διαγραφή για πάντα | Delete for good |
| `delete.cancel` | Άκυρο, μένω | Cancel, I'm staying |
| `delete.done` | Ο λογαριασμός σου διαγράφηκε. Ήταν χαρά μας. Αν σου λείψουν τα κρουασάν, ξέρεις πού θα μας βρεις. | Your account has been deleted. It was a pleasure. If you miss the croissants, you know where to find us. |

---

## c. Tiers

Names stay Classic / Gold / Club for now.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `tiers.title` | Επίπεδα | Tiers |
| `tiers.intro` | Όσο περισσότερους πόντους μαζεύεις μέσα σε 12 μήνες, τόσο πιο ψηλά ανεβαίνεις. Good things come in layers. | The more points you collect in 12 months, the higher you go. Good things come in layers. |
| `tiers.classic.name` | Classic | Classic |
| `tiers.classic.benefit` | Από την πρώτη μέρα: 10 πόντοι για κάθε 1 €. | From day one: 10 points for every €1. |
| `tiers.gold.name` | Gold | Gold |
| `tiers.gold.benefit` | Με 1.500 πόντους σε 12 μήνες: 25% περισσότεροι πόντοι σε κάθε αγορά και δώρα με 20% λιγότερους πόντους. | At 1,500 points in 12 months: 25% more points on every purchase and rewards for 20% fewer points. |
| `tiers.club.name` | Club | Club |
| `tiers.club.benefit` | Με 4.000 πόντους σε 12 μήνες: 50% περισσότεροι πόντοι σε κάθε αγορά και δώρα με 30% λιγότερους πόντους. | At 4,000 points in 12 months: 50% more points on every purchase and rewards for 30% fewer points. |
| `tiers.moveUp` | Ανεβαίνεις αμέσως μόλις φτάσεις τους πόντους. | You move up the moment you reach the points. |
| `tiers.review` | Μία φορά τον χρόνο, την επέτειο της εγγραφής σου, ελέγχουμε το επίπεδό σου. Αν χρειαστεί, πέφτει το πολύ ένα σκαλί. | Once a year, on the anniversary of the day you joined, we review your tier. If needed, it drops by one level at most. |
| `tiers.counts` | Μετράνε οι πόντοι από αγορές και τα bonus. Τα δώρα που εξαργυρώνεις δεν σε κατεβάζουν ποτέ. | Points from purchases and bonuses count. Spending points on rewards never lowers your tier. |

---

## d. Notifications

### d1. Push

Title = `{programName}`; the text below is the body (≤ 100 characters). Counts use the longest current values: points 80, balance 1.250 / 1,250, store "Overoll Νέα Ερυθραία" / "Overoll Nea Erythraia", reward "Espresso ή διπλός ελληνικός" / "Espresso or double Greek coffee", date "17 Ιανουαρίου" / "17 January".

| Key | When | Ελληνικά | English | Chars el / en |
| --- | --- | --- | --- | --- |
| `push.pointsAdded` | Points added | +{points} πόντοι στο {store}. Σύνολο: {balance}. Ευχαριστούμε! | +{points} points at {store}. Total: {balance}. Thank you! | 65 / 61 |
| `push.rewardUnlocked` | Balance reaches a reward | Έχεις αρκετούς πόντους για δώρο: {reward}. Πέρνα να το πάρεις! | You've got enough points for a reward: {reward}. Come and get it! | 81 / 88 |
| `push.welcomeReady` | Welcome croissant unlocked (first purchase) | Καλή αρχή! Ένα κρουασάν βουτύρου σε περιμένει κερασμένο στα Δώρα σου. | Great start! A butter croissant is waiting in your Rewards, on us. | 69 / 66 |
| `push.tierUp.gold` | Tier up to Gold | Ανέβηκες στο Gold! Τώρα παίρνεις 25% περισσότερους πόντους και δώρα με 20% λιγότερους. | You're Gold now! 25% more points on every purchase and rewards for 20% fewer points. | 86 / 84 |
| `push.tierUp.club` | Tier up to Club | Ανέβηκες στο Club! Τώρα παίρνεις 50% περισσότερους πόντους και δώρα με 30% λιγότερους. | Welcome to Club! 50% more points on every purchase and rewards for 30% fewer points. | 86 / 84 |
| `push.expiry30` | Points expire in 30 days | Οι {points} πόντοι σου λήγουν σε 30 μέρες. Μία αγορά τους κρατάει για άλλους 12 μήνες. | Your {points} points expire in 30 days. One purchase keeps them for another 12 months. | 80 / 80 |
| `push.expiry7` | Points expire in 7 days | Μόνο 7 μέρες ακόμα για τους {points} πόντους σου! Πέρνα για έναν καφέ και κράτα τους. | Only 7 days left for your {points} points! Pop in for a coffee and keep them. | 79 / 71 |
| `push.redemptionExpired` | Code expired, points returned | Ο κωδικός δώρου έληξε, αλλά μην ανησυχείς: οι {points} πόντοι γύρισαν στην κάρτα σου. | Your reward code expired, but don't worry: your {points} points are back on your card. | 79 / 80 |

Tier-up lines spell out today's numbers; change them with the config.

### d2. Wallet pass

Apple: each field's `changeMessage` shows on the lock screen when the field changes; Apple writes the new value as `%@`, which stands in for `{balance}`, `{tier}` and `{reward}` below. Google Wallet: the points field updates silently; for the events in d1, send a pass message with header `{programName}` and the push line as body. Labels are typed in caps without accents.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `wallet.label.points` | ΠΟΝΤΟΙ | POINTS |
| `wallet.label.tier` | ΕΠΙΠΕΔΟ | TIER |
| `wallet.label.member` | ΜΕΛΟΣ | MEMBER |
| `wallet.label.nextReward` | ΕΠΟΜΕΝΟ ΚΕΡΑΣΜΑ | NEXT TREAT |
| `wallet.change.points` | Οι πόντοι σου είναι τώρα {balance}. | Your points are now {balance}. |
| `wallet.change.tier` | Νέο επίπεδο: {tier}! | New tier: {tier}! |
| `wallet.change.nextReward` | Επόμενο κέρασμα: {reward} | Next treat: {reward} |
| `wallet.back.howTo` | Δείξε αυτόν τον κωδικό στο ταμείο σε κάθε αγορά. Οι πόντοι εδώ ενημερώνονται μόνοι τους. | Show this code at the till every time you buy. Your points here update by themselves. |
| `wallet.back.rewards` | Τα δώρα σου τα εξαργυρώνεις στο {clubUrl}. | Redeem your rewards at {clubUrl}. |
| `wallet.back.expiry` | Οι πόντοι ισχύουν 12 μήνες από την τελευταία σου αγορά. | Points are valid for 12 months after your last purchase. |
| `wallet.back.help` | Βοήθεια: {supportEmail} · Όροι: {termsUrl} | Help: {supportEmail} · Terms: {termsUrl} |

---

## e. Emails and SMS

Shared footer:

| Key | Ελληνικά | English |
| --- | --- | --- |
| `email.footer.why` | Λαμβάνεις αυτό το email επειδή έγινες μέλος του {programName}. | You're getting this email because you joined {programName}. |
| `email.footer.help` | Ερωτήσεις; Γράψε μας στο {supportEmail}. | Questions? Email us at {supportEmail}. |
| `email.footer.unsubscribe` *(marketing emails only)* | Δεν θες άλλα τέτοια email; Διαγραφή από τη λίστα | Don't want emails like this? Unsubscribe |

### e1. Welcome

| Key | Ελληνικά | English |
| --- | --- | --- |
| `email.welcome.subject` | Καλώς ήρθες στο {programName} | Welcome to {programName} |
| `email.welcome.preheader` | Η κάρτα σου είναι έτοιμη και ένα κρουασάν σε περιμένει μετά την πρώτη σου αγορά. | Your card is ready, and a croissant is waiting after your first purchase. |
| `email.welcome.heading` | Κάθε επίσκεψη προσθέτει μια στρώση. | Every visit adds a layer. |
| `email.welcome.p1` | Γεια σου! Από σήμερα μαζεύεις 10 πόντους για κάθε 1 € σε όλα τα Overoll και τους εξαργυρώνεις σε καφέ, κρουασάν και άλλα καλούδια. | Hello! From today you collect 10 points for every €1 at every Overoll, and swap them for coffee, croissants and more. |
| `email.welcome.p2` | Και για αρχή: με την πρώτη σου αγορά ξεκλειδώνεις ένα κρουασάν βουτύρου, κερασμένο. | And to start you off: your first purchase unlocks a butter croissant, on us. |
| `email.welcome.p3` | Δείχνε την κάρτα σου στο ταμείο σε κάθε αγορά. Τη βρίσκεις πάντα στο {clubUrl}, ή πρόσθεσέ τη στο Wallet για να είναι πρόχειρη. | Show your card at the till every time you buy. It's always at {clubUrl}, or add it to your Wallet to keep it handy. |
| `email.welcome.cta` | Δες την κάρτα μου | Show my card |
| `email.welcome.signoff` | Τα λέμε από κοντά, η ομάδα του Overoll | See you soon, the Overoll team |

### e2. Sign-in code

For the Supabase Auth email template: `{code}` = `{{ .Token }}`; `{minutes}` comes from `signInCode.minutes` in `supabase/project.config.json` (10), which also sets the project's code expiry. The template is `supabase/templates/sign-in-code.html`: Greek first, English below, because the email is sent before we know the member's language.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `email.code.subject` | Ο κωδικός σου: {code} | Your code: {code} |
| `email.code.preheader` | Ισχύει {minutes} λεπτά. Μην τον δώσεις σε κανέναν. | Valid for {minutes} minutes. Don't share it with anyone. |
| `email.code.p1` | Ο κωδικός σου για το {programName} είναι: | Your {programName} code is: |
| `email.code.p2` | Ισχύει για {minutes} λεπτά. Το προσωπικό του Overoll δεν θα σου τον ζητήσει ποτέ. | It's valid for {minutes} minutes. Overoll staff will never ask you for it. |
| `email.code.p3` | Δεν τον ζήτησες εσύ; Αγνόησε αυτό το email: χωρίς τον κωδικό, κανείς δεν μπαίνει στον λογαριασμό σου. | Didn't ask for it? Ignore this email: without the code, nobody can get into your account. |

SMS sign-in code (sender ID "Overoll"). Greek lowercase letters switch the SMS to Unicode, where one message holds 70 characters, so the Greek text stays under 70 (counted with a 6-digit code). Optionally add a last line `@{clubUrl domain} #{code}` so iPhone and Android offer to autofill the code in the web app.

| Key | Ελληνικά | English | Chars el / en |
| --- | --- | --- | --- |
| `auth.sms.code` | {programName}: ο κωδικός σου είναι {code}. Μην τον δώσεις σε κανέναν. | {programName}: your code is {code}. Never share it with anyone. | 68 / 62 |

### e3. Expiry reminder (30 and 7 days)

| Key | Ελληνικά | English |
| --- | --- | --- |
| `email.expiry.subject` | Οι πόντοι σου λήγουν σε {days} μέρες | Your points expire in {days} days |
| `email.expiry.preheader` | Μία αγορά σε οποιοδήποτε Overoll αρκεί για να τους κρατήσεις άλλους 12 μήνες. | One purchase at any Overoll keeps them for another 12 months. |
| `email.expiry.heading` | Κράτα τους πόντους σου | Keep your points |
| `email.expiry.p1` | Έχεις {points} πόντους στο {programName} και λήγουν στις {date}. | You have {points} points on {programName}, and they expire on {date}. |
| `email.expiry.p2` | Δεν χρειάζεται κάτι ιδιαίτερο: μία αγορά με την κάρτα σου σε οποιοδήποτε Overoll, ακόμα και ένας espresso, και ισχύουν για άλλους 12 μήνες. | Nothing special needed: one purchase with your card at any Overoll, even an espresso, and they're good for another 12 months. |
| `email.expiry.p3` *(only if they can already afford a reward)* | Ξέρεις ότι με αυτούς τους πόντους σε περιμένει ήδη δώρο; Δες τι μπορείς να πάρεις στο {clubUrl}. | Did you know you already have enough for a reward? See what you can get at {clubUrl}. |
| `email.expiry.cta` | Δες την κάρτα μου | Show my card |

---

## f. Staff console and error messages

### f1. Console labels

`console.title`, `console.scan`, `console.scanHint`, `console.amount`, `console.maxAmount`, `console.award` and the keypad labels already exist in `apps/admin/src/i18n`.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `console.device.title` | Σύνδεση συσκευής ταμείου | Till device sign-in |
| `console.device.body` | Ο υπεύθυνος του καταστήματος συνδέει τη συσκευή μία φορά. Μετά, ο καθένας στο ταμείο μπαίνει με το δικό του PIN. | Your store manager signs this device in once. After that, everyone on the till uses their own PIN. |
| `console.employee.title` | Ποιος είναι στο ταμείο; | Who's on the till? |
| `console.employee.pin` | Το PIN σου | Your PIN |
| `console.employee.pinHint` | Το PIN είναι μόνο δικό σου. Κάθε κίνηση γράφεται στο όνομά σου. | Your PIN is yours alone. Every action is recorded under your name. |
| `console.employee.switch` | Αλλαγή ταμία | Switch cashier |
| `console.scan.camera` | Στρέψε την κάμερα στον κωδικό | Point the camera at the code |
| `console.scan.type` | Πληκτρολόγηση κωδικού | Type a code |
| `console.member.title` | Μέλος | Member |
| `console.member.check` | Βεβαιώσου ότι το όνομα ταιριάζει. Αν έχεις αμφιβολία, ρώτα. | Check the name matches. If in doubt, ask. |
| `console.member.balance` | {points} πόντοι | {points} points |
| `console.award.preview` | Θα πάρει {points} πόντους | They'll get {points} points |
| `console.award.success` | {firstName}: +{points} πόντοι | {firstName}: +{points} points |
| `console.award.firstPurchase` | Πρώτη αγορά! Το κρουασάν καλωσορίσματος ξεκλειδώθηκε. Πες το στον πελάτη. | First purchase! The welcome croissant is now unlocked. Let them know. |
| `console.award.tierUp` | {firstName}: νέο επίπεδο {tier}. Ώρα για συγχαρητήρια! | {firstName} just reached {tier}. Time for a congrats! |
| `console.undo` | Αναίρεση | Undo |
| `console.undo.hint` | Αναίρεση γίνεται για {minutes} λεπτά μετά την καταχώριση. | You can undo an entry for up to {minutes} minutes after it's made. |
| `console.undo.confirm` | Αναίρεση {points} πόντων για {firstName}; | Undo {points} points for {firstName}? |
| `console.undo.done` | Αναιρέθηκε. Αν χρειάζεται, πέρασε τώρα το σωστό ποσό. | Undone. If you need to, enter the right amount now. |
| `console.redeem.title` | Εξαργύρωση δώρου | Redeem a reward |
| `console.redeem.typeHint` | 8 χαρακτήρες, με ή χωρίς κενά και παύλες. | 8 characters, with or without spaces and dashes. |
| `console.redeem.reward` | Δώρο: {reward} | Reward: {reward} |
| `console.redeem.confirm` | Επιβεβαίωση εξαργύρωσης | Confirm redemption |
| `console.redeem.done` | Έγινε! Πέρασε το δώρο στην ταμειακή με έκπτωση 100%. | Done! Ring the reward up on the POS with a 100% discount. |
| `console.redeem.why` | Η έκπτωση 100% κρατά σωστή την απόδειξη για το myDATA. | The 100% discount keeps the receipt right for myDATA. |
| `console.today` | Σημερινές κινήσεις | Today's activity |

### f2. Error messages

One line per code, telling the person what to do next. Source of truth: `data/copy/errors.el.json` and `data/copy/errors.en.json` (this table is generated from them). Covers every code in the `ErrorCode` union in `packages/server/src/result.ts`, including `PurchaseError` and `EarnLimitError` from `packages/core/src/points.ts`, plus two API-level codes from `packages/api/src/handler.ts` (`unauthenticated`, `internal_error`) and two for the apps (`network_error` when offline, `unknown` as the fallback for any other code, e.g. `route_not_found`). After an `internal_error` or `network_error` during an award, retry with the **same** idempotency key so points are never added twice.

| Code | Who sees it | Ελληνικά | English | Fill |
| --- | --- | --- | --- | --- |
| `invalid_input` | both | Κάτι δεν πάει καλά με τα στοιχεία. Έλεγξέ τα και δοκίμασε ξανά. | Something in the details isn't right. Check them and try again. | – |
| `idempotency_conflict` | both | Αυτό στάλθηκε ήδη με άλλα στοιχεία. Ανανέωσε την οθόνη και ξεκίνα από την αρχή. | This was already sent with different details. Refresh the screen and start again. | – |
| `forbidden` | staff (member rarely) | Αυτό δεν γίνεται από εδώ. Αν είσαι στο ταμείο, ζήτα βοήθεια από τον υπεύθυνο του καταστήματος. | This can't be done from here. If you're at the till, ask your store manager for help. | – |
| `store_inactive` | staff | Το κατάστημα δεν είναι ακόμα ενεργό στο {programName}. Ενημέρωσε τον υπεύθυνο ή το HQ. | This store isn't live on {programName} yet. Let your store manager or HQ know. | `{programName}` = program name |
| `employee_not_found` | staff | Δεν βρίσκουμε το όνομά σου στο προσωπικό του καταστήματος. Διάλεξέ το ξανά ή ρώτα τον υπεύθυνο. | We can't find you on this store's staff list. Pick your name again or ask your store manager. | – |
| `employee_required` | staff (undo) | Για την αναίρεση χρειάζεται το PIN σου. Διάλεξε το όνομά σου και πληκτρολόγησέ το. | Undo needs your PIN. Pick your name and type it in. | – |
| `bad_pin` | staff | Λάθος PIN. Δοκίμασε ξανά. Αν το ξέχασες, ο υπεύθυνος μπορεί να σου ορίσει νέο. | Wrong PIN. Try again. If you've forgotten it, your store manager can set a new one. | – |
| `brand_not_found` | member (join) | Δεν βρήκαμε το πρόγραμμα. Σκάναρε ξανά το QR στο ταμείο ή άνοιξε το {clubUrl}. | We couldn't find the programme. Scan the QR at the counter again or open {clubUrl}. | `{clubUrl}` = club URL |
| `store_not_found` | member (join from store QR) | Αυτό το QR καταστήματος δεν δουλεύει. Γίνε μέλος από το {clubUrl} ή ζήτα ένα χεράκι στο ταμείο. | This store QR isn't working. Join at {clubUrl} instead, or ask us at the counter. | `{clubUrl}` = club URL |
| `referral_not_found` | member (join, v1.1) | Δεν βρίσκουμε αυτόν τον κωδικό πρόσκλησης. Έλεγξέ τον ή σβήσε τον για να συνεχίσεις χωρίς αυτόν. | We can't find that invite code. Check it, or remove it to carry on without one. | – |
| `email_taken` | member (join) | Αυτό το email ανήκει ήδη σε μέλος. Συνδέσου με αυτό ή χρησιμοποίησε άλλο. | This email already belongs to a member. Sign in with it, or use a different one. | – |
| `phone_taken` | member (join) | Αυτό το κινητό ανήκει ήδη σε μέλος. Συνδέσου με αυτό ή χρησιμοποίησε άλλο. | This mobile number already belongs to a member. Sign in with it, or use a different one. | – |
| `member_deleted` | member (join / sign-in) | Αυτός ο λογαριασμός έχει διαγραφεί. Αν θες να ξαναγίνεις μέλος, γράψε μας στο {supportEmail}. | This account has been deleted. If you'd like to join again, email us at {supportEmail}. | `{supportEmail}` = support address |
| `member_not_found` | staff (scan); member rarely | Δεν βρίσκουμε αυτό το μέλος. Ζήτα να ξανανοίξει την κάρτα και σκάναρε πάλι. | We can't find this member. Ask them to reopen their card and scan again. | – |
| `invalid_token` | staff (scan) | Αυτός δεν είναι κωδικός του {programName}. Ζήτα την κάρτα μέλους από την εφαρμογή ή το Wallet. | That's not a {programName} code. Ask for the member card in the app or Wallet. | `{programName}` = program name |
| `expired_token` | staff (scan) | Ο κωδικός άλλαξε. Ζήτα την κάρτα ζωντανά, όχι screenshot, και σκάναρε ξανά. Αν επιμένει, ίσως η ώρα στο κινητό δεν είναι σωστή. | That code has changed. Ask for the live card, not a screenshot, and scan again. If it keeps happening, their phone's clock may be off. | – |
| `old_pass` | staff (scan) | Αυτή η κάρτα Wallet είναι παλιά και δεν ισχύει πια. Ζήτα την κάρτα από την εφαρμογή ή τη νέα κάρτα Wallet. | This is an old Wallet card and it no longer works. Ask for the card in the app or the new Wallet card. | – |
| `amount_not_integer` | staff | Το ποσό δεν διαβάζεται. Γράψε το σε ευρώ και λεπτά, π.χ. 6,40. | We can't read that amount. Type it in euros and cents, e.g. 6.40. | – |
| `amount_not_positive` | staff | Το ποσό πρέπει να είναι πάνω από 0 €. | The amount has to be more than €0. | – |
| `amount_over_limit` | staff | Το ποσό ξεπερνά το όριο των {maxAmount} ανά απόδειξη. Έλεγξε την απόδειξη και, αν είναι σωστή, ενημέρωσε τον υπεύθυνο. | That's over the {maxAmount} limit per receipt. Check the receipt and, if it's right, tell your store manager. | `{maxAmount}` = money from `limits.maxAmountCents` (€80) |
| `amount_too_small` | staff | Αυτό το ποσό είναι πολύ μικρό για να δώσει πόντους. Έλεγξε ότι το πληκτρολόγησες σωστά. | That amount is too small to earn points. Check you typed it correctly. | – |
| `too_soon_after_last_earn` | staff | Σε αυτή την κάρτα μπήκαν πόντοι μόλις τώρα. Περίμενε {minutes} λεπτά ή, αν ήταν λάθος, κάνε αναίρεση και πέρασέ το ξανά. | Points were just added to this card. Wait {minutes} minutes or, if it was a mistake, undo it and enter it again. | `{minutes}` = `limits.minSecondsBetweenEarns` ÷ 60, rounded up (2) |
| `daily_earn_limit_reached` | staff | Αυτή η κάρτα έφτασε το όριο των {maxEarns} αγορών για σήμερα. Πόντοι μπαίνουν ξανά από αύριο. | This card has reached today's limit of {maxEarns} purchases. Points can be added again tomorrow. | `{maxEarns}` = `limits.maxEarnsPerDay` (5) |
| `not_found` | staff (undo, redeem); member (cancel code) | Δεν το βρίσκουμε. Αν είναι κωδικός δώρου, έλεγξε τους 8 χαρακτήρες και δοκίμασε ξανά. | We can't find that. If it's a reward code, check the 8 characters and try again. | – |
| `not_undoable` | staff | Αναίρεση γίνεται μόνο σε πόντους από αγορά. Για οτιδήποτε άλλο, ενημέρωσε τον υπεύθυνο. | Only points from a purchase can be undone. For anything else, tell your store manager. | – |
| `already_undone` | staff | Αυτή η κίνηση έχει ήδη αναιρεθεί. Δεν χρειάζεται να κάνεις κάτι άλλο. | This one has already been undone. Nothing else to do. | – |
| `undo_window_passed` | staff | Πέρασαν πάνω από {minutes} λεπτά, οπότε την αναίρεση μπορεί να την κάνει μόνο ο υπεύθυνος του καταστήματος. | It's been more than {minutes} minutes, so only your store manager can undo this now. | `{minutes}` = `limits.undoWindowMinutes` (10) |
| `reward_not_found` | member | Αυτό το δώρο δεν υπάρχει πια. Διάλεξε κάποιο άλλο. | This reward isn't around any more. Pick another one. | – |
| `reward_unavailable` | member | Αυτό το δώρο δεν είναι διαθέσιμο αυτή τη στιγμή. Διάλεξε κάποιο άλλο. | This reward isn't available right now. Pick another one. | – |
| `tier_too_low` | member | Αυτό το δώρο είναι για μέλη {tier} και πάνω. Συνέχισε να μαζεύεις πόντους! | This reward is for {tier} members and above. Keep collecting! | `{tier}` = reward `min_tier` name |
| `insufficient_points` | member | Δεν έχεις ακόμα αρκετούς πόντους για αυτό το δώρο. Συνέχισε να μαζεύεις και θα είναι δικό σου. | You don't have enough points for this one yet. Keep collecting and it's yours. | – |
| `already_used` | staff (redeem); member (cancel) | Αυτός ο κωδικός έχει ήδη χρησιμοποιηθεί, οπότε δεν ισχύει ξανά. | This code has already been used, so it won't work again. | – |
| `cancelled` | staff (redeem); member (cancel) | Αυτός ο κωδικός ακυρώθηκε και οι πόντοι γύρισαν στην κάρτα. Για το δώρο χρειάζεται νέος κωδικός από την εφαρμογή. | This code was cancelled and the points went back on the card. The reward needs a new code from the app. | – |
| `expired` | staff (redeem); member (cancel) | Αυτός ο κωδικός έληξε και οι πόντοι γυρίζουν στην κάρτα. Για το δώρο χρειάζεται νέος κωδικός από την εφαρμογή. | This code has expired and the points go back on the card. The reward needs a new code from the app. | – |
| `unauthenticated` | both (API) | Η σύνδεσή σου έληξε. Συνδέσου ξανά για να συνεχίσεις. | You've been signed out. Sign in again to carry on. | – |
| `internal_error` | both (API) | Κάτι πήγε στραβά από τη μεριά μας. Δοκίμασε ξανά σε λίγο. | Something went wrong on our side. Try again in a moment. | – |
| `network_error` | both (app, offline) | Δεν υπάρχει σύνδεση στο ίντερνετ. Έλεγξε το Wi-Fi ή τα δεδομένα και δοκίμασε ξανά. | No internet connection. Check your Wi-Fi or mobile data and try again. | – |
| `unknown` | both (app fallback) | Κάτι δεν πήγε όπως έπρεπε. Δοκίμασε ξανά. | Something didn't work. Please try again. | – |

---

## g. In-store print

The QR on the counter stand opens `{clubUrl}/join?store={storeCode}`: one stand per store, codes in `data/stores.json`. Greek large, English smaller underneath, as on the website.

### g1. Counter QR stand

| Key | Ελληνικά | English |
| --- | --- | --- |
| `print.stand.headline` (4 words) | Μάζευε πόντους, κέρδιζε κρουασάν. | Collect points. Earn croissants. |
| `print.stand.headlineAlt` (5 words) | Κάθε επίσκεψη προσθέτει μια στρώση. | Every visit adds a layer. |
| `print.stand.subline` | Δωρεάν εγγραφή και κρουασάν βουτύρου κερασμένο μετά την πρώτη σου αγορά. | Free to join, with a butter croissant on us after your first purchase. |
| `print.stand.cta` | Σκάναρε και γίνε μέλος | Scan to join |
| `print.stand.url` | ή άνοιξε το {clubUrl} | or go to {clubUrl} |
| `print.stand.wallet` | Δεν χρειάζεται εφαρμογή: η κάρτα σου ζει στο κινητό και στο Wallet. | No app needed: your card lives on your phone and in Wallet. |

### g2. Cup / bag sticker

The optional QR on the sticker opens `{clubUrl}/join` (no store code).

| Key | Ελληνικά | English |
| --- | --- | --- |
| `print.sticker.line1` | Την επόμενη φορά, αυτό μετράει πόντους. | Next time, this one earns points. |
| `print.sticker.line2` | Γίνε μέλος στο {clubUrl} | Join at {clubUrl} |
| `print.sticker.alt` | Good things come in layers. Και σε πόντους. | Good things come in layers. And points. |

### g3. A4 poster

| Key | Ελληνικά | English |
| --- | --- | --- |
| `print.poster.headline` | Κάθε επίσκεψη προσθέτει μια στρώση. | Every visit adds a layer. |
| `print.poster.intro` | Γνώρισε το {programName}: μάζευε πόντους σε κάθε αγορά και εξαργύρωσέ τους σε καφέ, κρουασάν και άλλα καλούδια. | Meet {programName}: collect points every time you buy and swap them for coffee, croissants and more. |
| `print.poster.step1` | Σκάναρε και γίνε μέλος, δωρεάν. | Scan and join for free. |
| `print.poster.step2` | Δείχνε την κάρτα σου στο ταμείο: 10 πόντοι για κάθε 1 €. | Show your card at the till: 10 points for every €1. |
| `print.poster.step3` | Εξαργύρωσε τους πόντους σου. Ένας espresso θέλει μόνο 300. | Spend your points. An espresso takes just 300. |
| `print.poster.welcome` | Και για αρχή: κρουασάν βουτύρου κερασμένο, μετά την πρώτη σου αγορά. | And to start you off: a butter croissant on us after your first purchase. |
| `print.poster.wallet` | Στο κινητό σου ή στο Apple Wallet και στο Google Wallet. Χωρίς εφαρμογή. | On your phone, or in Apple Wallet and Google Wallet. No app needed. |
| `print.poster.cta` | Σκάναρε εδώ | Scan here |
| `print.poster.url` | {clubUrl} | {clubUrl} |
| `print.poster.small` | Οι πόντοι ισχύουν 12 μήνες από την τελευταία σου αγορά. Όροι: {termsUrl} | Points are valid for 12 months after your last purchase. Terms: {termsUrl} |

### g4. Staff training card (one page)

| Key | Ελληνικά | English |
| --- | --- | --- |
| `print.training.title` | Το {programName} στο ταμείο, σε 6 βήματα | {programName} at the till, in 6 steps |
| `print.training.step1` | **Μπες.** Διάλεξε το όνομά σου και πληκτρολόγησε το PIN σου. Το PIN είναι μόνο δικό σου. | **Sign in.** Pick your name and type your PIN. Your PIN is yours alone. |
| `print.training.step2` | **Σκάναρε.** Ζήτα την κάρτα (στο κινητό ή στο Wallet) και σκάναρε το QR. Έλεγξε ότι το όνομα ταιριάζει. | **Scan.** Ask for their card (on the phone or in Wallet) and scan the QR. Check the name matches. |
| `print.training.step3` | **Πόντοι.** Πληκτρολόγησε το ποσό της απόδειξης και πάτα «Καταχώριση πόντων». Έως 80 € ανά απόδειξη. | **Points.** Type the receipt total and tap "Add points". Up to €80 per receipt. |
| `print.training.step4` | **Λάθος;** Πάτα «Αναίρεση» μέσα σε 10 λεπτά, με το PIN σου, και πέρασε ξανά το σωστό ποσό. Μετά τα 10 λεπτά, μόνο ο υπεύθυνος. | **Mistake?** Tap "Undo" within 10 minutes, with your PIN, and enter the right amount. After 10 minutes, only the store manager can. |
| `print.training.step5` | **Δώρο.** Σκάναρε τον κωδικό δώρου στο κινητό του πελάτη (ή γράψε τους 8 χαρακτήρες), έλεγξε το δώρο στην οθόνη και πάτα «Επιβεβαίωση εξαργύρωσης». Ο κωδικός ισχύει 15 λεπτά. | **Reward.** Scan the reward code on their phone (or type the 8 characters), check the reward on screen and tap "Confirm redemption". Codes last 15 minutes. |
| `print.training.step6` | **Ταμειακή.** Πέρασε το δώρο στην ταμειακή με έκπτωση 100%, για να βγει σωστή η απόδειξη. | **POS.** Ring the reward up on the POS with a 100% discount, so the receipt is right. |
| `print.training.footer` | Αν η οθόνη δείξει μήνυμα, σου λέει και τι να κάνεις. Για οτιδήποτε άλλο, ο υπεύθυνος του καταστήματος. | If the screen shows a message, it also tells you what to do. For anything else, ask your store manager. |
| `print.training.invite.title` | Η πρόσκληση των 10 δευτερολέπτων | The 10-second invite |
| `print.training.invite.1` | «Είσαι μέλος στο {programName}; Είναι δωρεάν.» | "Are you in {programName}? It's free." |
| `print.training.invite.2` | «Σκάναρε το QR εδώ. Με την πρώτη σου αγορά, κρουασάν βουτύρου κερασμένο.» | "Scan the QR here. Your first purchase gets you a butter croissant on us." |
| `print.training.invite.3` | «Γίνε μέλος όσο ετοιμάζουμε την παραγγελία σου, και μετράει κι αυτή.» | "Join while we make your order, and this one counts too." |

---

## h. Landing page (`{clubUrl}`)

The web app's home page is the landing page: logged-out visitors see this content with the join CTA (`{clubUrl}/join`); signed-in members see their card. The counter QR opens `{clubUrl}/join?store={storeCode}` (§a1).

### h1. Hero and how it works

| Key | Ελληνικά | English |
| --- | --- | --- |
| `landing.meta.title` | {programName} · Πόντοι και δώρα σε κάθε Overoll | {programName} · Points and treats at every Overoll |
| `landing.meta.description` | Γίνε μέλος δωρεάν, μάζευε πόντους σε κάθε αγορά και εξαργύρωσέ τους σε καφέ και κρουασάν. | Join for free, collect points every time you buy and swap them for coffee and croissants. |
| `landing.hero.title` | Κάθε επίσκεψη προσθέτει μια στρώση. | Every visit adds a layer. |
| `landing.hero.subline` | Το {programName} είναι το πρόγραμμα επιβράβευσης του Overoll. Μάζευε πόντους σε κάθε αγορά και εξαργύρωσέ τους σε καφέ, κρουασάν και άλλα καλούδια. | {programName} is Overoll's loyalty programme. Collect points every time you buy and swap them for coffee, croissants and more. |
| `landing.hero.cta` | Γίνε μέλος, δωρεάν | Join for free |
| `landing.hero.signIn` | Είσαι ήδη μέλος; Σύνδεση | Already a member? Sign in |
| `landing.hero.note` | Χωρίς εφαρμογή: η κάρτα σου ανοίγει εδώ ή μπαίνει στο Apple Wallet και στο Google Wallet. | No app needed: your card opens right here or goes into Apple Wallet or Google Wallet. |
| `landing.how.title` | Πώς δουλεύει | How it works |
| `landing.how.1.title` | Γίνε μέλος | Join |
| `landing.how.1.body` | Σκάναρε το QR στο ταμείο ή πάτα «Γίνε μέλος». Χρειάζεσαι μόνο email ή κινητό. | Scan the QR at the counter or tap "Join". All you need is an email or mobile number. |
| `landing.how.2.title` | Μάζευε πόντους | Collect points |
| `landing.how.2.body` | Δείχνε την κάρτα σου σε κάθε αγορά: 10 πόντοι για κάθε 1 €, σε όλα τα Overoll. | Show your card every time you buy: 10 points for every €1, at every Overoll. |
| `landing.how.3.title` | Πάρε το κέρασμά σου | Get your treat |
| `landing.how.3.body` | Εξαργύρωσε τους πόντους σου σε καφέ, κρουασάν και άλλα. Και μετά την πρώτη σου αγορά, ένα κρουασάν βουτύρου είναι κερασμένο. | Spend your points on coffee, croissants and more. And after your first purchase, a butter croissant is on us. |

### h2. Rewards, tiers, stores

| Key | Ελληνικά | English |
| --- | --- | --- |
| `landing.rewards.title` | Τα δώρα | The rewards |
| `landing.rewards.intro` | Πόσους πόντους θέλει το καθένα. Στο Gold και στο Club, ακόμα λιγότερους. | How many points each one takes. In Gold and Club, even fewer. |
| `landing.rewards.welcome` | Κερασμένο, μία φορά: ένα κρουασάν βουτύρου μετά την πρώτη σου αγορά. | On us, once: a butter croissant after your first purchase. |
| `landing.rewards.note` | Τα δώρα και οι πόντοι που χρειάζονται μπορεί να αλλάξουν. Στην κάρτα σου βλέπεις πάντα τα τρέχοντα. | Rewards and their points can change. Your card always shows the current ones. |
| `landing.tiers.title` | Όσο έρχεσαι, τόσο ανεβαίνεις | The more you visit, the higher you go |
| `landing.stores.title` | Βρες το δικό σου Overoll | Find your Overoll |
| `landing.stores.intro` | Οι πόντοι σου μετράνε σε όλα τα Overoll σε Αττική και Θεσσαλονίκη, με τους ίδιους κανόνες παντού. Μάζευε σε ένα, εξαργύρωσε σε άλλο. | Your points count at every Overoll in Attica and Thessaloniki, with the same rules everywhere. Collect at one, redeem at another. |

The rewards list renders from the catalog (names from `data/rewards.json`, costs from `packages/core`), never hard-coded. Today it reads:

| Reward (el / en) | Classic | Gold | Club |
| --- | ---: | ---: | ---: |
| Espresso ή διπλός ελληνικός / Espresso or double Greek coffee | 300 | 240 | 210 |
| Καφές της επιλογής σου / Any coffee | 400 | 320 | 280 |
| Croissant βουτύρου / Butter croissant | 400 | 320 | 280 |
| Κρουασάν της επιλογής σου / Croissant of your choice | 550 | 440 | 390 |
| Σάντουιτς της επιλογής σου / Sandwich of your choice | 800 | 640 | 560 |
| Croissant + καφές / Croissant + coffee | 850 | 680 | 600 |
| Overoll Croissant Box / Overoll Croissant Box | 1950 | 1560 | 1370 |

The tiers block reuses `tiers.*.name` and `tiers.*.benefit` (§c). The store list renders from `data/stores.json` with the existing `stores.*` keys.

### h3. FAQ

| Key | Ελληνικά | English |
| --- | --- | --- |
| `landing.faq.title` | Συχνές ερωτήσεις | FAQ |
| `landing.faq.cost.q` | Κοστίζει κάτι; | Does it cost anything? |
| `landing.faq.cost.a` | Όχι. Η εγγραφή και η κάρτα είναι δωρεάν. | No. Joining and the card are free. |
| `landing.faq.expiry.q` | Λήγουν οι πόντοι; | Do points expire? |
| `landing.faq.expiry.a` | Μόνο αν περάσουν 12 μήνες χωρίς καμία αγορά με την κάρτα σου. Κάθε αγορά τους ανανεώνει όλους για άλλους 12 μήνες, και 30 και 7 μέρες πριν τη λήξη σου στέλνουμε υπενθύμιση. | Only after 12 months without a purchase on your card. Every purchase renews all of them for another 12 months, and we send you a reminder 30 and 7 days before they expire. |
| `landing.faq.stores.q` | Σε ποια καταστήματα ισχύει; | Which stores take part? |
| `landing.faq.stores.a` | Σε όλα τα Overoll σε Αττική και Θεσσαλονίκη, με τους ίδιους κανόνες. Μπορείς να μαζεύεις σε ένα κατάστημα και να εξαργυρώνεις σε άλλο. | Every Overoll in Attica and Thessaloniki, with the same rules. You can collect at one store and redeem at another. |
| `landing.faq.wallet.q` | Χρειάζεται να κατεβάσω εφαρμογή; | Do I need to download an app? |
| `landing.faq.wallet.a` | Όχι. Η κάρτα σου ανοίγει στο {clubUrl} από τον browser του κινητού σου και μπαίνει στο Apple Wallet ή στο Google Wallet με ένα πάτημα. Στο Wallet οι πόντοι ενημερώνονται μόνοι τους· για να εξαργυρώσεις δώρο, άνοιξε το {clubUrl}. | No. Your card opens at {clubUrl} in your phone's browser and goes into Apple Wallet or Google Wallet with one tap. In Wallet your points update by themselves; to redeem a reward, open {clubUrl}. |
| `landing.faq.delivery.q` | Μετράνε οι παραγγελίες από efood και Wolt; | Do efood and Wolt orders count? |
| `landing.faq.delivery.a` | Όχι ακόμα. Στην αρχή, πόντοι μπαίνουν μόνο σε αγορές μέσα στα καταστήματα. | Not yet. At launch, points are for in-store purchases only. |
| `landing.faq.privacy.q` | Τι κάνετε με τα στοιχεία μου; | What do you do with my data? |
| `landing.faq.privacy.a` | Τα χρησιμοποιούμε για να λειτουργεί η κάρτα σου: πόντοι, δώρα, ιστορικό. Προσφορές σου στέλνουμε μόνο αν το έχεις επιλέξει, και το αλλάζεις όποτε θες από το Προφίλ. Όλες οι λεπτομέρειες στην Πολιτική απορρήτου. | We use it to run your card: points, rewards, history. We only send you offers if you've said yes, and you can change that any time in Profile. All the details are in our Privacy policy. |
| `landing.faq.delete.q` | Πώς διαγράφω τον λογαριασμό μου; | How do I delete my account? |
| `landing.faq.delete.a` | Από το Προφίλ, πάτα «Διαγραφή λογαριασμού». Σβήνουμε τα προσωπικά σου στοιχεία και οι πόντοι σου χάνονται. Αν θες, κατέβασε πρώτα ένα αντίγραφο των δεδομένων σου. | In Profile, tap "Delete account". We erase your personal details and your points are lost. If you like, download a copy of your data first. |
| `landing.faq.contact.q` | Πώς επικοινωνώ μαζί σας; | How do I get in touch? |
| `landing.faq.contact.a` | Ρώτα μας σε οποιοδήποτε Overoll ή γράψε μας στο {supportEmail}. | Ask us at any Overoll, or email us at {supportEmail}. |

### h4. Final call to action

| Key | Ελληνικά | English |
| --- | --- | --- |
| `landing.final.title` | Good things come in layers. | Good things come in layers. |
| `landing.final.body` | Γίνε μέλος και η επόμενη αγορά σου μετράει κιόλας. | Join now and your very next purchase counts. |
| `landing.final.cta` | Γίνε μέλος, δωρεάν | Join for free |

---

## i. App Store and Google Play listings

Counts are characters (Greek letters count as one in App Store Connect and Play Console), with `{programName}` = "Overoll Club" and `{clubUrl}` counted as 20 characters. Apple guideline 2.3.10 forbids naming other platforms in iOS metadata, so the iOS description says "Apple Wallet" and the Play description swaps that one line for "Google Wallet" (+1 character). Google Play has no subtitle, promotional text or keyword field; it uses the short description (≤ 80) instead. Marketing URL and support URL: `{clubUrl}`.

### `store.name` · App name (App Store and Google Play) · limit 30

| | Text | Chars |
| --- | --- | ---: |
| Ελληνικά | Overoll Club | 12 |
| English | Overoll Club | 12 |

### `store.subtitle` · App Store subtitle · limit 30

| | Text | Chars |
| --- | --- | ---: |
| Ελληνικά | Δώρα σε καφέ και κρουασάν | 25 |
| English | Coffee & croissant rewards | 26 |

### `store.short` · Google Play short description · limit 80

| | Text | Chars |
| --- | --- | ---: |
| Ελληνικά | Μάζευε πόντους σε κάθε Overoll και εξαργύρωσέ τους σε καφέ και κρουασάν. | 72 |
| English | Collect points at every Overoll and swap them for coffee and croissants. | 72 |

### `store.promo` · App Store promotional text · limit 170

| | Text | Chars |
| --- | --- | ---: |
| Ελληνικά | Γίνε μέλος δωρεάν και πάρε ένα κρουασάν βουτύρου κερασμένο μετά την πρώτη σου αγορά. Μάζευε πόντους σε κάθε Overoll και εξαργύρωσέ τους σε καφέ και κρουασάν. | 157 |
| English | Join for free and get a butter croissant on us after your first purchase. Collect points at every Overoll and swap them for coffee and croissants. | 146 |

### `store.keywords` · App Store keywords: commas without spaces, no words from the app name · limit 100

| | Text | Chars |
| --- | --- | ---: |
| Ελληνικά | κρουασάν,καφές,πόντοι,δώρα,επιβράβευση,πρωινό,καφετέρια,αρτοποιείο,γλυκά,Αθήνα,Θεσσαλονίκη | 90 |
| English | croissant,coffee,loyalty,rewards,points,bakery,cafe,breakfast,pastry,free coffee,Athens,Thessaloniki | 100 |

### `store.description` · Description · limit 4000, aim ~1200

Ελληνικά: **1286 characters**

```text
Το {programName} είναι το πρόγραμμα επιβράβευσης του Overoll Croissanterie. Κάθε επίσκεψη προσθέτει μια στρώση: μάζευε πόντους σε κάθε αγορά και εξαργύρωσέ τους σε καφέ, κρουασάν και άλλα καλούδια.

ΠΩΣ ΔΟΥΛΕΥΕΙ
• Γίνε μέλος δωρεάν με email ή κινητό, χωρίς κωδικό πρόσβασης.
• Δείξε την κάρτα σου στο ταμείο: 10 πόντοι για κάθε 1 €.
• Εξαργύρωσε τους πόντους σε espresso, καφέ, κρουασάν, σάντουιτς ή ένα Overoll Croissant Box.
• Με την πρώτη σου αγορά, ένα κρουασάν βουτύρου κερασμένο.

ΕΠΙΠΕΔΑ
• Gold, με 1.500 πόντους σε 12 μήνες: +25% πόντοι και δώρα με 20% λιγότερους πόντους.
• Club, με 4.000 πόντους σε 12 μήνες: +50% πόντοι και δώρα με 30% λιγότερους πόντους.

ΣΤΗΝ ΕΦΑΡΜΟΓΗ
• Ασφαλής κωδικός QR που αλλάζει κάθε 30 δευτερόλεπτα και δουλεύει και χωρίς ίντερνετ.
• Η κάρτα σου και στο Apple Wallet.
• Ιστορικό πόντων και ειδοποιήσεις, αν τις θες.
• Όλα τα καταστήματα, με το σημερινό ωράριο και οδηγίες.
• Ελληνικά και αγγλικά. Κατέβασε ή διάγραψε τα δεδομένα σου όποτε θες.

ΚΑΛΟ ΝΑ ΞΕΡΕΙΣ
Οι πόντοι ισχύουν 12 μήνες από την τελευταία σου αγορά και κάθε αγορά τους ανανεώνει. Ισχύει σε όλα τα Overoll σε Αττική και Θεσσαλονίκη. Οι παραγγελίες delivery δεν μετράνε προς το παρόν. Προτιμάς τον browser; Η κάρτα σου δουλεύει και στο {clubUrl}.

Good things come in layers.
```

English: **1232 characters**

```text
{programName} is the loyalty programme of Overoll Croissanterie. Every visit adds a layer: collect points every time you buy and swap them for coffee, croissants and more.

HOW IT WORKS
• Join for free with your email or mobile number. No password needed.
• Show your card at the till: 10 points for every €1.
• Spend your points on an espresso, a coffee, a croissant, a sandwich or an Overoll Croissant Box.
• Your first purchase unlocks a butter croissant, on us.

TIERS
• Gold, at 1,500 points in 12 months: 25% more points and rewards for 20% fewer points.
• Club, at 4,000 points in 12 months: 50% more points and rewards for 30% fewer points.

IN THE APP
• A secure QR code that changes every 30 seconds and works offline.
• Your card in Apple Wallet too.
• Your points history, and notifications if you want them.
• All our stores, with today's opening hours and directions.
• Greek and English. Download or delete your data any time.

GOOD TO KNOW
Points are valid for 12 months after your last purchase, and every purchase renews them. Valid at every Overoll in Attica and Thessaloniki. Delivery orders don't earn points for now. Prefer the browser? Your card also works at {clubUrl}.

Good things come in layers.
```

---

## j. Programme terms in plain language

> **DRAFT, NEEDS LEGAL REVIEW.** Plain-language summary to sit at the top of `{termsUrl}`; it does not replace the full terms. Items marked *[proposed]* are not in the spec yet: Dimos and the lawyer decide.

| Key | Ελληνικά | English |
| --- | --- | --- |
| `terms.1` | Η εγγραφή είναι δωρεάν. Κάθε email και κάθε κινητό αντιστοιχεί σε ένα μόνο μέλος. | Joining is free. Each email address and each mobile number can belong to one member only. |
| `terms.2` | Παίρνεις 10 πόντους για κάθε 1 € της απόδειξης (στρογγυλοποίηση προς τα κάτω), όταν δείχνεις την κάρτα σου σε αγορά μέσα σε κατάστημα Overoll. Οι παραγγελίες delivery δεν μετράνε προς το παρόν. | You get 10 points for every €1 on your receipt (rounded down) when you show your card for an in-store purchase at Overoll. Delivery orders don't count for now. |
| `terms.3` | Για να είναι δίκαιο για όλους: έως 80 € ανά απόδειξη, έως 5 αγορές με πόντους την ημέρα και όχι δεύτερη μέσα σε 2 λεπτά. | To keep it fair: up to €80 per receipt, up to 5 purchases with points a day, and not a second one within 2 minutes. |
| `terms.4` | Επίπεδα: Gold με 1.500 και Club με 4.000 πόντους μέσα σε 12 μήνες. Το Gold δίνει 25% περισσότερους πόντους και δώρα με 20% λιγότερους πόντους, το Club 50% και 30%. Ανεβαίνεις αμέσως· το επίπεδο ελέγχεται κάθε χρόνο στην επέτειο εγγραφής και πέφτει το πολύ ένα σκαλί. | Tiers: Gold at 1,500 and Club at 4,000 points in 12 months. Gold gives 25% more points and rewards for 20% fewer points; Club 50% and 30%. You move up straight away; your tier is reviewed every year on your joining anniversary and drops one level at most. |
| `terms.5` | Τα δώρα εξαργυρώνονται με κωδικό μίας χρήσης που ισχύει 15 λεπτά. Αν τον ακυρώσεις ή λήξει, οι πόντοι επιστρέφουν. Τα δώρα και οι πόντοι που χρειάζονται μπορεί να αλλάξουν. | Rewards are redeemed with a single-use code that's valid for 15 minutes. If you cancel it or it expires, the points come back. Rewards and their points can change. |
| `terms.6` | Κρουασάν καλωσορίσματος: ένα κρουασάν βουτύρου, μία φορά ανά μέλος, μετά την πρώτη αγορά. Δεν μετράει για τα επίπεδα. | Welcome croissant: one butter croissant, once per member, after the first purchase. It doesn't count towards tiers. |
| `terms.7` | Οι πόντοι λήγουν 12 μήνες μετά την τελευταία σου αγορά με την κάρτα και κάθε αγορά τους ανανεώνει. Σου στέλνουμε υπενθύμιση 30 και 7 μέρες πριν. | Points expire 12 months after your last purchase with your card, and every purchase renews them. We remind you 30 and 7 days before. |
| `terms.9` | Λάθη στο ταμείο διορθώνονται. Αν επιστραφεί μια αγορά, αφαιρούνται και οι πόντοι της, ακόμα κι αν το υπόλοιπό σου γίνει αρνητικό. *[Προτείνεται]* Τα δώρα δεν ανταλλάσσονται με χρήματα, και σε περίπτωση κατάχρησης ο λογαριασμός μπορεί να ανασταλεί. | Mistakes at the till are corrected. If a purchase is refunded, its points are taken back, even if your balance goes below zero. *[Proposed]* Rewards have no cash value, and an account can be suspended for misuse. |
| `terms.10` | Τα στοιχεία σου χρησιμοποιούνται για να λειτουργεί το πρόγραμμα· προσφορές μόνο με τη συγκατάθεσή σου. Κατεβάζεις ή διαγράφεις τα δεδομένα σου όποτε θες από το Προφίλ (με τη διαγραφή χάνονται οι πόντοι). *[Προτείνεται]* Αλλαγές στους όρους ανακοινώνονται στα μέλη πριν ισχύσουν. | Your data is used to run the programme; offers only with your consent. Download or delete your data any time in Profile (deleting loses your points). *[Proposed]* Members are told about changes to the terms before they apply. |

---

## k. Program name ideas

The owner asked for something "more social". **Overoll Club stays the default** until he picks.

| # | Name | Why |
| --- | --- | --- |
| 1 | **Overoll Parea** (Overoll Παρέα) | "Παρέα" is the Greek word for your group of friends, the most social word in the language; many English speakers in Athens know it, and «Είσαι στην Παρέα;» is natural at the counter. Feminine in Greek (see the notes above). |
| 2 | **Overollers** | Names the people, not the programme: «Είσαι Overoller;» / "Are you an Overoller?" turns members into a crew; one word, the same in both languages, easy to hashtag. |
| 3 | **Overoll Crew** | Short and friendly, and "crew" is already everyday English in Greece; "Join the crew" / «Μπες στο crew» works as a CTA in both languages. |
| 4 | **The Fold** | Croissants are folded, and "join the fold" means joining a group you belong to; echoes "The first fold" on the website. Strong in English, needs a line of explanation in Greek. |
| 5 | **Overoll Layers** | Carries the tagline (Good things come in layers): every visit adds a layer and the tiers become layers. The least "social" of the five, but the closest brand fit. |

---

## Questions for Dimos

1. **Welcome croissant: how is it given?** The schema can't hold it yet: a redemption needs `points_spent > 0`, and a points bonus would count towards tiers (the spec says it doesn't). The copy assumes it appears in Rewards as a free item, redeemed with a 15-minute code like the others. Confirm, and say whether it expires.
2. **Receipts over €80:** what should the cashier do (enter €80, give no points, call the manager)? The error now says "tell your store manager".
3. **Launch double points:** also during the Chalandri pilot from 7 Dec (the roadmap switches them on in week 5), or only for the 2 weeks after the network launch? I need the end date for `{date}`.
4. **Contact and legal names:** the support address for `{supportEmail}`, Overoll's legal entity for the consents and terms, and who writes the full terms and privacy policy.
5. **Joining again after deleting:** the same login can't rejoin (`member_deleted`). Is "email us" enough, or should deletion allow a fresh start?
6. **Which messages need consent?** Are the welcome email, expiry reminders and "points added" pushes service messages sent to everyone, or only with consent? (For the lawyer too; today there is one `consent_push` for service and offers.)
7. **Points for an order already paid:** may staff add points when a customer joins while waiting for their order? Invite line 3 on the training card assumes yes.
8. **PIN once per shift or every time?** The server checks the PIN on every award, undo and redemption; the training card says "sign in with your PIN" at the start.
9. **Names:** a "Club" tier inside "Overoll Club" reads oddly ("a Club member of Overoll Club"). Rename the tier when the program name is final? Points stay "πόντοι / points"?
10. **Minimum age to join:** not in the spec (lawyer).

### Answered by Dimos (9 Nov 2026)

- Welcome croissant: a free reward redeemed with a code, valid 30 days after the first purchase; never counts towards tiers.
- PIN: once per shift; the console locks after 5 idle minutes.
- Receipt over €80: the cashier enters €80; points up to the limit.
- Minimum age: 15.
- Support email: `club-support@growagency.online` for testing.
- Rejoining after deleting an account: yes, as a new member.
- Club tier: keeps the name for now.
- Service notifications need no marketing consent; offers need the consent.
- Points after paying: allowed the same day at the same store with the receipt number (each receipt once).
- Double points: none at all, neither in the pilot nor at launch. Every double-points text in this deck (`join.welcome.launch`, `card.launch`, `history.earnDouble`, `push.pointsAddedDouble`, `push.launchDouble`, `console.award.double`, `print.stand.launch`, `terms.8`) is dropped.
- Still open (for Overoll): legal entity name.

