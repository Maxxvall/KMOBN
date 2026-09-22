-- Optimistic concurrency for every user-owned offline table.
-- Existing clients may continue using direct upserts during rollout; the
-- trigger increments revisions when such a client changes payload without
-- supplying a revision itself.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'estimates', 'templates', 'materials', 'works', 'bundles', 'salary_calculations'
  ] loop
    execute format(
      'alter table public.%I add column if not exists revision bigint not null default 0 check (revision >= 0)',
      v_table
    );
    execute format(
      'alter table public.%I add column if not exists last_operation_id uuid',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.bump_offline_record_revision()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.payload is distinct from old.payload and new.revision = old.revision then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'estimates', 'templates', 'materials', 'works', 'bundles', 'salary_calculations'
  ] loop
    execute format('drop trigger if exists bump_offline_record_revision on public.%I', v_table);
    execute format(
      'create trigger bump_offline_record_revision before update on public.%I for each row execute function public.bump_offline_record_revision()',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.save_offline_record(
  p_table text,
  p_record_id text,
  p_payload jsonb,
  p_expected_revision bigint,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row jsonb;
  v_revision bigint;
  v_last_operation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_table not in ('estimates', 'templates', 'materials', 'works', 'bundles', 'salary_calculations')
     or nullif(p_record_id, '') is null
     or jsonb_typeof(p_payload) <> 'object'
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_operation_id is null then
    raise exception using errcode = '22023', message = 'Invalid offline record payload';
  end if;

  execute format(
    'select revision, last_operation_id from public.%I where id = $1 and user_id = $2 for update',
    p_table
  ) into v_revision, v_last_operation_id using p_record_id, v_user_id;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using errcode = '40001', message = 'OFFLINE_RECORD_CONFLICT';
    end if;
    execute format(
      'insert into public.%I (id, user_id, payload, revision, last_operation_id) values ($1, $2, $3, 1, $4)',
      p_table
    ) using p_record_id, v_user_id, p_payload, p_operation_id;
  elsif v_last_operation_id = p_operation_id then
    null;
  elsif v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'OFFLINE_RECORD_CONFLICT';
  else
    execute format(
      'update public.%I set payload = $3, revision = revision + 1, last_operation_id = $4 where id = $1 and user_id = $2',
      p_table
    ) using p_record_id, v_user_id, p_payload, p_operation_id;
  end if;

  execute format(
    'select to_jsonb(t) from public.%I t where id = $1 and user_id = $2',
    p_table
  ) into v_row using p_record_id, v_user_id;
  return v_row;
end;
$$;

create or replace function public.delete_offline_record(
  p_table text,
  p_record_id text,
  p_expected_revision bigint,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
  v_last_operation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_table not in ('estimates', 'templates', 'materials', 'works', 'bundles', 'salary_calculations')
     or nullif(p_record_id, '') is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_operation_id is null then
    raise exception using errcode = '22023', message = 'Invalid offline delete request';
  end if;

  execute format(
    'select revision, last_operation_id from public.%I where id = $1 and user_id = $2 for update',
    p_table
  ) into v_revision, v_last_operation_id using p_record_id, v_user_id;

  if not found then
    return jsonb_build_object('id', p_record_id, 'deleted', true, 'revision', p_expected_revision);
  end if;
  if v_last_operation_id = p_operation_id then
    return jsonb_build_object('id', p_record_id, 'deleted', true, 'revision', v_revision);
  end if;
  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'OFFLINE_RECORD_CONFLICT';
  end if;

  execute format('delete from public.%I where id = $1 and user_id = $2', p_table)
    using p_record_id, v_user_id;
  return jsonb_build_object('id', p_record_id, 'deleted', true, 'revision', v_revision);
end;
$$;

revoke all on function public.save_offline_record(text, text, jsonb, bigint, uuid) from public, anon;
revoke all on function public.delete_offline_record(text, text, bigint, uuid) from public, anon;
grant execute on function public.save_offline_record(text, text, jsonb, bigint, uuid) to authenticated;
grant execute on function public.delete_offline_record(text, text, bigint, uuid) to authenticated;
