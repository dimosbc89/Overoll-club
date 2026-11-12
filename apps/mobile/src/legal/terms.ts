/**
 * Terms of the loyalty programme, one text for every brand (`/terms`). Every
 * number is a placeholder filled from the program config (packages/core) by
 * `legalValues`, so the terms change with the rules. Built from the
 * plain-language terms in docs/copy-deck.md §j. DRAFT for Dimos and the
 * brand's lawyer to approve. Same format as privacy.ts.
 */
export const terms = {
  el: `Τελευταία ενημέρωση: {updated}

Το {programName} είναι το πρόγραμμα επιβράβευσης του {tradeName}, που το διοργανώνει {controller}{controllerAddress}. Με την εγγραφή σου αποδέχεσαι τους παρακάτω όρους. Για το πώς χρησιμοποιούμε τα στοιχεία σου, δες την [Πολιτική απορρήτου](/privacy).

## 1. Εγγραφή

- Η εγγραφή είναι δωρεάν, για άτομα {minimumAge} ετών και άνω.
- Κάθε email αντιστοιχεί σε ένα μόνο μέλος. Η κάρτα είναι προσωπική και δεν μεταβιβάζεται.
- Κράτα ασφαλή την πρόσβαση στο email σου: όποιος έχει τον κωδικό σύνδεσης έχει και την κάρτα σου.

## 2. Πόντοι

- Παίρνεις {pointsPerEuro} πόντους για κάθε 1 € της απόδειξης (στρογγυλοποίηση προς τα κάτω), όταν δείχνεις την κάρτα σου σε αγορά μέσα σε κατάστημα {brandName}. Οι παραγγελίες μέσω εφαρμογών delivery δεν μετράνε, εκτός αν ανακοινώσουμε διαφορετικά.
- Αν ξεχάσεις να δείξεις την κάρτα, μπορείς να πάρεις τους πόντους αργότερα την ίδια μέρα, στο ίδιο κατάστημα, με την απόδειξη. Κάθε απόδειξη δίνει πόντους μία φορά.
- Για να είναι δίκαιο για όλους: έως {maxAmount} ανά απόδειξη, έως {maxEarnsPerDay} αγορές με πόντους την ημέρα και όχι δεύτερη μέσα σε {minMinutesBetweenEarns} λεπτά.
- Λάθη στο ταμείο διορθώνονται. Αν επιστραφεί μια αγορά, αφαιρούνται και οι πόντοι της, ακόμα κι αν το υπόλοιπό σου γίνει αρνητικό.
- Οι πόντοι λήγουν {expiryMonths} μήνες μετά την τελευταία σου αγορά με την κάρτα, και κάθε αγορά τους ανανεώνει όλους. Σου στέλνουμε υπενθύμιση {reminderDays} μέρες πριν.

## 3. Επίπεδα

- {tierClassic}: από την εγγραφή.
- {tierGold}: με {goldThreshold} πόντους μέσα σε {tierWindowMonths} μήνες. {goldBonus}% περισσότεροι πόντοι σε κάθε αγορά και δώρα με {goldDiscount}% λιγότερους πόντους.
- {tierClub}: με {clubThreshold} πόντους μέσα σε {tierWindowMonths} μήνες. {clubBonus}% περισσότεροι πόντοι και δώρα με {clubDiscount}% λιγότερους πόντους.

Ανεβαίνεις αμέσως μόλις φτάσεις τους πόντους. Το επίπεδό σου ελέγχεται κάθε χρόνο στην επέτειο της εγγραφής σου και πέφτει το πολύ ένα επίπεδο. Για τα επίπεδα μετράνε οι πόντοι από αγορές, όχι τα δώρα ή οι διορθώσεις.

## 4. Δώρα

- Εξαργυρώνεις τους πόντους σου σε δώρα από τον κατάλογο της εφαρμογής, σε οποιοδήποτε κατάστημα {brandName}. Κάποια δώρα μπορεί να είναι μόνο για συγκεκριμένα επίπεδα.
- Κάθε εξαργύρωση δίνει έναν κωδικό μίας χρήσης που ισχύει {redemptionMinutes} λεπτά. Αν τον ακυρώσεις ή λήξει, οι πόντοι επιστρέφουν.
- Δώρο καλωσορίσματος: ένα δώρο από τον κατάλογο, μία φορά ανά μέλος, που ξεκλειδώνει με την πρώτη σου αγορά και ισχύει {welcomeDays} μέρες. Δεν μετράει για τα επίπεδα.
- Τα δώρα δεν ανταλλάσσονται με χρήματα ούτε με άλλα προϊόντα και δεν συνδυάζονται με άλλες προσφορές, εκτός αν ανακοινώσουμε διαφορετικά. Ο κατάλογος και οι πόντοι που χρειάζεται κάθε δώρο μπορεί να αλλάξουν· η εφαρμογή δείχνει πάντα τα τρέχοντα.

## 5. Κατάχρηση

Αν διαπιστώσουμε απάτη ή κατάχρηση (για παράδειγμα πόντους από αποδείξεις άλλων ή πολλούς λογαριασμούς για το ίδιο άτομο), μπορούμε να ακυρώσουμε τους σχετικούς πόντους και να αναστείλουμε ή να κλείσουμε τον λογαριασμό. Θα σου εξηγήσουμε τον λόγο και μπορείς να μας απαντήσεις στο [{supportEmail}](mailto:{supportEmail}).

## 6. Διαγραφή λογαριασμού

Μπορείς να διαγράψεις τον λογαριασμό σου όποτε θες από το Προφίλ. Με τη διαγραφή χάνονται οι πόντοι σου και τα δώρα που δεν έχεις χρησιμοποιήσει, και κωδικοί που εκκρεμούν ακυρώνονται χωρίς επιστροφή πόντων. Μπορείς να ξαναγραφτείς αργότερα ως νέο μέλος.

## 7. Αλλαγές και λήξη του προγράμματος

Μπορούμε να αλλάξουμε αυτούς τους όρους ή να τερματίσουμε το πρόγραμμα. Θα ενημερώσουμε τα μέλη στην εφαρμογή ή με email τουλάχιστον 30 μέρες πριν από μια ουσιαστική αλλαγή ή τη λήξη του προγράμματος, ώστε να προλάβεις να εξαργυρώσεις τους πόντους σου.

## 8. Ευθύνη και εφαρμοστέο δίκαιο

Κάνουμε ό,τι μπορούμε ώστε η εφαρμογή να λειτουργεί χωρίς διακοπές, όμως μπορεί περιστασιακά να μην είναι διαθέσιμη. Τότε οι πόντοι σου δεν χάνονται: μπορείς να τους πάρεις αργότερα την ίδια μέρα με την απόδειξη. Οι όροι διέπονται από το ελληνικό δίκαιο, και δεν περιορίζουν τα δικαιώματά σου ως καταναλωτή.

## 9. Επικοινωνία

Ρώτα μας στο ταμείο ή γράψε μας στο [{supportEmail}](mailto:{supportEmail}).
`,
  en: `Last updated: {updated}

{programName} is the loyalty programme of {tradeName}, run by {controller}{controllerAddress}. By joining you accept the terms below. For how we use your data, see the [Privacy policy](/privacy).

## 1. Joining

- Joining is free, for people aged {minimumAge} and over.
- Each email address can belong to one member only. Your card is personal and can't be transferred.
- Keep access to your email safe: whoever has your sign-in code has your card.

## 2. Points

- You get {pointsPerEuro} points for every €1 on your receipt (rounded down) when you show your card for an in-store purchase at {brandName}. Orders through delivery apps don't count unless we announce otherwise.
- If you forget to show your card, you can still get the points later the same day, at the same store, with your receipt. Each receipt earns points once.
- To keep it fair: up to {maxAmount} per receipt, up to {maxEarnsPerDay} purchases with points a day, and not a second one within {minMinutesBetweenEarns} minutes.
- Mistakes at the till are corrected. If a purchase is refunded, its points are taken back, even if your balance goes below zero.
- Points expire {expiryMonths} months after your last purchase with your card, and every purchase renews all of them. We send you a reminder {reminderDays} days before.

## 3. Tiers

- {tierClassic}: from the day you join.
- {tierGold}: at {goldThreshold} points within {tierWindowMonths} months. {goldBonus}% more points on every purchase and rewards for {goldDiscount}% fewer points.
- {tierClub}: at {clubThreshold} points within {tierWindowMonths} months. {clubBonus}% more points and rewards for {clubDiscount}% fewer points.

You move up as soon as you reach the points. Your tier is reviewed every year on the anniversary of the day you joined and drops one level at most. Tiers count points from purchases, not rewards or corrections.

## 4. Rewards

- You spend your points on rewards from the catalog in the app, at any {brandName} store. Some rewards may be for certain tiers only.
- Each redemption gives a single-use code that is valid for {redemptionMinutes} minutes. If you cancel it or it expires, the points come back.
- Welcome gift: one reward from the catalog, once per member, unlocked by your first purchase and valid for {welcomeDays} days. It doesn't count towards tiers.
- Rewards can't be exchanged for cash or other products and can't be combined with other offers unless we say so. The catalog and the points each reward takes can change; the app always shows the current ones.

## 5. Misuse

If we find fraud or misuse (for example points from other people's receipts, or several accounts for one person), we can cancel the points involved and suspend or close the account. We will tell you why, and you can reply to us at [{supportEmail}](mailto:{supportEmail}).

## 6. Deleting your account

You can delete your account any time in Profile. Deleting it loses your points and any unused rewards, and pending codes are cancelled without giving the points back. You can join again later as a new member.

## 7. Changes and the end of the programme

We may change these terms or end the programme. We will tell members in the app or by email at least 30 days before an important change or the end of the programme, so you have time to spend your points.

## 8. Liability and governing law

We do our best to keep the app running without interruptions, but it may sometimes be unavailable. Your points aren't lost: you can get them later the same day with your receipt. These terms are governed by Greek law and do not limit your rights as a consumer.

## 9. Contact

Ask us at the till or email us at [{supportEmail}](mailto:{supportEmail}).
`,
} as const;
