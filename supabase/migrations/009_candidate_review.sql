-- Phase 5: guarded Problem Candidate review, merge, split, status transitions, and completion.

create or replace function public.ar_validate_problem_evidence_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_candidate_user_id uuid;
  v_candidate_raw_input_id uuid;
  v_candidate_status text;
  v_evidence_user_id uuid;
  v_evidence_raw_input_id uuid;
begin
  select user_id, raw_input_id, status
    into v_candidate_user_id, v_candidate_raw_input_id, v_candidate_status
  from public.ar_problem_candidates
  where id = new.problem_candidate_id;

  select user_id, raw_input_id
    into v_evidence_user_id, v_evidence_raw_input_id
  from public.ar_pain_evidences
  where id = new.pain_evidence_id;

  if v_candidate_user_id is null then
    raise exception 'Problem Candidate not found: %', new.problem_candidate_id using errcode = '23503';
  end if;
  if v_evidence_user_id is null then
    raise exception 'Evidence not found: %', new.pain_evidence_id using errcode = '23503';
  end if;
  if v_candidate_user_id <> v_evidence_user_id then
    raise exception 'Problem Candidate and Evidence must belong to the same user'
      using errcode = '23514';
  end if;
  if v_candidate_raw_input_id <> v_evidence_raw_input_id then
    raise exception 'Problem Candidate and Evidence must belong to the same Raw Input'
      using errcode = '23514';
  end if;

  if v_candidate_status <> 'discarded' and exists (
    select 1
    from public.ar_problem_evidence_links l
    join public.ar_problem_candidates c on c.id = l.problem_candidate_id
    where l.pain_evidence_id = new.pain_evidence_id
      and l.id <> new.id
      and c.status <> 'discarded'
  ) then
    raise exception 'Evidence is already linked to another active Candidate'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.ar_sync_problem_candidate_evidence_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.ar_problem_candidates c
    set evidence_count = (
      select count(*)::integer
      from public.ar_problem_evidence_links l
      where l.problem_candidate_id = old.problem_candidate_id
    )
    where c.id = old.problem_candidate_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    update public.ar_problem_candidates c
    set evidence_count = (
      select count(*)::integer
      from public.ar_problem_evidence_links l
      where l.problem_candidate_id = new.problem_candidate_id
    )
    where c.id = new.problem_candidate_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_ar_sync_problem_candidate_evidence_count
  on public.ar_problem_evidence_links;
create trigger trg_ar_sync_problem_candidate_evidence_count
after insert or delete or update of problem_candidate_id
on public.ar_problem_evidence_links
for each row execute function public.ar_sync_problem_candidate_evidence_count();

-- Normalize existing stored counts before guarded review starts.
update public.ar_problem_candidates c
set evidence_count = (
  select count(*)::integer
  from public.ar_problem_evidence_links l
  where l.problem_candidate_id = c.id
);

create or replace function public.ar_update_problem_candidate(
  p_candidate_id uuid,
  p_user_id uuid,
  p_patch jsonb
)
returns public.ar_problem_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.ar_problem_candidates%rowtype;
  v_status text;
  v_unknown_keys text[];
  v_order_index integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Candidate patch must be a non-empty object' using errcode = '22023';
  end if;

  select * into v_candidate
  from public.ar_problem_candidates
  where id = p_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Problem Candidate not found' using errcode = 'P0002';
  end if;

  select analysis_status into v_status
  from public.ar_raw_inputs
  where id = v_candidate.raw_input_id and user_id = p_user_id
  for update;
  if v_status <> 'reviewing_candidates' then
    raise exception 'Candidate review is only allowed while reviewing_candidates'
      using errcode = '23514';
  end if;
  if v_candidate.status = 'discarded' then
    raise exception 'Restore a discarded Candidate before editing it' using errcode = '23514';
  end if;

  select array_agg(k order by k) into v_unknown_keys
  from jsonb_object_keys(p_patch) as keys(k)
  where k not in (
    'title', 'summary', 'target_user', 'situation', 'intensity_level',
    'repeat_pattern_level', 'clarity_level', 'order_index'
  );
  if v_unknown_keys is not null then
    raise exception 'Unsupported Candidate fields: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  if p_patch ? 'title' and (
    length(trim(coalesce(p_patch->>'title', ''))) = 0
    or length(p_patch->>'title') > 200
  ) then
    raise exception 'Candidate title must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if p_patch ? 'summary' and length(coalesce(p_patch->>'summary', '')) > 2000 then
    raise exception 'Candidate summary must be at most 2000 characters' using errcode = '22023';
  end if;
  if p_patch ? 'target_user' and length(coalesce(p_patch->>'target_user', '')) > 500 then
    raise exception 'Candidate target_user must be at most 500 characters' using errcode = '22023';
  end if;
  if p_patch ? 'situation' and length(coalesce(p_patch->>'situation', '')) > 500 then
    raise exception 'Candidate situation must be at most 500 characters' using errcode = '22023';
  end if;
  if p_patch ? 'intensity_level'
     and nullif(p_patch->>'intensity_level', '') is not null
     and p_patch->>'intensity_level' not in ('low', 'medium', 'high', 'unknown') then
    raise exception 'Invalid Candidate intensity_level' using errcode = '22023';
  end if;
  if p_patch ? 'repeat_pattern_level'
     and nullif(p_patch->>'repeat_pattern_level', '') is not null
     and p_patch->>'repeat_pattern_level' not in ('weak', 'moderate', 'strong', 'unknown') then
    raise exception 'Invalid Candidate repeat_pattern_level' using errcode = '22023';
  end if;
  if p_patch ? 'clarity_level'
     and nullif(p_patch->>'clarity_level', '') is not null
     and p_patch->>'clarity_level' not in ('unclear', 'partial', 'clear', 'unknown') then
    raise exception 'Invalid Candidate clarity_level' using errcode = '22023';
  end if;

  if p_patch ? 'order_index' then
    begin
      v_order_index := (p_patch->>'order_index')::integer;
    exception when others then
      raise exception 'Candidate order_index must be an integer' using errcode = '22023';
    end;
    if v_order_index < 0 then
      raise exception 'Candidate order_index must be non-negative' using errcode = '22023';
    end if;
  end if;

  update public.ar_problem_candidates
  set
    title = case when p_patch ? 'title' then trim(p_patch->>'title') else title end,
    summary = case when p_patch ? 'summary' then nullif(trim(p_patch->>'summary'), '') else summary end,
    target_user = case when p_patch ? 'target_user' then nullif(trim(p_patch->>'target_user'), '') else target_user end,
    situation = case when p_patch ? 'situation' then nullif(trim(p_patch->>'situation'), '') else situation end,
    intensity_level = case when p_patch ? 'intensity_level' then nullif(p_patch->>'intensity_level', '') else intensity_level end,
    repeat_pattern_level = case when p_patch ? 'repeat_pattern_level' then nullif(p_patch->>'repeat_pattern_level', '') else repeat_pattern_level end,
    clarity_level = case when p_patch ? 'clarity_level' then nullif(p_patch->>'clarity_level', '') else clarity_level end,
    order_index = case when p_patch ? 'order_index' then v_order_index else order_index end
  where id = p_candidate_id
  returning * into v_candidate;

  return v_candidate;
end;
$$;

create or replace function public.ar_set_problem_candidate_status(
  p_candidate_id uuid,
  p_user_id uuid,
  p_target_status text,
  p_discard_reason text default null
)
returns public.ar_problem_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.ar_problem_candidates%rowtype;
  v_raw_status text;
  v_actual_count integer;
begin
  if p_target_status not in ('draft', 'confirmed', 'discarded') then
    raise exception 'Invalid Candidate target status' using errcode = '22023';
  end if;
  if length(coalesce(p_discard_reason, '')) > 1000 then
    raise exception 'discard_reason must be at most 1000 characters' using errcode = '22023';
  end if;

  select * into v_candidate
  from public.ar_problem_candidates
  where id = p_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Problem Candidate not found' using errcode = 'P0002';
  end if;

  select analysis_status into v_raw_status
  from public.ar_raw_inputs
  where id = v_candidate.raw_input_id and user_id = p_user_id
  for update;
  if v_raw_status <> 'reviewing_candidates' then
    raise exception 'Candidate status can only change while reviewing_candidates'
      using errcode = '23514';
  end if;

  if not (
    v_candidate.status = p_target_status
    or (v_candidate.status = 'draft' and p_target_status in ('confirmed', 'discarded'))
    or (v_candidate.status = 'confirmed' and p_target_status in ('draft', 'discarded'))
    or (v_candidate.status = 'discarded' and p_target_status = 'draft')
  ) then
    raise exception 'Invalid Candidate status transition: % -> %', v_candidate.status, p_target_status
      using errcode = '23514';
  end if;

  select count(*)::integer into v_actual_count
  from public.ar_problem_evidence_links
  where problem_candidate_id = p_candidate_id;

  if p_target_status in ('draft', 'confirmed') then
    if v_actual_count < 1 then
      raise exception 'An active Candidate must have at least one Evidence'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.ar_problem_evidence_links own_link
      join public.ar_problem_evidence_links other_link
        on other_link.pain_evidence_id = own_link.pain_evidence_id
       and other_link.problem_candidate_id <> own_link.problem_candidate_id
      join public.ar_problem_candidates other_candidate
        on other_candidate.id = other_link.problem_candidate_id
      where own_link.problem_candidate_id = p_candidate_id
        and other_candidate.status <> 'discarded'
    ) then
      raise exception 'Candidate Evidence overlaps another active Candidate'
        using errcode = '23514';
    end if;
  end if;

  if p_target_status = 'confirmed' and (
    length(trim(v_candidate.title)) = 0
    or length(trim(coalesce(v_candidate.summary, ''))) = 0
  ) then
    raise exception 'Confirmed Problem Card requires title and summary'
      using errcode = '23514';
  end if;

  update public.ar_problem_candidates
  set
    status = p_target_status,
    evidence_count = v_actual_count,
    discard_reason = case
      when p_target_status = 'discarded' then nullif(trim(coalesce(p_discard_reason, '')), '')
      else null
    end
  where id = p_candidate_id
  returning * into v_candidate;

  return v_candidate;
end;
$$;

create or replace function public.ar_move_candidate_evidence(
  p_source_candidate_id uuid,
  p_target_candidate_id uuid,
  p_evidence_id uuid,
  p_user_id uuid
)
returns setof public.ar_problem_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.ar_problem_candidates%rowtype;
  v_target public.ar_problem_candidates%rowtype;
  v_raw_status text;
  v_source_count integer;
begin
  if p_source_candidate_id = p_target_candidate_id then
    raise exception 'Source and target Candidates must be different' using errcode = '22023';
  end if;

  perform 1
  from public.ar_problem_candidates
  where id in (p_source_candidate_id, p_target_candidate_id) and user_id = p_user_id
  order by id
  for update;

  select * into v_source from public.ar_problem_candidates
  where id = p_source_candidate_id and user_id = p_user_id;
  select * into v_target from public.ar_problem_candidates
  where id = p_target_candidate_id and user_id = p_user_id;
  if v_source.id is null or v_target.id is null then
    raise exception 'Problem Candidate not found' using errcode = 'P0002';
  end if;
  if v_source.raw_input_id <> v_target.raw_input_id then
    raise exception 'Candidates must belong to the same Raw Input' using errcode = '23514';
  end if;
  if v_source.status <> 'draft' or v_target.status <> 'draft' then
    raise exception 'Evidence can only move between draft Candidates' using errcode = '23514';
  end if;

  select analysis_status into v_raw_status
  from public.ar_raw_inputs
  where id = v_source.raw_input_id and user_id = p_user_id
  for update;
  if v_raw_status <> 'reviewing_candidates' then
    raise exception 'Evidence can only move while reviewing_candidates' using errcode = '23514';
  end if;

  select count(*)::integer into v_source_count
  from public.ar_problem_evidence_links
  where problem_candidate_id = p_source_candidate_id;
  if v_source_count <= 1 then
    raise exception 'Source Candidate must retain at least one Evidence' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.ar_problem_evidence_links
    where problem_candidate_id = p_source_candidate_id and pain_evidence_id = p_evidence_id
  ) then
    raise exception 'Evidence is not linked to the source Candidate' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.ar_problem_evidence_links
    where problem_candidate_id = p_target_candidate_id and pain_evidence_id = p_evidence_id
  ) then
    raise exception 'Evidence is already linked to the target Candidate' using errcode = '23505';
  end if;

  delete from public.ar_problem_evidence_links
  where problem_candidate_id = p_source_candidate_id and pain_evidence_id = p_evidence_id;
  insert into public.ar_problem_evidence_links (problem_candidate_id, pain_evidence_id)
  values (p_target_candidate_id, p_evidence_id);

  return query
  select * from public.ar_problem_candidates
  where id in (p_source_candidate_id, p_target_candidate_id)
  order by order_index asc nulls last, created_at asc;
end;
$$;

create or replace function public.ar_merge_problem_candidates(
  p_source_candidate_id uuid,
  p_target_candidate_id uuid,
  p_user_id uuid
)
returns public.ar_problem_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.ar_problem_candidates%rowtype;
  v_target public.ar_problem_candidates%rowtype;
  v_raw_status text;
  v_evidence_id uuid;
begin
  if p_source_candidate_id = p_target_candidate_id then
    raise exception 'Source and target Candidates must be different' using errcode = '22023';
  end if;

  perform 1
  from public.ar_problem_candidates
  where id in (p_source_candidate_id, p_target_candidate_id) and user_id = p_user_id
  order by id
  for update;

  select * into v_source from public.ar_problem_candidates
  where id = p_source_candidate_id and user_id = p_user_id;
  select * into v_target from public.ar_problem_candidates
  where id = p_target_candidate_id and user_id = p_user_id;
  if v_source.id is null or v_target.id is null then
    raise exception 'Problem Candidate not found' using errcode = 'P0002';
  end if;
  if v_source.raw_input_id <> v_target.raw_input_id then
    raise exception 'Candidates must belong to the same Raw Input' using errcode = '23514';
  end if;
  if v_source.status <> 'draft' or v_target.status <> 'draft' then
    raise exception 'Only draft Candidates can be merged' using errcode = '23514';
  end if;

  select analysis_status into v_raw_status
  from public.ar_raw_inputs
  where id = v_source.raw_input_id and user_id = p_user_id
  for update;
  if v_raw_status <> 'reviewing_candidates' then
    raise exception 'Candidates can only be merged while reviewing_candidates'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_problem_evidence_links source_link
    join public.ar_problem_evidence_links target_link
      on target_link.pain_evidence_id = source_link.pain_evidence_id
    where source_link.problem_candidate_id = p_source_candidate_id
      and target_link.problem_candidate_id = p_target_candidate_id
  ) then
    raise exception 'Candidates contain overlapping Evidence' using errcode = '23514';
  end if;

  for v_evidence_id in
    select pain_evidence_id
    from public.ar_problem_evidence_links
    where problem_candidate_id = p_source_candidate_id
    order by created_at, id
  loop
    delete from public.ar_problem_evidence_links
    where problem_candidate_id = p_source_candidate_id and pain_evidence_id = v_evidence_id;
    insert into public.ar_problem_evidence_links (problem_candidate_id, pain_evidence_id)
    values (p_target_candidate_id, v_evidence_id);
  end loop;

  update public.ar_problem_candidates
  set status = 'discarded',
      discard_reason = 'merged_into:' || p_target_candidate_id::text,
      evidence_count = 0
  where id = p_source_candidate_id;

  select * into v_target
  from public.ar_problem_candidates
  where id = p_target_candidate_id;
  return v_target;
end;
$$;

create or replace function public.ar_split_problem_candidate(
  p_source_candidate_id uuid,
  p_user_id uuid,
  p_evidence_ids uuid[],
  p_new_candidate jsonb
)
returns setof public.ar_problem_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.ar_problem_candidates%rowtype;
  v_new_id uuid;
  v_raw_status text;
  v_source_count integer;
  v_selected_count integer;
  v_distinct_count integer;
  v_evidence_id uuid;
  v_unknown_keys text[];
  v_order_index integer;
begin
  select * into v_source
  from public.ar_problem_candidates
  where id = p_source_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Problem Candidate not found' using errcode = 'P0002';
  end if;
  if v_source.status <> 'draft' then
    raise exception 'Only a draft Candidate can be split' using errcode = '23514';
  end if;

  select analysis_status into v_raw_status
  from public.ar_raw_inputs
  where id = v_source.raw_input_id and user_id = p_user_id
  for update;
  if v_raw_status <> 'reviewing_candidates' then
    raise exception 'Candidate can only be split while reviewing_candidates'
      using errcode = '23514';
  end if;

  if p_evidence_ids is null or cardinality(p_evidence_ids) < 1 then
    raise exception 'Split requires at least one Evidence' using errcode = '22023';
  end if;
  select count(*), count(distinct id)
    into v_selected_count, v_distinct_count
  from unnest(p_evidence_ids) as selected(id);
  if v_selected_count <> v_distinct_count then
    raise exception 'Split Evidence ids must be unique' using errcode = '22023';
  end if;

  select count(*)::integer into v_source_count
  from public.ar_problem_evidence_links
  where problem_candidate_id = p_source_candidate_id;
  if v_selected_count >= v_source_count then
    raise exception 'Source Candidate must retain at least one Evidence' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(p_evidence_ids) selected(id)
    where not exists (
      select 1 from public.ar_problem_evidence_links l
      where l.problem_candidate_id = p_source_candidate_id and l.pain_evidence_id = selected.id
    )
  ) then
    raise exception 'Every split Evidence must belong to the source Candidate'
      using errcode = '23514';
  end if;

  if p_new_candidate is null or jsonb_typeof(p_new_candidate) <> 'object' then
    raise exception 'new_candidate must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_unknown_keys
  from jsonb_object_keys(p_new_candidate) as keys(k)
  where k not in (
    'title', 'summary', 'target_user', 'situation', 'intensity_level',
    'repeat_pattern_level', 'clarity_level', 'order_index'
  );
  if v_unknown_keys is not null then
    raise exception 'Unsupported new Candidate fields: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  if length(trim(coalesce(p_new_candidate->>'title', ''))) = 0
     or length(p_new_candidate->>'title') > 200 then
    raise exception 'New Candidate title must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_new_candidate->>'summary', ''))) = 0
     or length(p_new_candidate->>'summary') > 2000 then
    raise exception 'New Candidate summary must contain 1 to 2000 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_new_candidate->>'target_user', '')) > 500
     or length(coalesce(p_new_candidate->>'situation', '')) > 500 then
    raise exception 'New Candidate context must be at most 500 characters' using errcode = '22023';
  end if;
  if coalesce(nullif(p_new_candidate->>'intensity_level', ''), v_source.intensity_level, 'unknown')
       not in ('low', 'medium', 'high', 'unknown')
     or coalesce(nullif(p_new_candidate->>'repeat_pattern_level', ''), v_source.repeat_pattern_level, 'unknown')
       not in ('weak', 'moderate', 'strong', 'unknown')
     or coalesce(nullif(p_new_candidate->>'clarity_level', ''), v_source.clarity_level, 'unknown')
       not in ('unclear', 'partial', 'clear', 'unknown') then
    raise exception 'Invalid new Candidate metric level' using errcode = '22023';
  end if;

  v_order_index := coalesce(v_source.order_index, 0) + 1;
  if p_new_candidate ? 'order_index' then
    begin
      v_order_index := (p_new_candidate->>'order_index')::integer;
    exception when others then
      raise exception 'New Candidate order_index must be an integer' using errcode = '22023';
    end;
    if v_order_index < 0 then
      raise exception 'New Candidate order_index must be non-negative' using errcode = '22023';
    end if;
  end if;

  insert into public.ar_problem_candidates (
    user_id, raw_input_id, title, summary, target_user, situation,
    evidence_count, intensity_level, repeat_pattern_level, clarity_level,
    status, order_index
  ) values (
    p_user_id,
    v_source.raw_input_id,
    trim(p_new_candidate->>'title'),
    trim(p_new_candidate->>'summary'),
    case when p_new_candidate ? 'target_user'
      then nullif(trim(p_new_candidate->>'target_user'), '') else v_source.target_user end,
    case when p_new_candidate ? 'situation'
      then nullif(trim(p_new_candidate->>'situation'), '') else v_source.situation end,
    0,
    coalesce(nullif(p_new_candidate->>'intensity_level', ''), v_source.intensity_level, 'unknown'),
    coalesce(nullif(p_new_candidate->>'repeat_pattern_level', ''), v_source.repeat_pattern_level, 'unknown'),
    coalesce(nullif(p_new_candidate->>'clarity_level', ''), v_source.clarity_level, 'unknown'),
    'draft',
    v_order_index
  ) returning id into v_new_id;

  foreach v_evidence_id in array p_evidence_ids
  loop
    delete from public.ar_problem_evidence_links
    where problem_candidate_id = p_source_candidate_id and pain_evidence_id = v_evidence_id;
    insert into public.ar_problem_evidence_links (problem_candidate_id, pain_evidence_id)
    values (v_new_id, v_evidence_id);
  end loop;

  return query
  select * from public.ar_problem_candidates
  where id in (p_source_candidate_id, v_new_id)
  order by order_index asc nulls last, created_at asc;
end;
$$;

create or replace function public.ar_complete_candidate_review(
  p_raw_input_id uuid,
  p_user_id uuid
)
returns public.ar_raw_inputs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_input public.ar_raw_inputs%rowtype;
  v_confirmed_count integer;
  v_draft_count integer;
begin
  select * into v_raw_input
  from public.ar_raw_inputs
  where id = p_raw_input_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Raw Input not found' using errcode = 'P0002';
  end if;
  if v_raw_input.analysis_status <> 'reviewing_candidates' then
    raise exception 'Candidate review can only complete from reviewing_candidates'
      using errcode = '23514';
  end if;

  select
    count(*) filter (where status = 'confirmed')::integer,
    count(*) filter (where status = 'draft')::integer
  into v_confirmed_count, v_draft_count
  from public.ar_problem_candidates
  where raw_input_id = p_raw_input_id and user_id = p_user_id;

  if v_confirmed_count < 1 then
    raise exception 'At least one confirmed Problem Card is required' using errcode = '23514';
  end if;
  if v_draft_count > 0 then
    raise exception 'Resolve every draft Candidate before completing review' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_problem_candidates c
    left join lateral (
      select count(*)::integer as actual_count
      from public.ar_problem_evidence_links l
      where l.problem_candidate_id = c.id
    ) counts on true
    where c.raw_input_id = p_raw_input_id
      and c.user_id = p_user_id
      and c.status = 'confirmed'
      and (
        length(trim(c.title)) = 0
        or length(trim(coalesce(c.summary, ''))) = 0
        or counts.actual_count < 1
        or c.evidence_count <> counts.actual_count
      )
  ) then
    raise exception 'Every confirmed Problem Card requires valid content and Evidence count'
      using errcode = '23514';
  end if;

  if exists (
    select l.pain_evidence_id
    from public.ar_problem_evidence_links l
    join public.ar_problem_candidates c on c.id = l.problem_candidate_id
    where c.raw_input_id = p_raw_input_id
      and c.user_id = p_user_id
      and c.status <> 'discarded'
    group by l.pain_evidence_id
    having count(*) > 1
  ) then
    raise exception 'Active Candidates contain overlapping Evidence' using errcode = '23514';
  end if;

  update public.ar_raw_inputs
  set analysis_status = 'completed'
  where id = p_raw_input_id
  returning * into v_raw_input;

  return v_raw_input;
end;
$$;

revoke all on function public.ar_validate_problem_evidence_link() from public, anon, authenticated;
revoke all on function public.ar_sync_problem_candidate_evidence_count() from public, anon, authenticated;
revoke all on function public.ar_update_problem_candidate(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_set_problem_candidate_status(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.ar_move_candidate_evidence(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_merge_problem_candidates(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_split_problem_candidate(uuid, uuid, uuid[], jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_complete_candidate_review(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.ar_update_problem_candidate(uuid, uuid, jsonb) to service_role;
grant execute on function public.ar_set_problem_candidate_status(uuid, uuid, text, text) to service_role;
grant execute on function public.ar_move_candidate_evidence(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.ar_merge_problem_candidates(uuid, uuid, uuid) to service_role;
grant execute on function public.ar_split_problem_candidate(uuid, uuid, uuid[], jsonb) to service_role;
grant execute on function public.ar_complete_candidate_review(uuid, uuid) to service_role;
