# DNS records for overoll.gr (Papaki, managed by Overoll's IT)

Status: sent to Overoll's IT on 9 Nov 2026, waiting for them to add the records. Nothing existing in the
`overoll.gr` zone changes: the website, their Microsoft 365 email (MX) and the `overoll.gr` SPF stay as they are.
Names are relative to `overoll.gr`.

| # | Type | Name | Value | For |
| --- | --- | --- | --- | --- |
| 1 | CNAME | `loyalty` | `overoll-loyalty.pages.dev` | Member web app + landing (Cloudflare Pages project `overoll-loyalty`) |
| 2 | CNAME | `admin.loyalty` | `overoll-loyalty-admin.pages.dev` | Back office + till console (Cloudflare Pages project `overoll-loyalty-admin`) |
| 3 | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvO1vrMoqF6u7uX/5fcdK9rciRbLcdvqa0UoSbAkCLAZ8grx8P8pFiduIaN6PFFPS2YtBcpjcfnj/W5nOngwgoibnNq0MojmndsMoR8NJIbePVbm0vNbqK59mcJNnnxuH+GZxcDtqvQfarQ72jlbMLprJZsCyfBgm4D9OhT7yYqQIDAQAB` | DKIM for the sign-in emails from `app@overoll.gr` (Resend, team growagency, region eu-west-1) |
| 4 | CNAME | `rsend` | `rsend-euw1.forge.rmta.net` | Resend sending |
| 5 | CNAME | `send` | `send.forge.rmta.net` | Resend return path (its own SPF, separate from the `overoll.gr` SPF) |

Left out on purpose (Resend suggests them):
- **MX on `@`** (receiving through Resend): it would take over Overoll's own email from Microsoft 365. Never add it.
- **DMARC on `_dmarc`**: it applies to all of Overoll's mail, so it is their IT's call. `v=DMARC1; p=none;` only
  reports and changes nothing; worth adding once they are comfortable.

`app@overoll.gr` sends only. If people reply to a sign-in email, the reply goes to Microsoft 365: Overoll's IT can
make `app@overoll.gr` an alias or shared mailbox, or replies will bounce.

Superseded: Resend also holds `loyalty.overoll.gr` (added first, for `no-reply@loyalty.overoll.gr`); its records
are not needed and it can be removed from Resend.

When the records are in:
- Cloudflare activates both custom domains by itself (an email arrives).
- Resend: Domains → `overoll.gr` → "I've added the records" (or it checks by itself), then connect SMTP to
  Supabase and set `email.enabled` to true in `supabase/projects/overoll.json`.
