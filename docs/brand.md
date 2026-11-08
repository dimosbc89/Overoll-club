# Overoll brand for the apps

Taken from the Overoll website we built (`dimosbc89/overoll-croissanterie`: `public/styles.css`, `public/index.html`, `public/assets`). Overoll's full design-system file was not in that repo; if HQ has one, it wins over this page.

## Logos

| File | Use |
| --- | --- |
| `assets/brand/overoll-logo.svg` | Full logo: splash screen, Wallet pass logo, store listing |
| `assets/brand/overoll-wordmark.svg` | Wordmark only: app header, emails, staff console |
| `assets/brand/overoll-favicon.svg` | Mark: app icon source, favicon, push notification icon |

The files carry an embedded content-credentials (C2PA) block. Keep it in the source files; the build can strip it from the copies it ships to save size. App icons need a square PNG export with padding (1024×1024 for iOS, adaptive icon for Android), made from the mark.

## Colours

| Token | Hex | Where |
| --- | --- | --- |
| `pink` (primary) | `#ebabc5` | Wallet pass background, primary buttons, progress ring |
| `pink-shop` | `#f3aeb6` | Website pink; illustrations, highlights |
| `pink-light` | `#f7c7cb` | Selected states, chips |
| `theme` | `#f5b0b4` | Browser/status bar colour (website `theme-color`) |
| `cream` | `#f6f1e8` | App background |
| `butter` | `#e7d8bd` | Cards, dividers |
| `white` | `#fffaf2` | Card surfaces on cream |
| `cocoa` | `#321c1b` | Headings, text on pink, dark mode background |
| `ink` | `#402927` | Body text |
| `mauve` | `#b2688a` | Links, secondary accent |
| `accent` | `#b56e79` | Numbers, tags |
| `green` | `#a1ba7f` | Success (points added) |

Contrast checks (WCAG):

- Cocoa on pink `#ebabc5`: 8.5:1. Fine for all text, so the Wallet pass uses cocoa text on pink.
- Ink on cream: 11.9:1. Fine for body text.
- Mauve and accent on cream: about 3.5:1. Only for large text (18 pt+) or icons, never for small text.
- White on pink: 1.9:1. Never.

## Type

| Role | Font stack (website) | In the apps |
| --- | --- | --- |
| Display, headings, big numbers (points) | `"Iowan Old Style", Baskerville, "Palatino Linotype", Georgia, serif` | Same stack; system serif on Android |
| Body, buttons, labels | `"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif` | Same stack; Avenir Next is built into iOS, Android falls back to Roboto |

The website relies on fonts already on the device, so there are no font licences to buy. Check Greek on a real device: Apple's Avenir Next may not cover Greek letters, in which case iOS quietly falls back to the system font for Greek text (Dimos checks this in the first device test). If Overoll wants one look in both languages, we pick a Greek-capable web font (e.g. from Google Fonts) and ask Dimos to approve it.

Website headings use tight letter-spacing (`-0.05em` to `-0.085em`) and a regular (400) weight; keep that in the apps for the big serif titles.

## Voice

- Tagline on the website: **"A little twist in every day."**
- Line used across the site: **"Good things come in layers."** It fits points and tiers well ("every visit adds a layer").
- Wolt tagline: "Κρουασάν στην πιο γαλλική του βερσιόν!"
- Greek first, English second, as on the website. Short, warm and playful, never corporate.

## Photos

`overoll-croissanterie/public/assets/*.jpg` (croissants, coffee, store front, lab). Use them for onboarding and rewards. Before using them in the App Store listing, confirm with Overoll that we have the rights for that use (covered by the authorization letter, section 2).
