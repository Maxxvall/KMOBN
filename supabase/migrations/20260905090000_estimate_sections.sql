-- User-owned estimate section settings with optimistic concurrency.
create table if not exists public.estimate_sections (
  id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  last_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_sections_payload_shape check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'definitions') = 'array'
    and jsonb_typeof(payload -> 'order') = 'array'
    and jsonb_array_length(payload -> 'definitions') <= 100
  )
);

alter table public.estimate_sections enable row level security;
revoke all on table public.estimate_sections from anon, authenticated;
grant select on table public.estimate_sections to authenticated;

drop policy if exists "estimate_sections_select_own" on public.estimate_sections;
create policy "estimate_sections_select_own"
on public.estimate_sections for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.save_estimate_sections(
  p_payload jsonb,
  p_expected_revision bigint,
  p_operation_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  payload jsonb,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.estimate_sections%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'definitions') <> 'array'
     or jsonb_typeof(p_payload -> 'order') <> 'array'
     or p_payload ->> 'schemaVersion' <> '1'
     or jsonb_array_length(p_payload -> 'definitions') > 100
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_operation_id is null then
    raise exception using errcode = '22023', message = 'Invalid estimate sections payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'definitions') as item(value)
    where jsonb_typeof(value) <> 'object'
       or coalesce(value ->> 'id', '') !~* '^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(value -> 'label') <> 'string'
       or char_length(btrim(value ->> 'label')) not between 1 and 80
       or jsonb_typeof(value -> 'archived') <> 'boolean'
       or jsonb_typeof(value -> 'createdAt') <> 'string'
       or jsonb_typeof(value -> 'updatedAt') <> 'string'
  ) or exists (
    select 1
    from jsonb_array_elements(p_payload -> 'definitions') as item(value)
    group by value ->> 'id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_payload -> 'definitions') as item(value)
    group by lower(regexp_replace(translate(btrim(value ->> 'label'), 'Ёё', 'Ее'), '[[:space:]]+', ' ', 'g'))
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_payload -> 'definitions') as item(value)
    where lower(regexp_replace(translate(btrim(value ->> 'label'), 'Ёё', 'Ее'), '[[:space:]]+', ' ', 'g')) in (
      'фундамент', 'ростверк, лаги, полы', 'стены', 'кровля/потолок', 'демонтаж',
      'окна/двери', 'электрика', 'водоснабжение/сантехника', 'канализация', 'логистика', 'общая'
    )
  ) then
    raise exception using errcode = '22023', message = 'Invalid estimate section definition';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'order') as item(value)
    where jsonb_typeof(value) <> 'string'
       or (
         value #>> '{}' not in (
           'ФУНДАМЕНТ', 'РОСТВЕРК, ЛАГИ, ПОЛЫ', 'СТЕНЫ', 'КРОВЛЯ/ПОТОЛОК', 'ДЕМОНТАЖ',
           'ОКНА/ДВЕРИ', 'ЭЛЕКТРИКА', 'ВОДОСНАБЖЕНИЕ/САНТЕХНИКА', 'КАНАЛИЗАЦИЯ', 'ЛОГИСТИКА'
         )
         and not exists (
           select 1
           from jsonb_array_elements(p_payload -> 'definitions') as definition(value)
           where definition.value ->> 'id' = item.value #>> '{}'
         )
       )
  ) or exists (
    select 1
    from jsonb_array_elements_text(p_payload -> 'order') as item(id)
    group by id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_payload -> 'definitions') as definition(value)
    where (
      (definition.value ->> 'archived')::boolean = false
      and not (p_payload -> 'order' ? (definition.value ->> 'id'))
    ) or (
      (definition.value ->> 'archived')::boolean = true
      and p_payload -> 'order' ? (definition.value ->> 'id')
    )
  ) or exists (
    select required.id
    from unnest(array[
      'ФУНДАМЕНТ', 'РОСТВЕРК, ЛАГИ, ПОЛЫ', 'СТЕНЫ', 'КРОВЛЯ/ПОТОЛОК', 'ДЕМОНТАЖ',
      'ОКНА/ДВЕРИ', 'ЭЛЕКТРИКА', 'ВОДОСНАБЖЕНИЕ/САНТЕХНИКА', 'КАНАЛИЗАЦИЯ', 'ЛОГИСТИКА'
    ]) as required(id)
    where not (p_payload -> 'order' ? required.id)
  ) then
    raise exception using errcode = '22023', message = 'Invalid estimate section order';
  end if;

  select * into v_row
  from public.estimate_sections s
  where s.user_id = v_user_id
  for update;

  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception using errcode = '40001', message = 'ESTIMATE_SECTIONS_CONFLICT';
    end if;
    insert into public.estimate_sections(id, user_id, payload, revision, last_operation_id)
    values (v_user_id, v_user_id, p_payload, 1, p_operation_id)
    returning * into v_row;
  elsif v_row.last_operation_id = p_operation_id then
    null;
  elsif v_row.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'ESTIMATE_SECTIONS_CONFLICT';
  else
    update public.estimate_sections s
    set payload = p_payload,
        revision = s.revision + 1,
        last_operation_id = p_operation_id,
        updated_at = now()
    where s.user_id = v_user_id
    returning * into v_row;
  end if;

  return query select v_row.id, v_row.user_id, v_row.payload, v_row.revision, v_row.updated_at;
end;
$$;

revoke all on function public.save_estimate_sections(jsonb, bigint, uuid) from public, anon;
grant execute on function public.save_estimate_sections(jsonb, bigint, uuid) to authenticated;
