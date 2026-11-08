# Overoll Club

Loyalty program for **Overoll Croissanterie**: customers join from a QR on the counter, keep their card in Apple/Google Wallet or the app, earn points at every visit and redeem free coffee and croissants. Each store has a staff console; Overoll HQ runs everything from one back office.

Built by [GROW Agency](https://growagency.online).

| | |
| --- | --- |
| Program rules | [docs/program-spec.md](docs/program-spec.md) |
| Roadmap to launch (Jan 2027) | [docs/roadmap.md](docs/roadmap.md) |
| How we work in this repo | [CLAUDE.md](CLAUDE.md) |

## Status

Week 1 foundation: program rules engine (`packages/core`, 32 tests) and database schema with access rules (`supabase`, 48 checks). Apps and back office are next.

## Quick start

```bash
nvm use            # Node 22
npm install
npm test           # rules engine tests
npm run test:db    # database tests (needs a local PostgreSQL 15+ install)
```
