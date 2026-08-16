-- Phase 8.1: Saved Problem management metadata without changing Problem Card identity.

create table if not exists public.ar_saved_problem_cards (
  problem_candidate_id uuid primary key
    references public.ar_problem_candidates(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  category text,
  memo text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_saved_problem_cards_category_length
    check (category is null or length(category) <= 120),
  constraint ar_saved_problem_cards_memo_length
    check (memo is null or length(memo) <= 4000),
  constraint ar_saved_problem_cards_status_check
    check (status in ('active', 'archived'))
);

create index if not exists ar_idx_saved_problem_cards_user_status_updated
  on public.ar_saved_problem_cards (user_id, status, updated_at desc);
create index if not exists ar_idx_saved_problem_cards_user_updated
  on public.ar_saved_problem_cards (user_id, updated_at desc);

create trigger ar_trg_saved_problem_cards_updated_at
before update on public.ar_saved_problem_cards
for each row execute function public.ar_set_updated_at();

create or replace function public.ar_validate_saved_problem_source()
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
    raise exception 'Problem Card not found' using errcode = '23503';
  end if;
  if v_candidate_user_id <> new.user_id then
    raise exception 'Saved Problem user_id must match Problem Card owner'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Saved Problem requires a confirmed Problem Card'
      using errcode = '23514';
  end if;
  if v_raw_status <> 'completed' then
    raise exception 'Saved Problem requires a completed source analysis'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ar_trg_validate_saved_problem_source
before insert or update of user_id, problem_candidate_id
on public.ar_saved_problem_cards
for each row execute function public.ar_validate_saved_problem_source();

create or replace function public.ar_save_problem_card(
  p_problem_candidate_id uuid,
  p_user_id uuid
)
returns public.ar_saved_problem_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.ar_problem_candidates%rowtype;
  v_raw_status text;
  v_saved public.ar_saved_problem_cards%rowtype;
begin
  select * into v_candidate
  from public.ar_problem_candidates
  where id = p_problem_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Problem Card not found' using errcode = 'P0002';
  end if;
  if v_candidate.status <> 'confirmed' then
    raise exception 'Saved Problem requires a confirmed Problem Card'
      using errcode = '23514';
  end if;

  select analysis_status into v_raw_status
  from public.ar_raw_inputs
  where id = v_candidate.raw_input_id and user_id = p_user_id
  for update;
  if v_raw_status <> 'completed' then
    raise exception 'Saved Problem requires a completed source analysis'
      using errcode = '23514';
  end if;

  select * into v_saved
  from public.ar_saved_problem_cards
  where problem_candidate_id = p_problem_candidate_id and user_id = p_user_id
  for update;
  if found then
    return v_saved;
  end if;

  insert into public.ar_saved_problem_cards (
    problem_candidate_id,
    user_id,
    status
  ) values (
    p_problem_candidate_id,
    p_user_id,
    'active'
  )
  returning * into v_saved;

  return v_saved;
end;
$$;

create or replace function public.ar_update_saved_problem_metadata(
  p_problem_candidate_id uuid,
  p_user_id uuid,
  p_patch jsonb
)
returns public.ar_saved_problem_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.ar_saved_problem_cards%rowtype;
  v_unknown_keys text[];
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Saved Problem patch must be a non-empty object' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_unknown_keys
  from jsonb_object_keys(p_patch) as keys(key)
  where key not in ('category', 'memo');
  if v_unknown_keys is not null then
    raise exception 'Unsupported Saved Problem fields: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  if p_patch ? 'category' and (
    p_patch->'category' <> 'null'::jsonb and jsonb_typeof(p_patch->'category') <> 'string'
    or length(coalesce(p_patch->>'category', '')) > 120
  ) then
    raise exception 'category must be a string or null with at most 120 characters'
      using errcode = '22023';
  end if;

  if p_patch ? 'memo' and (
    p_patch->'memo' <> 'null'::jsonb and jsonb_typeof(p_patch->'memo') <> 'string'
    or length(coalesce(p_patch->>'memo', '')) > 4000
  ) then
    raise exception 'memo must be a string or null with at most 4000 characters'
      using errcode = '22023';
  end if;

  select * into v_saved
  from public.ar_saved_problem_cards
  where problem_candidate_id = p_problem_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Saved Problem not found' using errcode = 'P0002';
  end if;

  update public.ar_saved_problem_cards
  set
    category = case
      when p_patch ? 'category' then nullif(trim(coalesce(p_patch->>'category', '')), '')
      else category
    end,
    memo = case
      when p_patch ? 'memo' then nullif(trim(coalesce(p_patch->>'memo', '')), '')
      else memo
    end
  where problem_candidate_id = p_problem_candidate_id and user_id = p_user_id
  returning * into v_saved;

  return v_saved;
end;
$$;

create or replace function public.ar_set_saved_problem_status(
  p_problem_candidate_id uuid,
  p_user_id uuid,
  p_target_status text
)
returns public.ar_saved_problem_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.ar_saved_problem_cards%rowtype;
begin
  if p_target_status not in ('active', 'archived') then
    raise exception 'Invalid Saved Problem target status' using errcode = '22023';
  end if;

  select * into v_saved
  from public.ar_saved_problem_cards
  where problem_candidate_id = p_problem_candidate_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Saved Problem not found' using errcode = 'P0002';
  end if;
  if v_saved.status = p_target_status then
    raise exception 'Saved Problem status transition must change status'
      using errcode = '23514';
  end if;

  update public.ar_saved_problem_cards
  set status = p_target_status
  where problem_candidate_id = p_problem_candidate_id and user_id = p_user_id
  returning * into v_saved;

  return v_saved;
end;
$$;

alter table public.ar_saved_problem_cards enable row level security;

drop policy if exists ar_users_can_read_own_saved_problem_cards
  on public.ar_saved_problem_cards;
create policy ar_users_can_read_own_saved_problem_cards
  on public.ar_saved_problem_cards
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ar_saved_problem_cards from anon, authenticated, service_role;
grant select on table public.ar_saved_problem_cards to authenticated, service_role;

revoke all on function public.ar_validate_saved_problem_source()
  from public, anon, authenticated, service_role;
revoke all on function public.ar_save_problem_card(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_update_saved_problem_metadata(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_set_saved_problem_status(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.ar_save_problem_card(uuid, uuid)
  to service_role;
grant execute on function public.ar_update_saved_problem_metadata(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.ar_set_saved_problem_status(uuid, uuid, text)
  to service_role;
