-- The RETURNS TABLE output parameter id shadows the JSON order element id.
-- Qualify that reference while preserving the deployed body, grants and CAS codes.
do $migration$
declare
  v_oid regprocedure := to_regprocedure('public.save_estimate_sections(jsonb,bigint,uuid)');
  v_definition text;
  v_old text := 'group by id';
  v_new text := 'group by item.id';
  v_old_count integer;
  v_new_count integer;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '15s', true);

  if v_oid is null then
    raise exception 'Missing save_estimate_sections RPC';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  if strpos(v_definition, 'from jsonb_array_elements_text(p_payload -> ''order'') as item(id)') = 0 then
    raise exception 'Unexpected estimate section order validator';
  end if;

  v_old_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  v_new_count := (length(v_definition) - length(replace(v_definition, v_new, ''))) / length(v_new);
  if v_old_count = 1 and v_new_count = 0 then
    execute replace(v_definition, v_old, v_new);
  elsif v_old_count <> 0 or v_new_count <> 1 then
    raise exception 'Unexpected estimate section order grouping';
  end if;
end;
$migration$;
