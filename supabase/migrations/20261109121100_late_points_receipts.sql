-- Late points for a forgotten card (docs/api-contract.md v0.2): the cashier
-- types the receipt number, and one receipt earns points only once per store
-- per calendar day (brand time zone). The number is stored normalised
-- (packages/core normalizeReceiptNumber) on the earn entry.
--
-- No unique index: an undone earn frees its receipt again (so a typo in the
-- amount can be fixed), and the ledger is append-only. awardPoints checks
-- under an advisory lock per store + day + receipt instead, which also stops
-- two members claiming the same receipt at the same moment.

alter table public.ledger_entries add column receipt_number text;
alter table public.ledger_entries add constraint ledger_receipt_number check (
  receipt_number is null or (kind = 'earn' and length(receipt_number) between 1 and 40)
);
create index ledger_store_receipt on public.ledger_entries (store_id, receipt_number, created_at)
  where receipt_number is not null;
