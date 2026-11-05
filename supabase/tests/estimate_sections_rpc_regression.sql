-- Run in the isolated fixture database after the estimate_sections migrations.
-- Calls the real RPC with synthetic data; every test write is rolled back.
begin;
set local plpgsql.variable_conflict = error;

do $test$
declare
  v_user_id uuid := gen_random_uuid();
  v_operation_id uuid := gen_random_uuid();
  v_update_operation_id uuid := gen_random_uuid();
  v_result record;
  v_document jsonb := '{
    "schemaVersion": 1,
    "definitions": [],
    "order": [
      "ФУНДАМЕНТ", "РОСТВЕРК, ЛАГИ, ПОЛЫ", "СТЕНЫ", "КРОВЛЯ/ПОТОЛОК",
      "ДЕМОНТАЖ", "ОКНА/ДВЕРИ", "ЭЛЕКТРИКА", "ВОДОСНАБЖЕНИЕ/САНТЕХНИКА",
      "КАНАЛИЗАЦИЯ", "ЛОГИСТИКА"
    ],
    "labels": [
      {"id": "system:typical-projects", "name": "Типовые проекты"},
      {"id": "11111111-1111-4111-8111-111111111111", "name": "Баня"}
    ]
  }'::jsonb;
begin
  insert into auth.users(id) values (v_user_id);
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  select * into strict v_result
  from public.save_estimate_sections(v_document, 0, v_operation_id);

  if v_result.id is distinct from v_user_id
     or v_result.user_id is distinct from v_user_id
     or v_result.revision is distinct from 1::bigint
     or v_result.payload -> 'labels' is distinct from v_document -> 'labels'
     or v_result.payload -> 'order' is distinct from v_document -> 'order' then
    raise exception 'Creating a label did not persist the expected settings';
  end if;

  select * into strict v_result
  from public.save_estimate_sections(v_document, 0, v_operation_id);
  if v_result.revision is distinct from 1::bigint then
    raise exception 'Replaying a save changed its revision';
  end if;

  v_document := jsonb_set(v_document, '{labels,1,name}', '"Сауна"'::jsonb);
  select * into strict v_result
  from public.save_estimate_sections(v_document, 1, v_update_operation_id);
  if v_result.revision is distinct from 2::bigint
     or v_result.payload -> 'labels' is distinct from v_document -> 'labels' then
    raise exception 'Renaming a label did not preserve its definition';
  end if;

  begin
    perform public.save_estimate_sections(v_document, 1, gen_random_uuid());
    raise exception 'A stale revision was accepted';
  exception when sqlstate 'PT409' then
    null;
  end;

  begin
    perform public.save_estimate_sections(
      jsonb_set(v_document, '{order}', (v_document -> 'order') || '["СТЕНЫ"]'::jsonb),
      2, gen_random_uuid()
    );
    raise exception 'Duplicate section order entries were accepted';
  exception when sqlstate '22023' then
    null;
  end;

  if not exists (
    select 1 from public.estimate_sections as saved
    where saved.user_id = v_user_id and saved.revision = 2 and saved.payload = v_document
  ) then
    raise exception 'A rejected save modified the stored settings';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.save_estimate_sections(v_document, 2, gen_random_uuid());
    raise exception 'An unauthenticated save was accepted';
  exception when sqlstate '42501' then
    null;
  end;
end;
$test$;

rollback;
select 'estimate_sections RPC regression passed' as result;
