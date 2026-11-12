# Wallet passes: shared files

- `apple-wwdr-g4.pem`: Apple Worldwide Developer Relations intermediate certificate (G4), public, from
  https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer (SHA-256 fingerprint
  `EA:47:57:88:55:38:DD:8C:B5:9F:F4:55:6F:67:60:87:D8:3C:85:E7:09:02:C1:22:E4:2C:08:08:B5:BC:E1:4C`,
  valid until 10 Dec 2030). Every Apple Wallet pass signature includes it.

Per brand: `data/<brand>/wallet.json` (pass colours) and `data/<brand>/wallet/` (Apple pass images:
icon 29/58/87 px, logo up to 160×50 at @1x/@2x/@3x). The Google Wallet program logo (660×660) is
served by the member web app from `apps/mobile/public-brands/<brand>/wallet/logo.png`. Texts:
`data/copy/wallet.el.json` and `wallet.en.json` (copy deck d2); tier names come from the app's copy.

The images were rendered from the brand SVGs in `assets/brand/` (mark on the pass colour; logo on
transparent).
