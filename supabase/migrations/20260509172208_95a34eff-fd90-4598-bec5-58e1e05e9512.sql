insert into storage.buckets (id, name, public) values ('item-images', 'item-images', true) on conflict (id) do nothing;

create policy "Item images public read"
on storage.objects for select
using (bucket_id = 'item-images');

create policy "Authenticated upload item images"
on storage.objects for insert to authenticated
with check (bucket_id = 'item-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Owner update item images"
on storage.objects for update to authenticated
using (bucket_id = 'item-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Owner delete item images"
on storage.objects for delete to authenticated
using (bucket_id = 'item-images' and auth.uid()::text = (storage.foldername(name))[1]);