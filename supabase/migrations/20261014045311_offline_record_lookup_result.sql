-- EXECUTE ... INTO assigns NULL when no row exists, but does not set FOUND.
-- Every offline table has a NOT NULL revision, so it identifies a found row.
-- Without this check saves incorrectly report conflicts and deletes do nothing.
-- https://www.postgresql.org/docs/17/plpgsql-statements.html#PLPGSQL-STATEMENTS-DIAGNOSTICS
do $migration$
declare
  v_signature text;
  v_oid regprocedure;
  v_definition text;
  v_fixed_definition text;
  v_old_guard constant text := 'if not found then';
  v_new_guard constant text := 'if v_revision is null then';
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '15s', true);

  foreach v_signature in array array[
    'public.save_offline_record(text,text,jsonb,bigint,uuid)',
    'public.delete_offline_record(text,text,bigint,uuid)'
  ]
  loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Missing sync function: %', v_signature;
    end if;

    v_definition := pg_get_functiondef(v_oid);
    v_fixed_definition := replace(v_definition, v_old_guard, v_new_guard);
    if (length(v_fixed_definition) - length(replace(v_fixed_definition, v_new_guard, '')))
      / length(v_new_guard) <> 1 then
      raise exception 'Unexpected row lookup guard in sync function: %', v_signature;
    end if;

    if v_fixed_definition <> v_definition then
      execute v_fixed_definition;
    end if;
  end loop;
end;
$migration$;
