-- Файл устарел. Локальная авторизация удалена, используйте Supabase Auth.

-- 4) RPC: check credentials server-side (does not leak hashes)
create or replace function public.check_user_credentials(p_username text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_hash text;
begin
  select u.password into stored_hash
  from public.users u
  where u.username = p_username;

  if stored_hash is null then
    return false;
  end if;

  -- Compare supplied password with stored bcrypt hash
  return stored_hash = crypt(p_password, stored_hash);
end;
$$;

revoke all on function public.check_user_credentials(text, text) from public;
grant execute on function public.check_user_credentials(text, text) to anon, authenticated;

-- 5) RPC: fetch users list (NO password)
create or replace function public.fetch_users()
returns table(id uuid, username text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.id, u.username, u.created_at
  from public.users u
  order by u.created_at asc;
$$;

revoke all on function public.fetch_users() from public;
grant execute on function public.fetch_users() to anon, authenticated;


insert into public.users (username, password)
select 'KARKAS', crypt('KARKAS_MASTER_1', gen_salt('bf'))
where not exists (select 1 from public.users where username = 'KARKAS');
