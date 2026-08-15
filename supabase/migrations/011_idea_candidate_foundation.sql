-- Phase 7.1: Idea Candidate persistence, ownership, and status lifecycle foundation.

create table if not exists public.ar_idea_generation_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_candidate_id uuid not null references public.ar_problem_candidates(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  provider_request_id text,
  generation_input_tokens integer,
  generation_output_tokens integer,
  created_at timestamptz not null default now(),

  constraint ar_idea_generation_batches_model_not_empty
    check (length(trim(model)) between 1 and 200),
  constraint ar_idea_generation_batches_prompt_version_not_empty
    check (length(trim(prompt_version)) between 1 and 200),
  constraint ar_idea_generation_batches_provider_request_id_length
    check (provider_request_id is null or length(provider_request_id) <= 500),
  constraint ar_idea_generation_batches_input_tokens_nonnegative
    check (generation_input_tokens is null or generation_input_tokens >= 0),
  constraint ar_idea_generation_batches_output_tokens_nonnegative
    check (generation_output_tokens is null or generation_output_tokens >= 0)
);

create table if not exists public.ar_idea_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_candidate_id uuid not null references public.ar_problem_candidates(id) on delete cascade,
  generation_batch_id uuid not null references public.ar_idea_generation_batches(id) on delete cascade,

  title text not null,
  one_liner text not null,
  target_user text,
  problem_statement text not null,
  core_value text not null,
  first_build_scope text not null,
  excluded_scope text,
  implementation_difficulty text not null default 'unknown',
  monetization_hint text,
  first_screen_idea text,

  status text not null default 'candidate',
  memo text,
  order_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_idea_candidates_title_length
    check (length(trim(title)) between 1 and 200),
  constraint ar_idea_candidates_one_liner_length
    check (length(trim(one_liner)) between 1 and 500),
  constraint ar_idea_candidates_target_user_length
    check (target_user is null or length(target_user) <= 500),
  constraint ar_idea_candidates_problem_statement_length
    check (length(trim(problem_statement)) between 1 and 2000),
  constraint ar_idea_candidates_core_value_length
    check (length(trim(core_value)) between 1 and 1000),
  constraint ar_idea_candidates_first_build_scope_length
    check (length(trim(first_build_scope)) between 1 and 2000),
  constraint ar_idea_candidates_excluded_scope_length
    check (excluded_scope is null or length(excluded_scope) <= 2000),
  constraint ar_idea_candidates_difficulty_check
    check (implementation_difficulty in ('low', 'medium', 'high', 'unknown')),
  constraint ar_idea_candidates_monetization_hint_length
    check (monetization_hint is null or length(monetization_hint) <= 1000),
  constraint ar_idea_candidates_first_screen_idea_length
    check (first_screen_idea is null or length(first_screen_idea) <= 2000),
  constraint ar_idea_candidates_status_check
    check (status in ('candidate', 'researching', 'build_soon', 'paused', 'discarded', 'archived')),
  constraint ar_idea_candidates_memo_length
    check (memo is null or length(memo) <= 4000),
  constraint ar_idea_candidates_order_index_check
    check (order_index is null or order_index >= 0)
);

create table if not exists public.ar_idea_candidate_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_candidate_id uuid not null references public.ar_idea_candidates(id) on delete cascade,
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now(),

  constraint ar_idea_status_events_from_status_check
    check (
      from_status is null
      or from_status in ('candidate', 'researching', 'build_soon', 'paused', 'discarded', 'archived')
    ),
  constraint ar_idea_status_events_to_status_check
    check (to_status in ('candidate', 'researching', 'build_soon', 'paused', 'discarded', 'archived')),
  constraint ar_idea_status_events_actual_transition_check
    check (from_status is null or from_status <> to_status)
);

create index if not exists ar_idx_idea_generation_batches_user_created
  on public.ar_idea_generation_batches (user_id, created_at desc);
create index if not exists ar_idx_idea_generation_batches_problem_created
  on public.ar_idea_generation_batches (problem_candidate_id, created_at desc);
create index if not exists ar_idx_idea_candidates_user_created
  on public.ar_idea_candidates (user_id, created_at desc);
create index if not exists ar_idx_idea_candidates_user_status_created
  on public.ar_idea_candidates (user_id, status, created_at desc);
create index if not exists ar_idx_idea_candidates_problem_order
  on public.ar_idea_candidates (problem_candidate_id, order_index, created_at);
create index if not exists ar_idx_idea_candidates_generation_batch
  on public.ar_idea_candidates (generation_batch_id);
create index if not exists ar_idx_idea_status_events_idea_created
  on public.ar_idea_candidate_status_events (idea_candidate_id, created_at, id);
create index if not exists ar_idx_idea_status_events_user_created
  on public.ar_idea_candidate_status_events (user_id, created_at desc);

create trigger ar_trg_idea_candidates_updated_at
before update on public.ar_idea_candidates
for each row execute function public.ar_set_updated_at();

create or replace function public.ar_validate_idea_generation_batch_source()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_candidate_user_id uuid;
  v_candidate_status text;
  v_raw_status text;
begin
  select c.user_id, c.status, r.analysis_status
    into v_candidate_user_id, v_candidate_status, v_raw_status
  from public.ar_problem_candidates c
  join public.ar_raw_inputs r on r.id = c.raw_input_id
  where c.id = new.problem_candidate_id;

  if v_candidate_user_id is null then
    raise exception 'Source Problem Card not found' using errcode = '23503';
  end if;
  if v_candidate_user_id <> new.user_id then
    raise exception 'Idea generation batch user_id must match source Problem Card owner'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Idea generation requires a confirmed Problem Card'
      using errcode = '23514';
  end if;
  if v_raw_status <> 'completed' then
    raise exception 'Idea generation requires a completed source analysis'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ar_trg_validate_idea_generation_batch_source
before insert or update of user_id, problem_candidate_id
on public.ar_idea_generation_batches
for each row execute function public.ar_validate_idea_generation_batch_source();

create or replace function public.ar_validate_idea_candidate_source()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_batch_user_id uuid;
  v_batch_problem_candidate_id uuid;
  v_candidate_user_id uuid;
  v_candidate_status text;
  v_raw_status text;
begin
  select user_id, problem_candidate_id
    into v_batch_user_id, v_batch_problem_candidate_id
  from public.ar_idea_generation_batches
  where id = new.generation_batch_id;

  if v_batch_user_id is null then
    raise exception 'Idea generation batch not found' using errcode = '23503';
  end if;
  if v_batch_user_id <> new.user_id then
    raise exception 'Idea Candidate user_id must match generation batch owner'
      using errcode = '23514';
  end if;
  if v_batch_problem_candidate_id <> new.problem_candidate_id then
    raise exception 'Idea Candidate source must match generation batch source'
      using errcode = '23514';
  end if;

  select c.user_id, c.status, r.analysis_status
    into v_candidate_user_id, v_candidate_status, v_raw_status
  from public.ar_problem_candidates c
  join public.ar_raw_inputs r on r.id = c.raw_input_id
  where c.id = new.problem_candidate_id;

  if v_candidate_user_id is null then
    raise exception 'Source Problem Card not found' using errcode = '23503';
  end if;
  if v_candidate_user_id <> new.user_id then
    raise exception 'Idea Candidate user_id must match source Problem Card owner'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' or v_raw_status <> 'completed' then
    raise exception 'Idea Candidate source must remain a confirmed Problem Card from a completed analysis'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ar_trg_validate_idea_candidate_source
before insert or update of user_id, problem_candidate_id, generation_batch_id
on public.ar_idea_candidates
for each row execute function public.ar_validate_idea_candidate_source();

create or replace function public.ar_validate_idea_status_event()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_idea_user_id uuid;
  v_idea_status text;
begin
  select user_id, status
    into v_idea_user_id, v_idea_status
  from public.ar_idea_candidates
  where id = new.idea_candidate_id;

  if v_idea_user_id is null then
    raise exception 'Idea Candidate not found' using errcode = '23503';
  end if;
  if v_idea_user_id <> new.user_id then
    raise exception 'Idea status event user_id must match Idea Candidate owner'
      using errcode = '23514';
  end if;
  if v_idea_status <> new.to_status then
    raise exception 'Idea status event to_status must match current Idea Candidate status'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ar_trg_validate_idea_status_event
before insert on public.ar_idea_candidate_status_events
for each row execute function public.ar_validate_idea_status_event();

create or replace function public.ar_persist_idea_generation_batch(
  p_problem_candidate_id uuid,
  p_user_id uuid,
  p_model text,
  p_prompt_version text,
  p_provider_request_id text,
  p_generation_input_tokens integer,
  p_generation_output_tokens integer,
  p_ideas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.ar_problem_candidates%rowtype;
  v_raw_status text;
  v_batch_id uuid;
  v_idea_id uuid;
  v_idea_ids uuid[] := '{}'::uuid[];
  v_item jsonb;
  v_ordinality integer;
  v_unknown_keys text[];
begin
  if p_user_id is null or p_problem_candidate_id is null then
    raise exception 'Problem Card and user are required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_model, ''))) not between 1 and 200 then
    raise exception 'model must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_prompt_version, ''))) not between 1 and 200 then
    raise exception 'prompt_version must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_provider_request_id, '')) > 500 then
    raise exception 'provider_request_id must be at most 500 characters' using errcode = '22023';
  end if;
  if p_generation_input_tokens is not null and p_generation_input_tokens < 0 then
    raise exception 'generation_input_tokens must be non-negative' using errcode = '22023';
  end if;
  if p_generation_output_tokens is not null and p_generation_output_tokens < 0 then
    raise exception 'generation_output_tokens must be non-negative' using errcode = '22023';
  end if;
  if p_ideas is null or jsonb_typeof(p_ideas) <> 'array' or jsonb_array_length(p_ideas) not between 1 and 3 then
    raise exception 'Idea generation must contain 1 to 3 drafts' using errcode = '22023';
  end if;

  select * into v_candidate
  from public.ar_problem_candidates
  where id = p_problem_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Problem Card not found' using errcode = 'P0002';
  end if;
  if v_candidate.status <> 'confirmed' then
    raise exception 'Idea generation requires a confirmed Problem Card' using errcode = '23514';
  end if;

  select analysis_status into v_raw_status
  from public.ar_raw_inputs
  where id = v_candidate.raw_input_id and user_id = p_user_id
  for update;
  if v_raw_status <> 'completed' then
    raise exception 'Idea generation requires a completed source analysis' using errcode = '23514';
  end if;

  insert into public.ar_idea_generation_batches (
    user_id,
    problem_candidate_id,
    model,
    prompt_version,
    provider_request_id,
    generation_input_tokens,
    generation_output_tokens
  ) values (
    p_user_id,
    p_problem_candidate_id,
    trim(p_model),
    trim(p_prompt_version),
    nullif(trim(coalesce(p_provider_request_id, '')), ''),
    p_generation_input_tokens,
    p_generation_output_tokens
  ) returning id into v_batch_id;

  for v_item, v_ordinality in
    select value, ordinality::integer
    from jsonb_array_elements(p_ideas) with ordinality as items(value, ordinality)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Every Idea draft must be an object' using errcode = '22023';
    end if;

    select array_agg(key order by key) into v_unknown_keys
    from jsonb_object_keys(v_item) as keys(key)
    where key not in (
      'title', 'one_liner', 'target_user', 'problem_statement', 'core_value',
      'first_build_scope', 'excluded_scope', 'implementation_difficulty',
      'monetization_hint', 'first_screen_idea'
    );
    if v_unknown_keys is not null then
      raise exception 'Unsupported Idea draft fields: %', array_to_string(v_unknown_keys, ', ')
        using errcode = '22023';
    end if;

    if not (v_item ?& array[
      'title', 'one_liner', 'target_user', 'problem_statement', 'core_value',
      'first_build_scope', 'excluded_scope', 'implementation_difficulty',
      'monetization_hint', 'first_screen_idea'
    ]) then
      raise exception 'Idea draft is missing required fields' using errcode = '22023';
    end if;

    if jsonb_typeof(v_item->'title') <> 'string'
       or jsonb_typeof(v_item->'one_liner') <> 'string'
       or jsonb_typeof(v_item->'problem_statement') <> 'string'
       or jsonb_typeof(v_item->'core_value') <> 'string'
       or jsonb_typeof(v_item->'first_build_scope') <> 'string'
       or jsonb_typeof(v_item->'implementation_difficulty') <> 'string' then
      raise exception 'Idea draft core fields must be strings' using errcode = '22023';
    end if;

    if jsonb_typeof(v_item->'target_user') not in ('string', 'null')
       or jsonb_typeof(v_item->'excluded_scope') not in ('string', 'null')
       or jsonb_typeof(v_item->'monetization_hint') not in ('string', 'null')
       or jsonb_typeof(v_item->'first_screen_idea') not in ('string', 'null') then
      raise exception 'Idea draft optional fields must be strings or null' using errcode = '22023';
    end if;

    if length(trim(v_item->>'title')) not between 1 and 200
       or length(trim(v_item->>'one_liner')) not between 1 and 500
       or length(trim(v_item->>'problem_statement')) not between 1 and 2000
       or length(trim(v_item->>'core_value')) not between 1 and 1000
       or length(trim(v_item->>'first_build_scope')) not between 1 and 2000 then
      raise exception 'Idea draft core field length is invalid' using errcode = '22023';
    end if;
    if length(coalesce(v_item->>'target_user', '')) > 500
       or length(coalesce(v_item->>'excluded_scope', '')) > 2000
       or length(coalesce(v_item->>'monetization_hint', '')) > 1000
       or length(coalesce(v_item->>'first_screen_idea', '')) > 2000 then
      raise exception 'Idea draft optional field length is invalid' using errcode = '22023';
    end if;
    if v_item->>'implementation_difficulty' not in ('low', 'medium', 'high', 'unknown') then
      raise exception 'Invalid implementation_difficulty' using errcode = '22023';
    end if;

    insert into public.ar_idea_candidates (
      user_id,
      problem_candidate_id,
      generation_batch_id,
      title,
      one_liner,
      target_user,
      problem_statement,
      core_value,
      first_build_scope,
      excluded_scope,
      implementation_difficulty,
      monetization_hint,
      first_screen_idea,
      status,
      order_index
    ) values (
      p_user_id,
      p_problem_candidate_id,
      v_batch_id,
      trim(v_item->>'title'),
      trim(v_item->>'one_liner'),
      nullif(trim(coalesce(v_item->>'target_user', '')), ''),
      trim(v_item->>'problem_statement'),
      trim(v_item->>'core_value'),
      trim(v_item->>'first_build_scope'),
      nullif(trim(coalesce(v_item->>'excluded_scope', '')), ''),
      v_item->>'implementation_difficulty',
      nullif(trim(coalesce(v_item->>'monetization_hint', '')), ''),
      nullif(trim(coalesce(v_item->>'first_screen_idea', '')), ''),
      'candidate',
      v_ordinality - 1
    ) returning id into v_idea_id;

    insert into public.ar_idea_candidate_status_events (
      user_id,
      idea_candidate_id,
      from_status,
      to_status
    ) values (
      p_user_id,
      v_idea_id,
      null,
      'candidate'
    );

    v_idea_ids := array_append(v_idea_ids, v_idea_id);
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'idea_ids', to_jsonb(v_idea_ids)
  );
end;
$$;

create or replace function public.ar_update_idea_candidate(
  p_idea_candidate_id uuid,
  p_user_id uuid,
  p_patch jsonb
)
returns public.ar_idea_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idea public.ar_idea_candidates%rowtype;
  v_unknown_keys text[];
  v_order_index integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Idea Candidate patch must be a non-empty object' using errcode = '22023';
  end if;

  select * into v_idea
  from public.ar_idea_candidates
  where id = p_idea_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Idea Candidate not found' using errcode = 'P0002';
  end if;

  select array_agg(key order by key) into v_unknown_keys
  from jsonb_object_keys(p_patch) as keys(key)
  where key not in (
    'title', 'one_liner', 'target_user', 'problem_statement', 'core_value',
    'first_build_scope', 'excluded_scope', 'implementation_difficulty',
    'monetization_hint', 'first_screen_idea', 'memo', 'order_index'
  );
  if v_unknown_keys is not null then
    raise exception 'Unsupported Idea Candidate fields: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  if p_patch ? 'title' and (
    jsonb_typeof(p_patch->'title') <> 'string'
    or length(trim(coalesce(p_patch->>'title', ''))) not between 1 and 200
  ) then
    raise exception 'title must contain 1 to 200 characters' using errcode = '22023';
  end if;

  if p_patch ? 'implementation_difficulty' and (
    jsonb_typeof(p_patch->'implementation_difficulty') <> 'string'
    or p_patch->>'implementation_difficulty' not in ('low', 'medium', 'high', 'unknown')
  ) then
    raise exception 'Invalid implementation_difficulty' using errcode = '22023';
  end if;

  if p_patch ? 'order_index' then
    if jsonb_typeof(p_patch->'order_index') <> 'number' then
      raise exception 'order_index must be a non-negative integer' using errcode = '22023';
    end if;
    begin
      v_order_index := (p_patch->>'order_index')::integer;
    exception when others then
      raise exception 'order_index must be a non-negative integer' using errcode = '22023';
    end;
    if v_order_index < 0 then
      raise exception 'order_index must be a non-negative integer' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'one_liner' and (
      jsonb_typeof(p_patch->'one_liner') <> 'string'
      or length(trim(coalesce(p_patch->>'one_liner', ''))) not between 1 and 500
    ) then raise exception 'Invalid one_liner' using errcode = '22023'; end if;
  if p_patch ? 'target_user' and (
      p_patch->'target_user' <> 'null'::jsonb and jsonb_typeof(p_patch->'target_user') <> 'string'
      or length(coalesce(p_patch->>'target_user', '')) > 500
    ) then raise exception 'Invalid target_user' using errcode = '22023'; end if;
  if p_patch ? 'problem_statement' and (
      jsonb_typeof(p_patch->'problem_statement') <> 'string'
      or length(trim(coalesce(p_patch->>'problem_statement', ''))) not between 1 and 2000
    ) then raise exception 'Invalid problem_statement' using errcode = '22023'; end if;
  if p_patch ? 'core_value' and (
      jsonb_typeof(p_patch->'core_value') <> 'string'
      or length(trim(coalesce(p_patch->>'core_value', ''))) not between 1 and 1000
    ) then raise exception 'Invalid core_value' using errcode = '22023'; end if;
  if p_patch ? 'first_build_scope' and (
      jsonb_typeof(p_patch->'first_build_scope') <> 'string'
      or length(trim(coalesce(p_patch->>'first_build_scope', ''))) not between 1 and 2000
    ) then raise exception 'Invalid first_build_scope' using errcode = '22023'; end if;
  if p_patch ? 'excluded_scope' and (
      p_patch->'excluded_scope' <> 'null'::jsonb and jsonb_typeof(p_patch->'excluded_scope') <> 'string'
      or length(coalesce(p_patch->>'excluded_scope', '')) > 2000
    ) then raise exception 'Invalid excluded_scope' using errcode = '22023'; end if;
  if p_patch ? 'monetization_hint' and (
      p_patch->'monetization_hint' <> 'null'::jsonb and jsonb_typeof(p_patch->'monetization_hint') <> 'string'
      or length(coalesce(p_patch->>'monetization_hint', '')) > 1000
    ) then raise exception 'Invalid monetization_hint' using errcode = '22023'; end if;
  if p_patch ? 'first_screen_idea' and (
      p_patch->'first_screen_idea' <> 'null'::jsonb and jsonb_typeof(p_patch->'first_screen_idea') <> 'string'
      or length(coalesce(p_patch->>'first_screen_idea', '')) > 2000
    ) then raise exception 'Invalid first_screen_idea' using errcode = '22023'; end if;
  if p_patch ? 'memo' and (
      p_patch->'memo' <> 'null'::jsonb and jsonb_typeof(p_patch->'memo') <> 'string'
      or length(coalesce(p_patch->>'memo', '')) > 4000
    ) then raise exception 'Invalid memo' using errcode = '22023'; end if;

  update public.ar_idea_candidates
  set
    title = case when p_patch ? 'title' then trim(p_patch->>'title') else title end,
    one_liner = case when p_patch ? 'one_liner' then trim(p_patch->>'one_liner') else one_liner end,
    target_user = case when p_patch ? 'target_user' then nullif(trim(coalesce(p_patch->>'target_user', '')), '') else target_user end,
    problem_statement = case when p_patch ? 'problem_statement' then trim(p_patch->>'problem_statement') else problem_statement end,
    core_value = case when p_patch ? 'core_value' then trim(p_patch->>'core_value') else core_value end,
    first_build_scope = case when p_patch ? 'first_build_scope' then trim(p_patch->>'first_build_scope') else first_build_scope end,
    excluded_scope = case when p_patch ? 'excluded_scope' then nullif(trim(coalesce(p_patch->>'excluded_scope', '')), '') else excluded_scope end,
    implementation_difficulty = case when p_patch ? 'implementation_difficulty' then p_patch->>'implementation_difficulty' else implementation_difficulty end,
    monetization_hint = case when p_patch ? 'monetization_hint' then nullif(trim(coalesce(p_patch->>'monetization_hint', '')), '') else monetization_hint end,
    first_screen_idea = case when p_patch ? 'first_screen_idea' then nullif(trim(coalesce(p_patch->>'first_screen_idea', '')), '') else first_screen_idea end,
    memo = case when p_patch ? 'memo' then nullif(trim(coalesce(p_patch->>'memo', '')), '') else memo end,
    order_index = case when p_patch ? 'order_index' then v_order_index else order_index end
  where id = p_idea_candidate_id
  returning * into v_idea;

  return v_idea;
end;
$$;

create or replace function public.ar_set_idea_candidate_status(
  p_idea_candidate_id uuid,
  p_user_id uuid,
  p_target_status text
)
returns public.ar_idea_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idea public.ar_idea_candidates%rowtype;
  v_from_status text;
begin
  if p_target_status not in ('candidate', 'researching', 'build_soon', 'paused', 'discarded', 'archived') then
    raise exception 'Invalid Idea Candidate target status' using errcode = '22023';
  end if;

  select * into v_idea
  from public.ar_idea_candidates
  where id = p_idea_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Idea Candidate not found' using errcode = 'P0002';
  end if;

  v_from_status := v_idea.status;
  if v_from_status = p_target_status then
    raise exception 'Idea Candidate status transition must change status' using errcode = '23514';
  end if;

  if not (
    (v_from_status = 'candidate' and p_target_status in ('researching', 'build_soon', 'paused', 'discarded', 'archived'))
    or (v_from_status = 'researching' and p_target_status in ('candidate', 'build_soon', 'paused', 'discarded', 'archived'))
    or (v_from_status = 'build_soon' and p_target_status in ('candidate', 'researching', 'paused', 'discarded', 'archived'))
    or (v_from_status = 'paused' and p_target_status in ('candidate', 'researching', 'build_soon', 'discarded', 'archived'))
    or (v_from_status = 'discarded' and p_target_status in ('candidate', 'archived'))
    or (v_from_status = 'archived' and p_target_status in ('candidate', 'researching', 'build_soon', 'paused', 'discarded'))
  ) then
    raise exception 'Invalid Idea Candidate status transition: % -> %', v_from_status, p_target_status
      using errcode = '23514';
  end if;

  update public.ar_idea_candidates
  set status = p_target_status
  where id = p_idea_candidate_id
  returning * into v_idea;

  insert into public.ar_idea_candidate_status_events (
    user_id,
    idea_candidate_id,
    from_status,
    to_status
  ) values (
    p_user_id,
    p_idea_candidate_id,
    v_from_status,
    p_target_status
  );

  return v_idea;
end;
$$;

alter table public.ar_idea_generation_batches enable row level security;
alter table public.ar_idea_candidates enable row level security;
alter table public.ar_idea_candidate_status_events enable row level security;

drop policy if exists ar_users_can_read_own_idea_generation_batches
  on public.ar_idea_generation_batches;
create policy ar_users_can_read_own_idea_generation_batches
  on public.ar_idea_generation_batches
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ar_users_can_read_own_idea_candidates
  on public.ar_idea_candidates;
create policy ar_users_can_read_own_idea_candidates
  on public.ar_idea_candidates
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ar_users_can_read_own_idea_status_events
  on public.ar_idea_candidate_status_events;
create policy ar_users_can_read_own_idea_status_events
  on public.ar_idea_candidate_status_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ar_idea_generation_batches from anon, authenticated, service_role;
revoke all on table public.ar_idea_candidates from anon, authenticated, service_role;
revoke all on table public.ar_idea_candidate_status_events from anon, authenticated, service_role;
grant select on table public.ar_idea_generation_batches to authenticated, service_role;
grant select on table public.ar_idea_candidates to authenticated, service_role;
grant select on table public.ar_idea_candidate_status_events to authenticated, service_role;

revoke all on function public.ar_validate_idea_generation_batch_source() from public, anon, authenticated, service_role;
revoke all on function public.ar_validate_idea_candidate_source() from public, anon, authenticated, service_role;
revoke all on function public.ar_validate_idea_status_event() from public, anon, authenticated, service_role;
revoke all on function public.ar_persist_idea_generation_batch(uuid, uuid, text, text, text, integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_update_idea_candidate(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_set_idea_candidate_status(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.ar_persist_idea_generation_batch(uuid, uuid, text, text, text, integer, integer, jsonb)
  to service_role;
grant execute on function public.ar_update_idea_candidate(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.ar_set_idea_candidate_status(uuid, uuid, text)
  to service_role;
