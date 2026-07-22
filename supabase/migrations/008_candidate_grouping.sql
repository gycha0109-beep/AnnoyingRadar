-- Phase 4: guarded OpenAI Problem Candidate grouping.
-- External model calls happen outside DB transactions. attempt_id rejects stale completion.

alter table public.ar_raw_inputs
  add column if not exists grouping_attempt_id uuid,
  add column if not exists grouping_model text,
  add column if not exists grouping_prompt_version text,
  add column if not exists grouping_provider_request_id text,
  add column if not exists grouping_error_code text,
  add column if not exists grouping_started_at timestamptz,
  add column if not exists grouping_completed_at timestamptz,
  add column if not exists grouping_input_tokens integer,
  add column if not exists grouping_output_tokens integer;

alter table public.ar_raw_inputs
  drop constraint if exists ar_raw_inputs_grouping_input_tokens_check,
  add constraint ar_raw_inputs_grouping_input_tokens_check
    check (grouping_input_tokens is null or grouping_input_tokens >= 0),
  drop constraint if exists ar_raw_inputs_grouping_output_tokens_check,
  add constraint ar_raw_inputs_grouping_output_tokens_check
    check (grouping_output_tokens is null or grouping_output_tokens >= 0);

create or replace function public.ar_reset_grouping_metadata_on_grouping_entry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.analysis_status = 'grouping'
     and old.analysis_status is distinct from 'grouping'
     and new.grouping_attempt_id is null then
    new.grouping_model := null;
    new.grouping_prompt_version := null;
    new.grouping_provider_request_id := null;
    new.grouping_error_code := null;
    new.grouping_started_at := null;
    new.grouping_completed_at := null;
    new.grouping_input_tokens := null;
    new.grouping_output_tokens := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ar_reset_grouping_metadata_on_grouping_entry on public.ar_raw_inputs;
create trigger trg_ar_reset_grouping_metadata_on_grouping_entry
before update of analysis_status on public.ar_raw_inputs
for each row execute function public.ar_reset_grouping_metadata_on_grouping_entry();

create or replace function public.ar_reset_extraction_metadata_on_raw_text_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.raw_text is distinct from old.raw_text then
    new.extraction_attempt_id := null;
    new.extraction_model := null;
    new.extraction_prompt_version := null;
    new.extraction_provider_request_id := null;
    new.extraction_error_code := null;
    new.extraction_started_at := null;
    new.extraction_completed_at := null;
    new.extraction_input_tokens := null;
    new.extraction_output_tokens := null;
    new.grouping_attempt_id := null;
    new.grouping_model := null;
    new.grouping_prompt_version := null;
    new.grouping_provider_request_id := null;
    new.grouping_error_code := null;
    new.grouping_started_at := null;
    new.grouping_completed_at := null;
    new.grouping_input_tokens := null;
    new.grouping_output_tokens := null;
  end if;
  return new;
end;
$$;

create or replace function public.ar_begin_candidate_grouping(
  p_raw_input_id uuid,
  p_user_id uuid,
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
  v_confirmed_evidence_count integer;
  v_is_stale boolean := false;
begin
  if p_attempt_id is null then
    raise exception 'Grouping attempt id is required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_model, ''))) = 0
     or length(trim(coalesce(p_prompt_version, ''))) = 0 then
    raise exception 'Grouping model and prompt version are required' using errcode = '22023';
  end if;

  select * into v_raw_input
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Raw input not found' using errcode = 'P0002';
  end if;
  if v_raw_input.analysis_status not in ('grouping', 'grouping_failed') then
    raise exception 'Candidate grouping not allowed from status %', v_raw_input.analysis_status
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.ar_problem_candidates
    where raw_input_id = p_raw_input_id
      and user_id = p_user_id
      and status = 'confirmed'
  ) then
    raise exception 'Confirmed Candidate exists' using errcode = '23514';
  end if;

  select count(*) into v_confirmed_evidence_count
  from public.ar_pain_evidences
  where raw_input_id = p_raw_input_id
    and user_id = p_user_id
    and status = 'confirmed';

  if v_confirmed_evidence_count < 1 or v_confirmed_evidence_count > 20 then
    raise exception 'Candidate grouping requires 1 to 20 confirmed Evidence items'
      using errcode = '23514';
  end if;

  if v_raw_input.analysis_status = 'grouping'
     and v_raw_input.grouping_attempt_id is not null then
    v_is_stale := v_raw_input.grouping_started_at is null
      or v_raw_input.grouping_started_at < now() - interval '10 minutes';
    if not v_is_stale then
      raise exception 'Candidate grouping already in progress' using errcode = '55P03';
    end if;
  end if;

  update public.ar_raw_inputs
  set
    analysis_status = 'grouping',
    grouping_attempt_id = p_attempt_id,
    grouping_model = trim(p_model),
    grouping_prompt_version = trim(p_prompt_version),
    grouping_provider_request_id = null,
    grouping_error_code = null,
    grouping_started_at = now(),
    grouping_completed_at = null,
    grouping_input_tokens = null,
    grouping_output_tokens = null
  where id = p_raw_input_id
  returning * into v_raw_input;

  return v_raw_input;
end;
$$;

create or replace function public.ar_create_problem_candidates_from_grouping(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_candidates_json jsonb
)
returns setof public.ar_problem_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_candidate jsonb;
  v_candidate_id uuid;
  v_evidence_id uuid;
  v_confirmed_count integer;
  v_candidate_ref_count integer;
  v_candidate_distinct_ref_count integer;
  v_total_ref_count integer;
  v_distinct_ref_count integer;
  v_index integer := 0;
  v_unknown_keys text[];
  v_inserted_ids uuid[] := array[]::uuid[];
begin
  if p_candidates_json is null
     or jsonb_typeof(p_candidates_json) <> 'array'
     or jsonb_array_length(p_candidates_json) < 1
     or jsonb_array_length(p_candidates_json) > 20 then
    raise exception 'Candidate grouping output must contain 1 to 20 candidates'
      using errcode = '22023';
  end if;

  select analysis_status into v_status
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Raw input not found' using errcode = 'P0002';
  end if;
  if v_status <> 'grouping' then
    raise exception 'Candidates can only be created while grouping' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.ar_problem_candidates
    where raw_input_id = p_raw_input_id
      and user_id = p_user_id
      and status = 'confirmed'
  ) then
    raise exception 'Confirmed Candidate exists' using errcode = '23514';
  end if;

  select count(*) into v_confirmed_count
  from public.ar_pain_evidences
  where raw_input_id = p_raw_input_id
    and user_id = p_user_id
    and status = 'confirmed';

  if v_confirmed_count < 1 or v_confirmed_count > 20 then
    raise exception 'Candidate grouping requires 1 to 20 confirmed Evidence items'
      using errcode = '23514';
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates_json)
  loop
    if jsonb_typeof(v_candidate) <> 'object' then
      raise exception 'Each Candidate must be an object' using errcode = '22023';
    end if;

    select array_agg(k order by k) into v_unknown_keys
    from jsonb_object_keys(v_candidate) as keys(k)
    where k not in (
      'title', 'summary', 'target_user', 'situation', 'evidence_ids',
      'intensity_level', 'repeat_pattern_level', 'clarity_level', 'order_index'
    );
    if v_unknown_keys is not null then
      raise exception 'Unsupported Candidate fields: %', array_to_string(v_unknown_keys, ', ')
        using errcode = '22023';
    end if;

    if length(trim(coalesce(v_candidate->>'title', ''))) = 0
       or length(v_candidate->>'title') > 200 then
      raise exception 'Candidate title is required and must be at most 200 characters'
        using errcode = '22023';
    end if;
    if length(trim(coalesce(v_candidate->>'summary', ''))) = 0
       or length(v_candidate->>'summary') > 2000 then
      raise exception 'Candidate summary is required and must be at most 2000 characters'
        using errcode = '22023';
    end if;
    if length(coalesce(v_candidate->>'target_user', '')) > 500
       or length(coalesce(v_candidate->>'situation', '')) > 500 then
      raise exception 'Candidate target_user and situation must be at most 500 characters'
        using errcode = '22023';
    end if;
    if coalesce(v_candidate->>'intensity_level', '') not in ('low', 'medium', 'high', 'unknown')
       or coalesce(v_candidate->>'repeat_pattern_level', '') not in ('weak', 'moderate', 'strong', 'unknown')
       or coalesce(v_candidate->>'clarity_level', '') not in ('unclear', 'partial', 'clear', 'unknown') then
      raise exception 'Invalid Candidate metric level' using errcode = '22023';
    end if;
    if not (v_candidate ? 'evidence_ids')
       or jsonb_typeof(v_candidate->'evidence_ids') <> 'array'
       or jsonb_array_length(v_candidate->'evidence_ids') < 1
       or jsonb_array_length(v_candidate->'evidence_ids') > 20 then
      raise exception 'Candidate evidence_ids must contain 1 to 20 items'
        using errcode = '22023';
    end if;

    begin
      select count(*), count(distinct value)
        into v_candidate_ref_count, v_candidate_distinct_ref_count
      from jsonb_array_elements_text(v_candidate->'evidence_ids');

      if v_candidate_ref_count <> v_candidate_distinct_ref_count then
        raise exception 'Candidate evidence_ids must not contain duplicates' using errcode = '22023';
      end if;

      for v_evidence_id in
        select value::uuid from jsonb_array_elements_text(v_candidate->'evidence_ids')
      loop
        if not exists (
          select 1 from public.ar_pain_evidences
          where id = v_evidence_id
            and raw_input_id = p_raw_input_id
            and user_id = p_user_id
            and status = 'confirmed'
        ) then
          raise exception 'Invalid confirmed Evidence id for grouping: %', v_evidence_id
            using errcode = '23514';
        end if;
      end loop;
    exception
      when invalid_text_representation then
        raise exception 'Candidate evidence_ids must be valid UUIDs' using errcode = '22023';
    end;
  end loop;

  begin
    select count(*), count(distinct evidence_id)
      into v_total_ref_count, v_distinct_ref_count
    from (
      select evidence_value::uuid as evidence_id
      from jsonb_array_elements(p_candidates_json) as candidates(candidate),
           jsonb_array_elements_text(candidate->'evidence_ids') as evidence_values(evidence_value)
    ) refs;
  exception
    when invalid_text_representation then
      raise exception 'Candidate evidence_ids must be valid UUIDs' using errcode = '22023';
  end;

  if v_total_ref_count <> v_distinct_ref_count then
    raise exception 'Confirmed Evidence cannot appear in multiple Candidates'
      using errcode = '23514';
  end if;
  if v_distinct_ref_count <> v_confirmed_count then
    raise exception 'Every confirmed Evidence must appear exactly once across Candidates'
      using errcode = '23514';
  end if;

  delete from public.ar_problem_evidence_links l
  using public.ar_problem_candidates c
  where l.problem_candidate_id = c.id
    and c.raw_input_id = p_raw_input_id
    and c.user_id = p_user_id
    and c.status = 'draft';

  delete from public.ar_problem_candidates
  where raw_input_id = p_raw_input_id
    and user_id = p_user_id
    and status = 'draft';

  for v_candidate in select value from jsonb_array_elements(p_candidates_json)
  loop
    insert into public.ar_problem_candidates (
      user_id, raw_input_id, title, summary, target_user, situation,
      evidence_count, intensity_level, repeat_pattern_level, clarity_level,
      status, order_index
    ) values (
      p_user_id,
      p_raw_input_id,
      trim(v_candidate->>'title'),
      trim(v_candidate->>'summary'),
      nullif(trim(coalesce(v_candidate->>'target_user', '')), ''),
      nullif(trim(coalesce(v_candidate->>'situation', '')), ''),
      jsonb_array_length(v_candidate->'evidence_ids'),
      v_candidate->>'intensity_level',
      v_candidate->>'repeat_pattern_level',
      v_candidate->>'clarity_level',
      'draft',
      v_index
    ) returning id into v_candidate_id;

    v_inserted_ids := array_append(v_inserted_ids, v_candidate_id);

    for v_evidence_id in
      select value::uuid from jsonb_array_elements_text(v_candidate->'evidence_ids')
    loop
      insert into public.ar_problem_evidence_links (problem_candidate_id, pain_evidence_id)
      values (v_candidate_id, v_evidence_id);
    end loop;

    v_index := v_index + 1;
  end loop;

  update public.ar_raw_inputs
  set analysis_status = 'reviewing_candidates'
  where id = p_raw_input_id
    and user_id = p_user_id;

  return query
  select c.*
  from public.ar_problem_candidates c
  where c.id = any(v_inserted_ids)
  order by c.order_index asc, c.created_at asc;
end;
$$;

create or replace function public.ar_complete_candidate_grouping(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_candidates jsonb,
  p_model text,
  p_provider_request_id text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns setof public.ar_problem_candidates
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
  if v_raw_input.analysis_status <> 'grouping'
     or v_raw_input.grouping_attempt_id is distinct from p_attempt_id then
    raise exception 'Stale or invalid grouping attempt' using errcode = '40001';
  end if;
  if (p_input_tokens is not null and p_input_tokens < 0)
     or (p_output_tokens is not null and p_output_tokens < 0) then
    raise exception 'Token usage cannot be negative' using errcode = '22023';
  end if;

  return query
  select * from public.ar_create_problem_candidates_from_grouping(
    p_raw_input_id,
    p_user_id,
    p_candidates
  );

  update public.ar_raw_inputs
  set
    grouping_model = coalesce(nullif(trim(p_model), ''), grouping_model),
    grouping_provider_request_id = nullif(trim(p_provider_request_id), ''),
    grouping_error_code = null,
    grouping_completed_at = now(),
    grouping_input_tokens = p_input_tokens,
    grouping_output_tokens = p_output_tokens
  where id = p_raw_input_id
    and user_id = p_user_id;
end;
$$;

create or replace function public.ar_fail_candidate_grouping(
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

  if v_raw_input.analysis_status = 'grouping'
     and v_raw_input.grouping_attempt_id is not distinct from p_attempt_id then
    update public.ar_raw_inputs
    set
      analysis_status = 'grouping_failed',
      grouping_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'unknown_error'), 120),
      grouping_completed_at = now()
    where id = p_raw_input_id
    returning * into v_raw_input;
  end if;

  return v_raw_input;
end;
$$;

revoke all on function public.ar_create_problem_candidates_from_grouping(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.ar_begin_candidate_grouping(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.ar_complete_candidate_grouping(uuid, uuid, uuid, jsonb, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.ar_fail_candidate_grouping(uuid, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.ar_begin_candidate_grouping(uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.ar_complete_candidate_grouping(uuid, uuid, uuid, jsonb, text, text, integer, integer)
  to service_role;
grant execute on function public.ar_fail_candidate_grouping(uuid, uuid, uuid, text)
  to service_role;
