# DNS records for overoll.gr (Papaki, managed by Overoll's IT)

Status: sent to Overoll's IT on 9 Nov 2026, waiting for them to add the records. Nothing existing in the
`overoll.gr` zone changes: the website, their Microsoft 365 email and the `overoll.gr` SPF stay as they are.
Names are relative to `overoll.gr`.

| # | Type | Name | Value | For |
| --- | --- | --- | --- | --- |
| 1 | CNAME | `loyalty` | `overoll-loyalty.pages.dev` | Member web app + landing (Cloudflare Pages project `overoll-loyalty`) |
| 2 | CNAME | `admin.loyalty` | `overoll-loyalty-admin.pages.dev` | Back office + till console (Cloudflare Pages project `overoll-loyalty-admin`) |
| 3 | TXT | `resend._domainkey.loyalty` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8gE0+/Tk0k1bk++fAuyO/D8I1BjZCNu3+OngqcDes2VdrDmcEX8iRaf7wsf6X3AhlXr9XSLEVk0zGwJ2eGGjmNOQ2RGLzGU1m1vUBsD8OtDB2QBgamFlJs3t3qye9IfiOSfSxi+sxirmTeudlbiaVX4vTZpwRDCN1FmYJ1EV0lwIDAQAB` | DKIM for sign-in emails (Resend, team growagency, region eu-west-1) |
| 4 | CNAME | `rsend.loyalty` | `rsend-euw1.forge.rmta.net` | Resend sending |
| 5 | CNAME | `send.loyalty` | `send.forge.rmta.net` | Resend return path / SPF |
| 6 | TXT | `_dmarc.loyalty` | `v=DMARC1; p=none;` | DMARC for `loyalty.overoll.gr` only (Resend suggests `_dmarc` on the main domain; we keep it on the subdomain so the main domain's mail is untouched) |

Not added on purpose: Resend's MX on `loyalty` (receiving email). We only send, and an MX can't sit next to the
CNAME of record 1.

When they are in:
- Cloudflare activates both custom domains by itself (an email arrives).
- Resend: Domains → `loyalty.overoll.gr` → "I've added the records" (or it checks by itself), then connect SMTP
  to Supabase and set `email.enabled` to true in `supabase/project.config.json`.
