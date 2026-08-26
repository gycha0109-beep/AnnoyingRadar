-- Phase 15.8P: atomic curator-approved Source -> Incident batch registration.
--
-- This function adds no new identity model. It only wraps the existing
-- ar_register_source_incident() curator authority so multiple explicitly
-- approved Incident registrations commit or roll back as one transaction.

create or replace function public.ar_register_source_incident_batch(
  p_curator_user_id uuid,
  p_incidents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_incident public.ar_source_incidents%rowtype;
  v_incident_key text;
  v_label text;
  v_source_ids uuid[];
  v_seen_source_ids uuid[] := array[]::uuid[];
  v_seen_incident_keys text[] := array[]::text[];
  v_results jsonb := '[]'::jsonb;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if p_incidents is null or jsonb_typeof(p_incidents) <> 'array' then
    raise exception 'p_incidents must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_incidents) not between 1 and 20 then
    raise exception 'p_incidents must contain between 1 and 20 incidents' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_incidents) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each incident batch item must be an object' using errcode = '22023';
    end if;

    v_incident_key := nullif(trim(coalesce(v_item->>'incident_key', '')), '');
    v_label := nullif(trim(coalesce(v_item->>'label', '')), '');

    if v_incident_key is null or length(v_incident_key) > 500 then
      raise exception 'incident_key must contain 1 to 500 characters' using errcode = '22023';
    end if;
    if v_label is not null and length(v_label) > 500 then
      raise exception 'incident label must be at most 500 characters' using errcode = '22023';
    end if;
    if array_position(v_seen_incident_keys, v_incident_key) is not null then
      raise exception 'incident_key values must be unique within the batch' using errcode = '22023';
    end if;

    if not (v_item ? 'source_signal_ids') or jsonb_typeof(v_item->'source_signal_ids') <> 'array' then
      raise exception 'source_signal_ids must be a JSON array' using errcode = '22023';
    end if;

    select coalesce(array_agg(value::uuid), array[]::uuid[])
      into v_source_ids
    from jsonb_array_elements_text(v_item->'source_signal_ids');

    if cardinality(v_source_ids) < 1 then
      raise exception 'at least one source_signal_id is required per incident' using errcode = '22023';
    end if;
    if cardinality(v_source_ids) <> cardinality(array(select distinct unnest(v_source_ids))) then
      raise exception 'source_signal_ids must be unique within each incident' using errcode = '22023';
    end if;
    if v_seen_source_ids && v_source_ids then
      raise exception 'one source_signal_id may not appear in two batch incidents' using errcode = '23514';
    end if;

    v_seen_incident_keys := array_append(v_seen_incident_keys, v_incident_key);
    v_seen_source_ids := v_seen_source_ids || v_source_ids;

    select * into v_incident
    from public.ar_register_source_incident(
      p_curator_user_id,
      v_incident_key,
      v_label,
      v_source_ids
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'incident_id', v_incident.id,
      'incident_key', v_incident.incident_key,
      'source_count', cardinality(v_source_ids)
    ));
  end loop;

  return v_results;
end;
$$;

revoke all on function public.ar_register_source_incident_batch(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ar_register_source_incident_batch(uuid, jsonb)
  to service_role;
