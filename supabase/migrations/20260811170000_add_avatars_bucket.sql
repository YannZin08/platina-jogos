-- Bucket público pra foto de perfil dos usuários. Cada usuário só pode
-- escrever dentro da própria pasta (avatars/{user_id}/...), leitura é livre
-- pra qualquer um (a foto aparece pra outros usuários eventualmente).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: leitura publica"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: usuario escreve na propria pasta"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: usuario atualiza a propria pasta"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: usuario remove da propria pasta"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
