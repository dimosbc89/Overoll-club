/**
 * Privacy policy of the loyalty programme, one text for every brand
 * (`/privacy`). Placeholders come from `legalValues` (src/lib/legal.ts): the
 * brand's legal details and the program config, so the numbers always match
 * the rules in packages/core. DRAFT for Dimos and the brand's lawyer to approve.
 * Format: `## heading`, `- bullet`, blank line between paragraphs,
 * `**bold**`, `[text](url)`.
 */
export const privacy = {
  el: `Τελευταία ενημέρωση: {updated}

Αυτή η πολιτική εξηγεί ποια στοιχεία σου χρησιμοποιούμε στο {programName}, το πρόγραμμα επιβράβευσης του {tradeName}, γιατί, για πόσο, και τι δικαιώματα έχεις. Ισχύει για την εφαρμογή στο iPhone και στο Android και για την κάρτα στο [{siteHost}]({siteUrl}).

## Ποιος είναι υπεύθυνος

Υπεύθυνος επεξεργασίας είναι {controller}{controllerAddress}. Για οτιδήποτε αφορά τα στοιχεία σου γράψε μας στο [{supportEmail}](mailto:{supportEmail}).

Την πλατφόρμα την αναπτύσσει και τη λειτουργεί για λογαριασμό μας η GROW AGENCY L.P., ως εκτελών την επεξεργασία, μόνο με τις οδηγίες μας.

## Ποια στοιχεία χρησιμοποιούμε

- **Λογαριασμός:** το email σου (για να συνδέεσαι με κωδικό μίας χρήσης), το όνομά σου και την επιβεβαίωση ότι είσαι τουλάχιστον {minimumAge} ετών. Αν τα προσθέσεις, και επώνυμο, κινητό και ημερομηνία γενεθλίων.
- **Συμμετοχή στο πρόγραμμα:** τον αριθμό μέλους, το επίπεδό σου, τους πόντους και το ιστορικό τους (ημερομηνία, κατάστημα, ποσό της απόδειξης και, αν δοθεί, αριθμό απόδειξης, ποιος ταμίας την πέρασε), τα δώρα που εξαργυρώνεις και τους κωδικούς τους.
- **Επιλογές επικοινωνίας:** αν θέλεις email, SMS ή ειδοποιήσεις και πότε το άλλαξες.
- **Συσκευή:** τη γλώσσα της εφαρμογής και τη σύνδεσή σου. Ο μυστικός κωδικός της κάρτας σου μένει στη συσκευή σου (στην ασφαλή αποθήκη του κινητού στην εφαρμογή, στον browser στο web) και σβήνεται όταν αποσυνδέεσαι. Αν ενεργοποιήσεις ειδοποιήσεις, κρατάμε και το αναγνωριστικό ειδοποιήσεων της συσκευής.

Δεν χρησιμοποιούμε cookies διαφήμισης, εργαλεία παρακολούθησης ή στατιστικά τρίτων, δεν φτιάχνουμε προφίλ για διαφημίσεις και δεν πουλάμε τα στοιχεία σου.

## Γιατί και με ποια νομική βάση

- **Για να λειτουργεί η κάρτα σου** (πόντοι, επίπεδα, δώρα, ιστορικό, μηνύματα για τον λογαριασμό σου όπως ο κωδικός σύνδεσης και η υπενθύμιση πριν λήξουν οι πόντοι): για την εκτέλεση της συμμετοχής σου στο πρόγραμμα (άρθρο 6 παρ. 1 στοιχ. β ΓΚΠΔ).
- **Για προσφορές και νέα** με email, SMS ή ειδοποιήσεις: μόνο με τη συγκατάθεσή σου (άρθρο 6 παρ. 1 στοιχ. α), που την ανακαλείς όποτε θες από το Προφίλ.
- **Για να προλαμβάνουμε την κατάχρηση και να κρατάμε το πρόγραμμα ασφαλές** (όρια ανά απόδειξη και ανά μέρα, ποιος ταμίας έκανε τι, αρχείο ενεργειών): για το έννομο συμφέρον μας να είναι το πρόγραμμα δίκαιο για όλους (άρθρο 6 παρ. 1 στοιχ. στ).

## Ποιος βλέπει τα στοιχεία σου

- Το προσωπικό στα καταστήματά μας, όταν σκανάρει την κάρτα σου: το όνομα, το επίπεδο και τους πόντους σου.
- Η GROW AGENCY L.P., που λειτουργεί την πλατφόρμα για εμάς.
- Οι πάροχοι που χρησιμοποιεί η πλατφόρμα, μόνο για την υπηρεσία τους: Supabase (βάση δεδομένων και σύνδεση, διακομιστές στη Φρανκφούρτη), Cloudflare (φιλοξενία της εφαρμογής web), Resend (αποστολή των email σύνδεσης, διακομιστές στην Ιρλανδία), και η Apple και η Google για τη διανομή της εφαρμογής, τις ειδοποιήσεις και το Wallet, αν τα χρησιμοποιείς.

Όπου κάποιος πάροχος επεξεργάζεται στοιχεία εκτός του Ευρωπαϊκού Οικονομικού Χώρου, αυτό γίνεται με τις εγγυήσεις του ΓΚΠΔ, όπως τις τυποποιημένες συμβατικές ρήτρες της Ευρωπαϊκής Επιτροπής ή το Πλαίσιο Προστασίας Δεδομένων ΕΕ-ΗΠΑ.

## Για πόσο τα κρατάμε

- Όσο είσαι μέλος. Οι πόντοι λήγουν {expiryMonths} μήνες μετά την τελευταία σου αγορά, ο λογαριασμός σου όμως μένει μέχρι να τον διαγράψεις.
- Όταν διαγράφεις τον λογαριασμό σου (Προφίλ → Διαγραφή λογαριασμού), σβήνουμε αμέσως όνομα, email, κινητό, γενέθλια και επιλογές επικοινωνίας, και ο λογαριασμός σύνδεσης διαγράφεται. Το ιστορικό πόντων μένει χωρίς προσωπικά στοιχεία, γιατί είναι μέρος των λογαριασμών των καταστημάτων.
- Οι κωδικοί σύνδεσης ισχύουν λίγα λεπτά και οι κωδικοί δώρων {redemptionMinutes} λεπτά.

## Τα δικαιώματά σου

Έχεις δικαίωμα πρόσβασης, διόρθωσης, διαγραφής, περιορισμού, φορητότητας και εναντίωσης, και να ανακαλείς όποτε θες τη συγκατάθεσή σου για προσφορές. Τα περισσότερα τα κάνεις μόνος σου από το Προφίλ. Για τα υπόλοιπα, όπως ένα αντίγραφο των δεδομένων σου, γράψε μας στο [{supportEmail}](mailto:{supportEmail}) και θα σου απαντήσουμε μέσα σε έναν μήνα.

Αν πιστεύεις ότι παραβιάζονται τα δικαιώματά σου, μπορείς να υποβάλεις καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα ([www.dpa.gr](https://www.dpa.gr)).

## Ηλικία

Το πρόγραμμα είναι για άτομα {minimumAge} ετών και άνω. Δεν δεχόμαστε εν γνώσει μας μέλη μικρότερης ηλικίας.

## Ασφάλεια

Τα στοιχεία ταξιδεύουν κρυπτογραφημένα, η πρόσβαση στη βάση περιορίζεται με κανόνες ανά ρόλο και κάθε ενέργεια του προσωπικού καταγράφεται. Ο κωδικός QR της κάρτας σου αλλάζει κάθε λίγα δευτερόλεπτα, ώστε ένα στιγμιότυπο οθόνης να μη μπορεί να χρησιμοποιηθεί από άλλον.

## Αλλαγές

Αν αλλάξει κάτι ουσιαστικό σε αυτή την πολιτική, θα σε ενημερώσουμε στην εφαρμογή ή με email πριν ισχύσει.
`,
  en: `Last updated: {updated}

This policy explains which of your details we use in {programName}, the loyalty programme of {tradeName}, why, for how long, and what your rights are. It covers the iPhone and Android app and the card at [{siteHost}]({siteUrl}).

## Who is responsible

The data controller is {controller}{controllerAddress}. For anything about your data, email us at [{supportEmail}](mailto:{supportEmail}).

The platform is built and run for us by GROW AGENCY L.P., as our processor, on our instructions only.

## What we use

- **Account:** your email address (to sign in with a one-time code), your first name and your confirmation that you are at least {minimumAge}. If you add them, also your last name, mobile number and birthday.
- **Taking part:** your member number, tier, points and their history (date, store, receipt amount and, if given, receipt number, which cashier entered it), the rewards you redeem and their codes.
- **Contact choices:** whether you want email, SMS or notifications, and when you changed that.
- **Device:** the app language and your sign-in session. The secret behind your card's QR code stays on your device (in the phone's secure storage in the app, in the browser on the web) and is removed when you sign out. If you turn on notifications, we also keep your device's notification ID.

We use no advertising cookies, tracking tools or third-party analytics, we build no advertising profiles and we never sell your data.

## Why, and on what legal basis

- **To run your card** (points, tiers, rewards, history, and messages about your account such as your sign-in code and the reminder before your points expire): to provide your membership of the programme (Article 6(1)(b) GDPR).
- **For offers and news** by email, SMS or notifications: only with your consent (Article 6(1)(a)), which you can withdraw any time in Profile.
- **To prevent misuse and keep the programme secure** (limits per receipt and per day, which cashier did what, a log of actions): our legitimate interest in keeping the programme fair for everyone (Article 6(1)(f)).

## Who sees your data

- The staff at our stores, when they scan your card: your first name, tier and points.
- GROW AGENCY L.P., which runs the platform for us.
- The providers the platform uses, only for their service: Supabase (database and sign-in, servers in Frankfurt), Cloudflare (hosting of the web app), Resend (sending sign-in emails, servers in Ireland), and Apple and Google for distributing the app, notifications and Wallet, if you use them.

Where a provider processes data outside the European Economic Area, it does so with GDPR safeguards such as the European Commission's standard contractual clauses or the EU-US Data Privacy Framework.

## How long we keep it

- For as long as you are a member. Points expire {expiryMonths} months after your last purchase, but your account stays until you delete it.
- When you delete your account (Profile → Delete account), we erase your name, email, mobile number, birthday and contact choices at once, and your sign-in account is deleted. Your points history stays without personal details, because it is part of the stores' accounts.
- Sign-in codes are valid for a few minutes and reward codes for {redemptionMinutes} minutes.

## Your rights

You have the right to access, correct, erase, restrict and port your data and to object, and you can withdraw your consent to offers any time. You can do most of this yourself in Profile. For the rest, such as a copy of your data, email us at [{supportEmail}](mailto:{supportEmail}) and we will reply within one month.

If you believe your rights are being breached, you can complain to the Hellenic Data Protection Authority ([www.dpa.gr](https://www.dpa.gr)).

## Age

The programme is for people aged {minimumAge} and over. We do not knowingly accept younger members.

## Security

Data travels encrypted, access to the database is limited by rules for each role, and every staff action is logged. Your card's QR code changes every few seconds, so a screenshot can't be used by someone else.

## Changes

If anything important in this policy changes, we will tell you in the app or by email before it applies.
`,
} as const;
