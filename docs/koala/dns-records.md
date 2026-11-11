# DNS for koalacoffee.gr (Cloudflare, GROW's account)

Nameservers: `annabel.ns.cloudflare.com`, `clay.ns.cloudflare.com` (set at the registrar by Dimos, 12 Nov 2026).
The zone is managed by GROW in Cloudflare, so records are added there directly. Names are relative to `koalacoffee.gr`.

| # | Type | Name | Value | Proxy | For | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | CNAME | `club` | `koala-club.pages.dev` | proxied | Member web app + landing (Pages project `koala-club`, custom domain added) | added 12 Nov |
| 2 | CNAME | `admin` | `koala-club-admin.pages.dev` | proxied | Back office + till console (Pages project `koala-club-admin`, custom domain added) | added 12 Nov |
| 3 | TXT | `_dmarc` | `v=DMARC1; p=none;` | | DMARC, reporting only (helps Gmail and Yahoo accept the sign-in emails) | added 12 Nov |
| 4 | A | `mail` | `176.119.210.91` | DNS only | GROW's mail server `cloud.growagency.online` (same as cosmostax.gr, marketingagencygreece.online) | added 12 Nov |
| 5 | MX | `@` | `mail.koalacoffee.gr`, priority 10 | | Mail to `@koalacoffee.gr` goes to GROW's mail server (confirmed by Dimos, 12 Nov) | added 12 Nov |
| 6 | TXT | `@` | `v=spf1 +a +mx +a:cloud.growagency.online -all` | | SPF for mail sent by GROW's server as `@koalacoffee.gr` | added 12 Nov |
| 7–9 | TXT / MX / CNAME | from Resend | DKIM `resend._domainkey`, return path `send` | | Sign-in emails from `app@koalacoffee.gr` | waiting: Resend sign-in |

Not set on purpose:
- Nothing on the root `koalacoffee.gr` or `www`: free for Koala's website later.
- Mail: `koalacoffee.gr` must also be added as a mail domain on GROW's server (`cloud.growagency.online`), with the
  mailboxes Koala wants, or incoming mail is refused. The server's own DKIM key for `koalacoffee.gr`
  (`default._domainkey`), once it makes one, goes here too. The Resend records never collide with it: they live on
  `send` and `resend._domainkey`, and the root SPF does not need Resend (its sending passes DMARC through its own DKIM).

When the registry publishes the domain (new `.gr` domains take a few hours):
1. Cloudflare marks the zone active; both Pages custom domains turn active and get certificates by themselves.
2. `supabase/projects/koala.json`: `siteUrl` → `https://club.koalacoffee.gr`, `emailLogoUrl` →
   `https://club.koalacoffee.gr/email-logo.png` (also `apps/mobile/eas.json` `EXPO_PUBLIC_CLUB_URL`, kept in step by a test).
3. Once Resend shows the domain verified: `email.senderEmail` → `app@koalacoffee.gr`, `email.enabled` → true. CI then
   connects Supabase Auth to Resend SMTP (password: the `RESEND_API_KEY` GitHub secret).
