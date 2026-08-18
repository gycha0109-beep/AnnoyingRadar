-- Phase 15.1H: publication lineage, explicit publication quality gate,
-- and archive-before-substantive-edit enforcement.

create table if not exists public.ar_public_problem_candidate_links (
  id uuid primary key default gen_random_uuid(),
  public_problem_id uuid not null
    references public.ar_public_problems(id)
    on delete cascade,
  problem_candidate_id uuid not null
    references public.ar_problem_candidates(id)
    on delete cascade,
  linked_by_curator_user_id uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),

  constraint ar_public_problem_candidate_links_unique_pair
    unique (public_problem_id, problem_candidate_id)
);

create index if not exists ar_idx_public_problem_candidate_links_problem
  on public.ar_public_problem_candidate_links (public_problem_id, created_at, id);
create index if not exists ar_idx_public_problem_candidate_links_candidate
  on public.ar_public_problem_candidate_links (problem_candidate_id, created_at, id);

alter table public.ar_public_problem_candidate_links enable row level security;

revoke all on table public.ar_public_problem_candidate_links
  from public, anon, authenticated;
grant select on table public.ar_public_problem_candidate_links
  to service_role;

create or replace function public.ar_assert_public_problem_publishable(
  p_problem_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem public.ar_public_problems%rowtype;
  v_evidence_count integer;
  v_distinct_source_count integer;
  v_invalid_basis_count integer;
begin
  if p_problem_id is null then
    raise exception 'public problem id is required' using errcode = '22023';
  end if;

  select * into v_problem
  from public.ar_public_problems
  where id = p_problem_id;
  if not found then
    raise exception 'Public Problem not found' using errcode = 'P0002';
  end if;

  if length(trim(v_problem.title)) < 1 then
    raise exception 'Published Public Problem requires a title' using errcode = '23514';
  end if;
  if length(trim(v_problem.summary)) < 1 then
    raise exception 'Published Public Problem requires a summary' using errcode = '23514';
  end if;

  select
    count(*),
    count(distinct source_key),
    count(*) filter (
      where publication_basis not in ('external_public', 'user_opt_in')
    )
  into
    v_evidence_count,
    v_distinct_source_count,
    v_invalid_basis_count
  from public.ar_public_problem_evidence_snapshots
  where public_problem_id = p_problem_id;

  if v_evidence_count < 2 then
    raise exception 'Published Public Problem requires at least 2 Evidence snapshots'
      using errcode = '23514';
  end if;
  if v_distinct_source_count < 2 then
    raise exception 'Published Public Problem requires at least 2 distinct source_key values'
      using errcode = '23514';
  end if;
  if v_invalid_basis_count > 0 then
    raise exception 'Published Public Problem contains non-publishable Evidence'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.ar_link_public_problem_candidate(
  p_problem_id uuid,
  p_problem_candidate_id uuid,
  p_curator_user_id uuid
)
returns public.ar_public_problem_candidate_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_status text;
  v_candidate_status text;
  v_link public.ar_public_problem_candidate_links%rowtype;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if p_problem_id is null or p_problem_candidate_id is null then
    raise exception 'public problem id and problem candidate id are required'
      using errcode = '22023';
  end if;

  select status into v_problem_status
  from public.ar_public_problems
  where id = p_problem_id
  for update;
  if not found then
    raise exception 'Public Problem not found' using errcode = 'P0002';
  end if;
  if v_problem_status = 'published' then
    raise exception 'Archive a published Public Problem before changing publication lineage'
      using errcode = '23514';
  end if;

  select status into v_candidate_status
  from public.ar_problem_candidates
  where id = p_problem_candidate_id;
  if not found then
    raise exception 'Problem Candidate not found' using errcode = 'P0002';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Only confirmed Problem Cards can be linked to a Public Problem'
      using errcode = '23514';
  end if;

  insert into public.ar_public_problem_candidate_links (
    public_problem_id,
    problem_candidate_id,
    linked_by_curator_user_id
  ) values (
    p_problem_id,
    p_problem_candidate_id,
    p_curator_user_id
  )
  on conflict (public_problem_id, problem_candidate_id) do nothing;

  select * into v_link
  from public.ar_public_problem_candidate_links
  where public_problem_id = p_problem_id
    and problem_candidate_id = p_problem_candidate_id;

  update public.ar_public_problems
  set updated_by_user_id = p_curator_user_id
  where id = p_problem_id;

  return v_link;
end;
$$;

create or replace function public.ar_unlink_public_problem_candidate(
  p_problem_id uuid,
  p_problem_candidate_id uuid,
  p_curator_user_id uuid
)
returns public.ar_public_problem_candidate_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_status text;
  v_link public.ar_public_problem_candidate_links%rowtype;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  select status into v_problem_status
  from public.ar_public_problems
  where id = p_problem_id
  for update;
  if not found then
    raise exception 'Public Problem not found' using errcode = 'P0002';
  end if;
  if v_problem_status = 'published' then
    raise exception 'Archive a published Public Problem before changing publication lineage'
      using errcode = '23514';
  end if;

  delete from public.ar_public_problem_candidate_links
  where public_problem_id = p_problem_id
    and problem_candidate_id = p_problem_candidate_id
  returning * into v_link;

  if not found then
    raise exception 'Public Problem lineage link not found' using errcode = 'P0002';
  end if;

  update public.ar_public_problems
  set updated_by_user_id = p_curator_user_id
  where id = p_problem_id;

  return v_link;
end;
$$;

create or replace function public.ar_update_public_problem_metadata(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_patch jsonb
)
returns public.ar_public_problems
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem public.ar_public_problems%rowtype;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if p_problem_id is null then
    raise exception 'public problem id is required' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a JSON object' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_patch) as k(key)
    where key not in ('title', 'summary', 'target_user', 'situation', 'category')
  ) then
    raise exception 'patch contains unsupported fields' using errcode = '22023';
  end if;

  select * into v_problem
  from public.ar_public_problems
  where id = p_problem_id
  for update;
  if not found then
    raise exception 'Public Problem not found' using errcode = 'P0002';
  end if;
  if v_problem.status = 'published' then
    raise exception 'Archive a published Public Problem before changing metadata'
      using errcode = '23514';
  end if;

  if p_patch ? 'title'
     and length(trim(coalesce(p_patch->>'title', ''))) not between 1 and 240 then
    raise exception 'title must contain 1 to 240 characters' using errcode = '22023';
  end if;
  if p_patch ? 'summary'
     and length(trim(coalesce(p_patch->>'summary', ''))) not between 1 and 4000 then
    raise exception 'summary must contain 1 to 4000 characters' using errcode = '22023';
  end if;
  if p_patch ? 'target_user'
     and length(coalesce(p_patch->>'target_user', '')) > 1000 then
    raise exception 'target_user must be at most 1000 characters' using errcode = '22023';
  end if;
  if p_patch ? 'situation'
     and length(coalesce(p_patch->>'situation', '')) > 2000 then
    raise exception 'situation must be at most 2000 characters' using errcode = '22023';
  end if;
  if p_patch ? 'category'
     and nullif(trim(coalesce(p_patch->>'category', '')), '') is not null
     and length(trim(p_patch->>'category')) not between 1 and 120 then
    raise exception 'category must contain 1 to 120 characters' using errcode = '22023';
  end if;

  update public.ar_public_problems
  set
    title = case when p_patch ? 'title' then trim(p_patch->>'title') else title end,
    summary = case when p_patch ? 'summary' then trim(p_patch->>'summary') else summary end,
    target_user = case
      when p_patch ? 'target_user' then nullif(trim(coalesce(p_patch->>'target_user', '')), '')
      else target_user
    end,
    situation = case
      when p_patch ? 'situation' then nullif(trim(coalesce(p_patch->>'situation', '')), '')
      else situation
    end,
    category = case
      when p_patch ? 'category' then nullif(trim(coalesce(p_patch->>'category', '')), '')
      else category
    end,
    updated_by_user_id = p_curator_user_id
  where id = p_problem_id
  returning * into v_problem;

  return v_problem;
end;
$$;

create or replace function public.ar_set_public_problem_status(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_status text
)
returns public.ar_public_problems
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem public.ar_public_problems%rowtype;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'unsupported Public Problem status' using errcode = '22023';
  end if;

  select * into v_problem
  from public.ar_public_problems
  where id = p_problem_id
  for update;
  if not found then
    raise exception 'Public Problem not found' using errcode = 'P0002';
  end if;

  if p_status = v_problem.status then
    return v_problem;
  end if;

  if not (
    (v_problem.status = 'draft' and p_status in ('published', 'archived'))
    or (v_problem.status = 'published' and p_status = 'archived')
    or (v_problem.status = 'archived' and p_status = 'published')
  ) then
    raise exception 'Invalid Public Problem status transition'
      using errcode = '23514';
  end if;

  if p_status = 'published' then
    perform public.ar_assert_public_problem_publishable(p_problem_id);

    update public.ar_public_problems
    set
      status = 'published',
      published_at = now(),
      archived_at = null,
      updated_by_user_id = p_curator_user_id
    where id = p_problem_id
    returning * into v_problem;
  else
    update public.ar_public_problems
    set
      status = 'archived',
      archived_at = now(),
      updated_by_user_id = p_curator_user_id
    where id = p_problem_id
    returning * into v_problem;
  end if;

  return v_problem;
end;
$$;

revoke all on function public.ar_assert_public_problem_publishable(uuid)
  from public, anon, authenticated;
revoke all on function public.ar_link_public_problem_candidate(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_unlink_public_problem_candidate(uuid, uuid, uuid)
  from public, anon, authenticated;

 grant execute on function public.ar_assert_public_problem_publishable(uuid)
  to service_role;
grant execute on function public.ar_link_public_problem_candidate(uuid, uuid, uuid)
  to service_role;
grant execute on function public.ar_unlink_public_problem_candidate(uuid, uuid, uuid)
  to service_role;
