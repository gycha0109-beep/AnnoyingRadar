-- Phase 15.8T: atomic persistence for exactly two incident-bound Public Evidence snapshots.
--
-- This function does not authorize publication or status transition. It wraps the
-- existing curator-authoritative ar_add_incident_bound_public_problem_evidence()
-- so an explicitly prepared two-Evidence pair commits or rolls back as one statement.

create or replace function public.ar_add_incident_bound_public_problem_evidence_pair(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_evidences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_status text;
  v_existing_count integer;
  v_item jsonb;
  v_snapshot public.ar_public_problem_evidence_snapshots%rowtype;
  v_source_signal_id uuid;
  v_incident_id uuid;
  v_source_key text;
  v_seen_source_signal_ids uuid[] := array[]::uuid[];
  v_seen_incident_ids uuid[] := array[]::uuid[];
  v_seen_source_keys text[] := array[]::text[];
  v_results jsonb := '[]'::jsonb;
  v_index integer := 0;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if p_problem_id is null then
    raise exception 'public problem id is required' using errcode = '22023';
  end if;
  if p_evidences is null or jsonb_typeof(p_evidences) <> 'array' or jsonb_array_length(p_evidences) <> 2 then
    raise exception 'p_evidences must contain exactly two Evidence items' using errcode = '22023';
  end if;

  select status into v_problem_status
  from public.ar_public_problems
  where id = p_problem_id
  for update;
  if not found then
    raise exception 'Public Problem not found' using errcode = 'P0002';
  end if;
  if v_problem_status <> 'draft' then
    raise exception 'Phase 15.8T Evidence pair requires a draft Public Problem' using errcode = '23514';
  end if;

  select count(*)::integer into v_existing_count
  from public.ar_public_problem_evidence_snapshots
  where public_problem_id = p_problem_id;
  if v_existing_count <> 0 then
    raise exception 'Phase 15.8T Evidence pair requires zero existing Evidence snapshots' using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(p_evidences) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each Evidence pair item must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(v_item) as k(key)
      where key not in (
        'excerpt', 'source_signal_id', 'incident_id', 'source_type', 'source_label',
        'source_url', 'source_key', 'source_observed_at', 'order_index'
      )
    ) then
      raise exception 'Evidence pair item contains unsupported fields' using errcode = '22023';
    end if;

    begin
      v_source_signal_id := (v_item->>'source_signal_id')::uuid;
      v_incident_id := (v_item->>'incident_id')::uuid;
    exception when others then
      raise exception 'source_signal_id and incident_id must be valid UUIDs' using errcode = '22023';
    end;
    v_source_key := nullif(trim(coalesce(v_item->>'source_key', '')), '');

    if v_source_signal_id is null or v_incident_id is null then
      raise exception 'source_signal_id and incident_id are required' using errcode = '22023';
    end if;
    if v_source_key is null then
      raise exception 'source_key is required' using errcode = '22023';
    end if;
    if array_position(v_seen_source_signal_ids, v_source_signal_id) is not null then
      raise exception 'Evidence pair requires two distinct Source Signals' using errcode = '23514';
    end if;
    if array_position(v_seen_incident_ids, v_incident_id) is not null then
      raise exception 'Evidence pair requires two distinct Incidents' using errcode = '23514';
    end if;
    if array_position(v_seen_source_keys, v_source_key) is not null then
      raise exception 'Evidence pair requires two distinct source_key values' using errcode = '23514';
    end if;
    if coalesce((v_item->>'order_index')::integer, -1) <> v_index then
      raise exception 'Evidence pair order_index must be exactly 0 then 1' using errcode = '22023';
    end if;

    v_seen_source_signal_ids := array_append(v_seen_source_signal_ids, v_source_signal_id);
    v_seen_incident_ids := array_append(v_seen_incident_ids, v_incident_id);
    v_seen_source_keys := array_append(v_seen_source_keys, v_source_key);

    select * into v_snapshot
    from public.ar_add_incident_bound_public_problem_evidence(
      p_problem_id,
      p_curator_user_id,
      v_item->>'excerpt',
      v_source_signal_id,
      v_incident_id,
      v_item->>'source_type',
      v_item->>'source_label',
      v_item->>'source_url',
      v_source_key,
      nullif(trim(coalesce(v_item->>'source_observed_at', '')), '')::timestamptz,
      v_index
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'evidence_id', v_snapshot.id,
      'source_signal_id', v_snapshot.source_signal_id,
      'incident_id', v_snapshot.incident_id,
      'source_key', v_snapshot.source_key,
      'order_index', v_snapshot.order_index
    ));
    v_index := v_index + 1;
  end loop;

  if v_index <> 2 then
    raise exception 'Evidence pair persistence did not process exactly two items' using errcode = '40001';
  end if;

  return v_results;
end;
$$;

revoke all on function public.ar_add_incident_bound_public_problem_evidence_pair(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ar_add_incident_bound_public_problem_evidence_pair(uuid, uuid, jsonb)
  to service_role;
