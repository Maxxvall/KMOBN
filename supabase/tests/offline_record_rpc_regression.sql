-- Run through a direct SQL connection, not PostgREST. Creates only a synthetic
-- estimate for an existing account inside a subtransaction that always rolls
-- back. No existing estimate payload or identifying user data is returned.
do $probe$
declare
  v_user_id uuid;
  v_record_id text := '__offline_rpc_probe__' || gen_random_uuid()::text;
  v_first_operation uuid := gen_random_uuid();
  v_update_operation uuid := gen_random_uuid();
  v_delete_operation uuid := gen_random_uuid();
  v_first jsonb;
  v_replayed jsonb;
  v_updated jsonb;
  v_deleted jsonb;
  v_expected_payload jsonb := '{"syncProbe":true,"version":2}'::jsonb;
begin
  select user_id into v_user_id from public.estimates limit 1;
  if v_user_id is null then
    raise exception 'An existing estimate owner is required for the rollback-only probe';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_user_id::text, true);
    v_first := public.save_offline_record('estimates', v_record_id,
      '{"syncProbe":true,"version":1}'::jsonb, 0, v_first_operation);
    if v_first ->> 'id' is distinct from v_record_id or (v_first ->> 'revision')::bigint is distinct from 1 then
      raise exception 'Insert was not acknowledged at revision 1';
    end if;

    v_replayed := public.save_offline_record('estimates', v_record_id,
      '{"syncProbe":true,"version":1}'::jsonb, 0, v_first_operation);
    if v_replayed is distinct from v_first then
      raise exception 'Replaying an operation changed the record';
    end if;

    v_updated := public.save_offline_record('estimates', v_record_id,
      v_expected_payload, 1, v_update_operation);
    if (v_updated ->> 'revision')::bigint is distinct from 2
       or v_updated -> 'payload' is distinct from v_expected_payload then
      raise exception 'A save with the current revision was not acknowledged';
    end if;

    begin
      perform public.save_offline_record('estimates', v_record_id,
        '{"syncProbe":true,"stale":true}'::jsonb, 1, gen_random_uuid());
      raise exception 'A stale save was accepted';
    exception when sqlstate 'PT409' then
      null;
    end;

    begin
      perform public.delete_offline_record('estimates', v_record_id, 1, v_delete_operation);
      raise exception 'A stale delete was accepted';
    exception when sqlstate 'PT409' then
      null;
    end;

    if not exists (select 1 from public.estimates
      where id = v_record_id and revision = 2 and payload = v_expected_payload) then
      raise exception 'A conflict modified the server record';
    end if;

    v_deleted := public.delete_offline_record('estimates', v_record_id, 2, v_delete_operation);
    if v_deleted ->> 'deleted' is distinct from 'true'
       or exists (select 1 from public.estimates where id = v_record_id) then
      raise exception 'An acknowledged delete did not delete the record';
    end if;

    v_replayed := public.delete_offline_record('estimates', v_record_id, 2, v_delete_operation);
    if v_replayed is distinct from v_deleted then
      raise exception 'Replaying a delete did not acknowledge the missing record';
    end if;

    begin
      perform public.save_offline_record('estimates', v_record_id,
        v_expected_payload, 2, gen_random_uuid());
      raise exception 'A missing record was recreated with a stale revision';
    exception when sqlstate 'PT409' then
      null;
    end;

    perform set_config('request.jwt.claim.sub', '', true);
    begin
      perform public.save_offline_record('estimates', v_record_id,
        v_expected_payload, 0, gen_random_uuid());
      raise exception 'An unauthenticated write was accepted';
    exception when sqlstate '42501' then
      null;
    end;

    -- This exception rolls back every probe write, including the revision trigger.
    raise sqlstate 'ZX001' using message = 'Rollback successful probe writes';
  exception when sqlstate 'ZX001' then
    null;
  end;

  if exists (select 1 from public.estimates where id = v_record_id) then
    raise exception 'Probe data was not rolled back';
  end if;
  perform set_config('kmobn.rpc_probe_result',
    '{"passed":true,"probe_data_rolled_back":true,"checks":["insert","operation_replay","current_revision_save","stale_save_conflict","stale_delete_conflict","conflict_preserves_payload","delete","delete_replay","missing_record_conflict","unauthenticated_rejection"]}', true);
end;
$probe$;

select current_setting('kmobn.rpc_probe_result', true)::jsonb as rpc_regression;
