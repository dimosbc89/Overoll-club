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
| 7 | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCkmn+SAb1v+V6esxohbFaz3MO1yxGtDhjfExin+5RWzGr0nJeIgDBVDEeS+MCwfDxGLAIWAg3eX7+DnRzkdvLLN/LeNoLPse+Cu+FumNfc25m9/VbKQux38RoSH2vdo74lI/FBxDDuEKj3Rc6EC+Usfy/1kpmQKoEVeE7PpWzRGwIDAQAB` | | DKIM for the sign-in emails from `app@koalacoffee.gr` (Resend, team growagency, eu-west-1) | added 12 Nov, Resend verified 12 Nov |
| 8 | CNAME | `rsend` | `rsend-euw1.forge.rmta.net` | DNS only | Resend sending | added 12 Nov, Resend verified 12 Nov |
| 9 | CNAME | `send` | `send.forge.rmta.net` | DNS only | Resend return path (its own SPF, separate from the root SPF) | added 12 Nov, Resend verified 12 Nov |

Not set on purpose:
- Nothing on the root `koalacoffee.gr` or `www`: free for Koala's website later.
- Resend's "Enable receiving" MX (`receive-euw1.forge.rmta.net`): not added, mail for the domain goes to GROW's server.
- Contact address: `hello@koalacoffee.gr` (on GROW's server, 12 Nov) is `supportEmail` in the apps and the sign-in email.
  Sign-in emails come from `app@koalacoffee.gr`: make `app@` an alias of `hello@` on the server, or replies bounce.
- Mail: `koalacoffee.gr` must also be added as a mail domain on GROW's server (`cloud.growagency.online`), with the
  mailboxes Koala wants, or incoming mail is refused. The server's own DKIM key for `koalacoffee.gr`
  (`default._domainkey`), once it makes one, goes here too. The Resend records never collide with it: they live on
  `send` and `resend._domainkey`, and the root SPF does not need Resend (its sending passes DMARC through its own DKIM).

Live on 12 Nov 2026 (morning): the registry delegates to Cloudflare, both Pages custom domains answer over HTTPS (certificate `*.koalacoffee.gr`), and steps 1–2 below are done.

When the registry publishes the domain (new `.gr` domains take a few hours):
1. Cloudflare marks the zone active; both Pages custom domains turn active and get certificates by themselves.
2. `supabase/projects/koala.json`: `siteUrl` → `https://club.koalacoffee.gr`, `emailLogoUrl` →
   `https://club.koalacoffee.gr/email-logo.png` (also `apps/mobile/eas.json` `EXPO_PUBLIC_CLUB_URL`, kept in step by a test).
3. ☑ Resend verified the domain on 12 Nov. Resend API key `koala-club` (sending access, `koalacoffee.gr` only), saved by
   Dimos as the GitHub secret `RESEND_API_KEY_KOALA`; `email.enabled` is true (sender `app@koalacoffee.gr`). CI connects
   Supabase Auth to Resend SMTP with that key.
