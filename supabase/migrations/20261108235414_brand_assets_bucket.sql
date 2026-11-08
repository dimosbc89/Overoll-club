-- Public bucket for brand images used by Wallet passes and emails
-- (Google Wallet and Apple need plain HTTPS image URLs). Read-only to the
-- world through the public URL; only the service role writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;
