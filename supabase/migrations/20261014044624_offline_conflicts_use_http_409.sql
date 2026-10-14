-- A revision mismatch is an application conflict, not a serialization failure.
-- PostgREST 14 retries SQLSTATE 40001 internally, potentially indefinitely.
-- PT409 returns HTTP 409 so clients can retain the local change for repair.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- Only replace the conflict codes; preserve function bodies and existing grants.
do $migration$
declare
  v_function record;
  v_oid regprocedure;
  v_definition text;
  v_old_guard text;
  v_new_guard text;
  v_fixed_definition text;
  v_branch_count integer;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '15s', true);

  for v_function in
    select * from (values
      ('public.save_offline_record(text,text,jsonb,bigint,uuid)', 'OFFLINE_RECORD_CONFLICT', 2),
      ('public.delete_offline_record(text,text,bigint,uuid)', 'OFFLINE_RECORD_CONFLICT', 1),
      ('public.save_estimate_sections(jsonb,bigint,uuid)', 'ESTIMATE_SECTIONS_CONFLICT', 2)
    ) as functions(signature, conflict_message, expected_branches)
  loop
    v_oid := to_regprocedure(v_function.signature);
    if v_oid is null then
      raise exception 'Missing sync function: %', v_function.signature;
    end if;

    v_definition := pg_get_functiondef(v_oid);
    v_old_guard := format('errcode = ''40001'', message = %L', v_function.conflict_message);
    v_new_guard := format('errcode = ''PT409'', message = %L', v_function.conflict_message);
    v_fixed_definition := replace(v_definition, v_old_guard, v_new_guard);
    v_branch_count := (length(v_fixed_definition) - length(replace(v_fixed_definition, v_new_guard, '')))
      / length(v_new_guard);

    -- Abort atomically if a function no longer matches the expected contract.
    if v_branch_count <> v_function.expected_branches then
      raise exception 'Unexpected conflict guards in sync function: %', v_function.signature;
    end if;

    if v_fixed_definition <> v_definition then
      execute v_fixed_definition;
    end if;
  end loop;
end;
$migration$;
