-- Harden Phase 2 Evidence RPC JSON validation before first release.

create or replace function public.ar_replace_evidence_fixture(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_evidences jsonb
)
returns setof public.ar_pain_evidences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_input public.ar_raw_inputs%rowtype;
  v_item jsonb;
  v_index integer := 0;
begin
  select * into v_raw_input
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Raw input not found' using errcode = 'P0002';
  end if;

  if v_raw_input.analysis_status not in ('input_saved', 'extraction_failed', 'reviewing_evidence') then
    raise exception 'Raw input cannot prepare Evidence from status %', v_raw_input.analysis_status
      using errcode = '23514';
  end if;

  if p_evidences is null
     or jsonb_typeof(p_evidences) <> 'array'
     or jsonb_array_length(p_evidences) < 1
     or jsonb_array_length(p_evidences) > 20 then
    raise exception 'Evidence fixture must contain 1 to 20 items' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.ar_problem_candidates
    where raw_input_id = p_raw_input_id
      and user_id = p_user_id
      and status = 'confirmed'
  ) then
    raise exception 'Confirmed Candidate exists' using errcode = '23514';
  end if;

  delete from public.ar_problem_evidence_links l
  using public.ar_problem_candidates c
  where l.problem_candidate_id = c.id
    and c.raw_input_id = p_raw_input_id
    and c.user_id = p_user_id
    and c.status in ('draft', 'discarded');

  delete from public.ar_problem_candidates
  where raw_input_id = p_raw_input_id
    and user_id = p_user_id
    and status in ('draft', 'discarded');

  update public.ar_pain_evidences
  set status = 'deleted'
  where raw_input_id = p_raw_input_id
    and user_id = p_user_id
    and status <> 'deleted';

  for v_item in select value from jsonb_array_elements(p_evidences)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or length(trim(coalesce(v_item->>'original_text', ''))) = 0 then
      raise exception 'Each Evidence fixture item requires original_text' using errcode = '22023';
    end if;

    insert into public.ar_pain_evidences (
      user_id, raw_input_id, original_text, summary_ko, pain_type,
      target_user, situation, sentiment_level, intensity_level,
      source_type, source_url, source_memo, status, order_index
    ) values (
      p_user_id,
      p_raw_input_id,
      v_item->>'original_text',
      nullif(v_item->>'summary_ko', ''),
      nullif(v_item->>'pain_type', ''),
      nullif(v_item->>'target_user', ''),
      nullif(v_item->>'situation', ''),
      coalesce(nullif(v_item->>'sentiment_level', ''), 'unknown'),
      coalesce(nullif(v_item->>'intensity_level', ''), 'unknown'),
      v_raw_input.source_type,
      v_raw_input.source_url,
      v_raw_input.source_memo,
      'draft',
      v_index
    );

    v_index := v_index + 1;
  end loop;

  update public.ar_raw_inputs
  set analysis_status = 'reviewing_evidence'
  where id = p_raw_input_id;

  return query
  select e.*
  from public.ar_pain_evidences e
  where e.raw_input_id = p_raw_input_id
    and e.user_id = p_user_id
    and e.status <> 'deleted'
  order by e.order_index asc, e.created_at asc;
end;
$$;

create or replace function public.ar_update_evidence_batch(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_updates jsonb
)
returns setof public.ar_pain_evidences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_item jsonb;
  v_evidence_id uuid;
  v_unknown_keys text[];
begin
  select analysis_status into v_status
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Raw input not found' using errcode = 'P0002';
  end if;

  if v_status <> 'reviewing_evidence' then
    raise exception 'Evidence can only be edited while reviewing_evidence'
      using errcode = '23514';
  end if;

  if p_updates is null
     or jsonb_typeof(p_updates) <> 'array'
     or jsonb_array_length(p_updates) < 1
     or jsonb_array_length(p_updates) > 50 then
    raise exception 'updates must contain 1 to 50 items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each Evidence update must be an object' using errcode = '22023';
    end if;

    begin
      v_evidence_id := (v_item->>'id')::uuid;
    exception when others then
      raise exception 'Each update requires a valid Evidence id' using errcode = '22023';
    end;

    select array_agg(k.key order by k.key) into v_unknown_keys
    from jsonb_object_keys(v_item) as k(key)
    where k.key not in (
      'id', 'summary_ko', 'pain_type', 'target_user', 'situation',
      'sentiment_level', 'intensity_level', 'status', 'order_index'
    );

    if v_unknown_keys is not null then
      raise exception 'Unsupported Evidence fields: %', array_to_string(v_unknown_keys, ', ')
        using errcode = '22023';
    end if;

    if v_item ? 'status'
       and coalesce(v_item->>'status', '') not in ('draft', 'deleted') then
      raise exception 'Batch edit status must be draft or deleted' using errcode = '22023';
    end if;

    update public.ar_pain_evidences
    set
      summary_ko = case when v_item ? 'summary_ko' then nullif(v_item->>'summary_ko', '') else summary_ko end,
      pain_type = case when v_item ? 'pain_type' then nullif(v_item->>'pain_type', '') else pain_type end,
      target_user = case when v_item ? 'target_user' then nullif(v_item->>'target_user', '') else target_user end,
      situation = case when v_item ? 'situation' then nullif(v_item->>'situation', '') else situation end,
      sentiment_level = case when v_item ? 'sentiment_level' then nullif(v_item->>'sentiment_level', '') else sentiment_level end,
      intensity_level = case when v_item ? 'intensity_level' then nullif(v_item->>'intensity_level', '') else intensity_level end,
      status = case when v_item ? 'status' then v_item->>'status' else status end,
      order_index = case when v_item ? 'order_index' then (v_item->>'order_index')::integer else order_index end
    where id = v_evidence_id
      and raw_input_id = p_raw_input_id
      and user_id = p_user_id
      and status <> 'deleted';

    if not found then
      raise exception 'Evidence not found: %', v_evidence_id using errcode = 'P0002';
    end if;
  end loop;

  return query
  select e.*
  from public.ar_pain_evidences e
  where e.raw_input_id = p_raw_input_id
    and e.user_id = p_user_id
    and e.status <> 'deleted'
  order by e.order_index asc, e.created_at asc;
end;
$$;

revoke all on function public.ar_replace_evidence_fixture(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ar_update_evidence_batch(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ar_replace_evidence_fixture(uuid, uuid, jsonb) to service_role;
grant execute on function public.ar_update_evidence_batch(uuid, uuid, jsonb) to service_role;
