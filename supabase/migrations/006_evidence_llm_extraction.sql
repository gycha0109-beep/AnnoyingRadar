-- Phase 3: guarded OpenAI Evidence extraction state machine.
-- External model calls happen outside DB transactions. attempt_id prevents stale completion.

alter table public.ar_raw_inputs
  add column if not exists extraction_attempt_id uuid,
  add column if not exists extraction_model text,
  add column if not exists extraction_prompt_version text,
  add column if not exists extraction_provider_request_id text,
  add column if not exists extraction_error_code text,
  add column if not exists extraction_started_at timestamptz,
  add column if not exists extraction_completed_at timestamptz,
  add column if not exists extraction_input_tokens integer,
  add column if not exists extraction_output_tokens integer;

alter table public.ar_raw_inputs
  drop constraint if exists ar_raw_inputs_extraction_input_tokens_check,
  add constraint ar_raw_inputs_extraction_input_tokens_check
    check (extraction_input_tokens is null or extraction_input_tokens >= 0),
  drop constraint if exists ar_raw_inputs_extraction_output_tokens_check,
  add constraint ar_raw_inputs_extraction_output_tokens_check
    check (extraction_output_tokens is null or extraction_output_tokens >= 0);

create or replace function public.ar_begin_evidence_extraction(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_force boolean,
  p_attempt_id uuid,
  p_model text,
  p_prompt_version text
)
returns public.ar_raw_inputs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_input public.ar_raw_inputs%rowtype;
  v_is_stale boolean := false;
begin
  if p_attempt_id is null then
    raise exception 'Extraction attempt id is required' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_model, ''))) = 0
     or length(trim(coalesce(p_prompt_version, ''))) = 0 then
    raise exception 'Extraction model and prompt version are required' using errcode = '22023';
  end if;

  select * into v_raw_input
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Raw input not found' using errcode = 'P0002';
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

  if v_raw_input.analysis_status = 'extracting' then
    v_is_stale := v_raw_input.extraction_started_at is null
      or v_raw_input.extraction_started_at < now() - interval '10 minutes';

    if not v_is_stale then
      raise exception 'Extraction already in progress' using errcode = '55P03';
    end if;
  end if;

  if v_raw_input.analysis_status <> 'extracting' then
    if coalesce(p_force, false) then
      if v_raw_input.analysis_status not in ('input_saved', 'extraction_failed', 'reviewing_evidence') then
        raise exception 'Force extraction not allowed from status %', v_raw_input.analysis_status
          using errcode = '23514';
      end if;
    elsif v_raw_input.analysis_status not in ('input_saved', 'extraction_failed') then
      raise exception 'Extraction not allowed from status %', v_raw_input.analysis_status
        using errcode = '23514';
    end if;
  end if;

  update public.ar_raw_inputs
  set
    analysis_status = 'extracting',
    extraction_attempt_id = p_attempt_id,
    extraction_model = trim(p_model),
    extraction_prompt_version = trim(p_prompt_version),
    extraction_provider_request_id = null,
    extraction_error_code = null,
    extraction_started_at = now(),
    extraction_completed_at = null,
    extraction_input_tokens = null,
    extraction_output_tokens = null
  where id = p_raw_input_id
  returning * into v_raw_input;

  return v_raw_input;
end;
$$;

create or replace function public.ar_complete_evidence_extraction(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_evidences jsonb,
  p_model text,
  p_provider_request_id text,
  p_input_tokens integer,
  p_output_tokens integer
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
  v_unknown_keys text[];
begin
  select * into v_raw_input
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Raw input not found' using errcode = 'P0002';
  end if;

  if v_raw_input.analysis_status <> 'extracting'
     or v_raw_input.extraction_attempt_id is distinct from p_attempt_id then
    raise exception 'Stale or invalid extraction attempt' using errcode = '40001';
  end if;

  if p_evidences is null
     or jsonb_typeof(p_evidences) <> 'array'
     or jsonb_array_length(p_evidences) > 20 then
    raise exception 'Extracted Evidence must be an array of at most 20 items'
      using errcode = '22023';
  end if;

  if p_input_tokens is not null and p_input_tokens < 0
     or p_output_tokens is not null and p_output_tokens < 0 then
    raise exception 'Token usage cannot be negative' using errcode = '22023';
  end if;

  -- A successful retry replaces only non-final derived data.
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
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each extracted Evidence item must be an object' using errcode = '22023';
    end if;

    select array_agg(k) into v_unknown_keys
    from jsonb_object_keys(v_item) as keys(k)
    where k not in (
      'original_text', 'summary_ko', 'pain_type', 'target_user', 'situation',
      'sentiment_level', 'intensity_level'
    );

    if v_unknown_keys is not null then
      raise exception 'Unsupported extracted Evidence fields: %', array_to_string(v_unknown_keys, ', ')
        using errcode = '22023';
    end if;

    if length(trim(coalesce(v_item->>'original_text', ''))) = 0
       or position(v_item->>'original_text' in v_raw_input.raw_text) = 0 then
      raise exception 'Evidence original_text must be an exact quote from Raw Input'
        using errcode = '23514';
    end if;

    if length(trim(coalesce(v_item->>'summary_ko', ''))) = 0 then
      raise exception 'Evidence summary_ko is required' using errcode = '22023';
    end if;

    if coalesce(v_item->>'pain_type', '') not in (
      'usability', 'reliability', 'performance', 'customer_support', 'pricing',
      'accessibility', 'trust', 'workflow', 'other'
    ) then
      raise exception 'Invalid Evidence pain_type' using errcode = '22023';
    end if;

    if coalesce(v_item->>'sentiment_level', '') not in ('negative', 'mixed', 'neutral', 'unknown')
       or coalesce(v_item->>'intensity_level', '') not in ('low', 'medium', 'high', 'unknown') then
      raise exception 'Invalid Evidence level' using errcode = '22023';
    end if;

    insert into public.ar_pain_evidences (
      user_id,
      raw_input_id,
      original_text,
      summary_ko,
      pain_type,
      target_user,
      situation,
      sentiment_level,
      intensity_level,
      source_type,
      source_url,
      source_memo,
      status,
      order_index
    ) values (
      p_user_id,
      p_raw_input_id,
      v_item->>'original_text',
      v_item->>'summary_ko',
      v_item->>'pain_type',
      nullif(v_item->>'target_user', ''),
      nullif(v_item->>'situation', ''),
      v_item->>'sentiment_level',
      v_item->>'intensity_level',
      v_raw_input.source_type,
      v_raw_input.source_url,
      v_raw_input.source_memo,
      'draft',
      v_index
    );

    v_index := v_index + 1;
  end loop;

  update public.ar_raw_inputs
  set
    analysis_status = 'reviewing_evidence',
    extraction_model = coalesce(nullif(trim(p_model), ''), extraction_model),
    extraction_provider_request_id = nullif(trim(p_provider_request_id), ''),
    extraction_error_code = null,
    extraction_completed_at = now(),
    extraction_input_tokens = p_input_tokens,
    extraction_output_tokens = p_output_tokens
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

create or replace function public.ar_fail_evidence_extraction(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns public.ar_raw_inputs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_input public.ar_raw_inputs%rowtype;
begin
  select * into v_raw_input
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Raw input not found' using errcode = 'P0002';
  end if;

  -- A delayed failure from an older request must not overwrite a newer attempt.
  if v_raw_input.analysis_status = 'extracting'
     and v_raw_input.extraction_attempt_id is not distinct from p_attempt_id then
    update public.ar_raw_inputs
    set
      analysis_status = 'extraction_failed',
      extraction_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'unknown_error'), 120),
      extraction_completed_at = now()
    where id = p_raw_input_id
    returning * into v_raw_input;
  end if;

  return v_raw_input;
end;
$$;

revoke all on function public.ar_begin_evidence_extraction(uuid, uuid, boolean, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.ar_complete_evidence_extraction(uuid, uuid, uuid, jsonb, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.ar_fail_evidence_extraction(uuid, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.ar_begin_evidence_extraction(uuid, uuid, boolean, uuid, text, text)
  to service_role;
grant execute on function public.ar_complete_evidence_extraction(uuid, uuid, uuid, jsonb, text, text, integer, integer)
  to service_role;
grant execute on function public.ar_fail_evidence_extraction(uuid, uuid, uuid, text)
  to service_role;
