-- Phase 9.1: Research Project grouping layer for Saved Problems and Idea Candidates.

create table if not exists public.ar_research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  title text not null,
  purpose text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_research_projects_title_length
    check (length(trim(title)) between 1 and 200),
  constraint ar_research_projects_purpose_length
    check (purpose is null or length(purpose) <= 4000),
  constraint ar_research_projects_status_check
    check (status in ('active', 'archived'))
);

create table if not exists public.ar_research_project_problem_links (
  project_id uuid not null
    references public.ar_research_projects(id)
    on delete cascade,
  problem_candidate_id uuid not null
    references public.ar_saved_problem_cards(problem_candidate_id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  created_at timestamptz not null default now(),

  primary key (project_id, problem_candidate_id)
);

create table if not exists public.ar_research_project_idea_links (
  project_id uuid not null
    references public.ar_research_projects(id)
    on delete cascade,
  idea_candidate_id uuid not null
    references public.ar_idea_candidates(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  created_at timestamptz not null default now(),

  primary key (project_id, idea_candidate_id)
);

create index if not exists ar_idx_research_projects_user_status_updated
  on public.ar_research_projects (user_id, status, updated_at desc);
create index if not exists ar_idx_research_projects_user_updated
  on public.ar_research_projects (user_id, updated_at desc);
create index if not exists ar_idx_research_project_problem_links_user_problem
  on public.ar_research_project_problem_links (user_id, problem_candidate_id);
create index if not exists ar_idx_research_project_idea_links_user_idea
  on public.ar_research_project_idea_links (user_id, idea_candidate_id);

create trigger ar_trg_research_projects_updated_at
before update on public.ar_research_projects
for each row execute function public.ar_set_updated_at();

create or replace function public.ar_validate_research_project_problem_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_user_id uuid;
  v_project_status text;
  v_saved_user_id uuid;
  v_saved_status text;
  v_candidate_user_id uuid;
  v_candidate_status text;
  v_raw_status text;
begin
  select user_id, status
    into v_project_user_id, v_project_status
  from public.ar_research_projects
  where id = new.project_id;

  if v_project_user_id is null then
    raise exception 'Research Project not found' using errcode = '23503';
  end if;
  if v_project_user_id <> new.user_id then
    raise exception 'Research Project Problem link user_id must match Project owner'
      using errcode = '23514';
  end if;
  if v_project_status <> 'active' then
    raise exception 'Research Project must be active before linking a Problem Card'
      using errcode = '23514';
  end if;

  select user_id, status
    into v_saved_user_id, v_saved_status
  from public.ar_saved_problem_cards
  where problem_candidate_id = new.problem_candidate_id;

  if v_saved_user_id is null then
    raise exception 'Saved Problem not found' using errcode = '23503';
  end if;
  if v_saved_user_id <> new.user_id then
    raise exception 'Research Project Problem link user_id must match Saved Problem owner'
      using errcode = '23514';
  end if;
  if v_saved_status <> 'active' then
    raise exception 'Only an active Saved Problem can be newly linked to a Research Project'
      using errcode = '23514';
  end if;

  select c.user_id, c.status, r.analysis_status
    into v_candidate_user_id, v_candidate_status, v_raw_status
  from public.ar_problem_candidates c
  join public.ar_raw_inputs r on r.id = c.raw_input_id
  where c.id = new.problem_candidate_id;

  if v_candidate_user_id is null then
    raise exception 'Problem Card not found' using errcode = '23503';
  end if;
  if v_candidate_user_id <> new.user_id then
    raise exception 'Research Project Problem link user_id must match Problem Card owner'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Research Project Problem link requires a confirmed Problem Card'
      using errcode = '23514';
  end if;
  if v_raw_status <> 'completed' then
    raise exception 'Research Project Problem link requires a completed source analysis'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ar_trg_validate_research_project_problem_link
before insert or update of project_id, problem_candidate_id, user_id
on public.ar_research_project_problem_links
for each row execute function public.ar_validate_research_project_problem_link();

create or replace function public.ar_validate_research_project_idea_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_user_id uuid;
  v_project_status text;
  v_idea_user_id uuid;
begin
  select user_id, status
    into v_project_user_id, v_project_status
  from public.ar_research_projects
  where id = new.project_id;

  if v_project_user_id is null then
    raise exception 'Research Project not found' using errcode = '23503';
  end if;
  if v_project_user_id <> new.user_id then
    raise exception 'Research Project Idea link user_id must match Project owner'
      using errcode = '23514';
  end if;
  if v_project_status <> 'active' then
    raise exception 'Research Project must be active before linking an Idea Candidate'
      using errcode = '23514';
  end if;

  select user_id
    into v_idea_user_id
  from public.ar_idea_candidates
  where id = new.idea_candidate_id;

  if v_idea_user_id is null then
    raise exception 'Idea Candidate not found' using errcode = '23503';
  end if;
  if v_idea_user_id <> new.user_id then
    raise exception 'Research Project Idea link user_id must match Idea Candidate owner'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ar_trg_validate_research_project_idea_link
before insert or update of project_id, idea_candidate_id, user_id
on public.ar_research_project_idea_links
for each row execute function public.ar_validate_research_project_idea_link();

create or replace function public.ar_create_research_project(
  p_user_id uuid,
  p_title text,
  p_purpose text
)
returns public.ar_research_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.ar_research_projects%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception 'title must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_purpose, '')) > 4000 then
    raise exception 'purpose must be at most 4000 characters' using errcode = '22023';
  end if;

  insert into public.ar_research_projects (
    user_id,
    title,
    purpose,
    status
  ) values (
    p_user_id,
    trim(p_title),
    nullif(trim(coalesce(p_purpose, '')), ''),
    'active'
  )
  returning * into v_project;

  return v_project;
end;
$$;

create or replace function public.ar_create_research_project_with_problem(
  p_user_id uuid,
  p_title text,
  p_purpose text,
  p_problem_candidate_id uuid
)
returns public.ar_research_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.ar_research_projects%rowtype;
  v_saved_user_id uuid;
  v_saved_status text;
  v_candidate_user_id uuid;
  v_candidate_status text;
  v_raw_status text;
begin
  if p_user_id is null or p_problem_candidate_id is null then
    raise exception 'user_id and Problem Card are required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception 'title must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_purpose, '')) > 4000 then
    raise exception 'purpose must be at most 4000 characters' using errcode = '22023';
  end if;

  select s.user_id, s.status, c.user_id, c.status, r.analysis_status
    into v_saved_user_id, v_saved_status, v_candidate_user_id, v_candidate_status, v_raw_status
  from public.ar_saved_problem_cards s
  join public.ar_problem_candidates c on c.id = s.problem_candidate_id
  join public.ar_raw_inputs r on r.id = c.raw_input_id
  where s.problem_candidate_id = p_problem_candidate_id
  for update of s, c, r;

  if v_saved_user_id is null then
    raise exception 'Saved Problem not found' using errcode = 'P0002';
  end if;
  if v_saved_user_id <> p_user_id or v_candidate_user_id <> p_user_id then
    raise exception 'Saved Problem and Problem Card owner must match Research Project owner'
      using errcode = '23514';
  end if;
  if v_saved_status <> 'active' then
    raise exception 'Only an active Saved Problem can seed a Research Project'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Research Project Problem link requires a confirmed Problem Card'
      using errcode = '23514';
  end if;
  if v_raw_status <> 'completed' then
    raise exception 'Research Project Problem link requires a completed source analysis'
      using errcode = '23514';
  end if;

  insert into public.ar_research_projects (
    user_id,
    title,
    purpose,
    status
  ) values (
    p_user_id,
    trim(p_title),
    nullif(trim(coalesce(p_purpose, '')), ''),
    'active'
  )
  returning * into v_project;

  insert into public.ar_research_project_problem_links (
    project_id,
    problem_candidate_id,
    user_id
  ) values (
    v_project.id,
    p_problem_candidate_id,
    p_user_id
  );

  return v_project;
end;
$$;

create or replace function public.ar_update_research_project_metadata(
  p_project_id uuid,
  p_user_id uuid,
  p_patch jsonb
)
returns public.ar_research_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.ar_research_projects%rowtype;
  v_unknown_keys text[];
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Research Project patch must be a non-empty object' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_unknown_keys
  from jsonb_object_keys(p_patch) as keys(key)
  where key not in ('title', 'purpose');
  if v_unknown_keys is not null then
    raise exception 'Unsupported Research Project fields: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  if p_patch ? 'title' and (
    jsonb_typeof(p_patch->'title') <> 'string'
    or length(trim(coalesce(p_patch->>'title', ''))) not between 1 and 200
  ) then
    raise exception 'title must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if p_patch ? 'purpose' and (
    p_patch->'purpose' <> 'null'::jsonb and jsonb_typeof(p_patch->'purpose') <> 'string'
    or length(coalesce(p_patch->>'purpose', '')) > 4000
  ) then
    raise exception 'purpose must be a string or null with at most 4000 characters'
      using errcode = '22023';
  end if;

  select * into v_project
  from public.ar_research_projects
  where id = p_project_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Research Project not found' using errcode = 'P0002';
  end if;
  if v_project.status <> 'active' then
    raise exception 'Archived Research Project must be restored before editing'
      using errcode = '23514';
  end if;

  update public.ar_research_projects
  set
    title = case when p_patch ? 'title' then trim(p_patch->>'title') else title end,
    purpose = case
      when p_patch ? 'purpose' then nullif(trim(coalesce(p_patch->>'purpose', '')), '')
      else purpose
    end
  where id = p_project_id and user_id = p_user_id
  returning * into v_project;

  return v_project;
end;
$$;

create or replace function public.ar_set_research_project_status(
  p_project_id uuid,
  p_user_id uuid,
  p_target_status text
)
returns public.ar_research_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.ar_research_projects%rowtype;
begin
  if p_target_status not in ('active', 'archived') then
    raise exception 'Invalid Research Project target status' using errcode = '22023';
  end if;

  select * into v_project
  from public.ar_research_projects
  where id = p_project_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Research Project not found' using errcode = 'P0002';
  end if;
  if v_project.status = p_target_status then
    raise exception 'Research Project status transition must change status'
      using errcode = '23514';
  end if;

  update public.ar_research_projects
  set status = p_target_status
  where id = p_project_id and user_id = p_user_id
  returning * into v_project;

  return v_project;
end;
$$;

create or replace function public.ar_link_research_project_problem(
  p_project_id uuid,
  p_problem_candidate_id uuid,
  p_user_id uuid
)
returns public.ar_research_project_problem_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_status text;
  v_saved_user_id uuid;
  v_saved_status text;
  v_candidate_user_id uuid;
  v_candidate_status text;
  v_raw_status text;
  v_link public.ar_research_project_problem_links%rowtype;
begin
  select status into v_project_status
  from public.ar_research_projects
  where id = p_project_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Research Project not found' using errcode = 'P0002';
  end if;
  if v_project_status <> 'active' then
    raise exception 'Research Project must be active before linking a Problem Card'
      using errcode = '23514';
  end if;

  select s.user_id, s.status, c.user_id, c.status, r.analysis_status
    into v_saved_user_id, v_saved_status, v_candidate_user_id, v_candidate_status, v_raw_status
  from public.ar_saved_problem_cards s
  join public.ar_problem_candidates c on c.id = s.problem_candidate_id
  join public.ar_raw_inputs r on r.id = c.raw_input_id
  where s.problem_candidate_id = p_problem_candidate_id
  for update of s, c, r;

  if v_saved_user_id is null then
    raise exception 'Saved Problem not found' using errcode = 'P0002';
  end if;
  if v_saved_user_id <> p_user_id or v_candidate_user_id <> p_user_id then
    raise exception 'Saved Problem and Problem Card owner must match Research Project owner'
      using errcode = '23514';
  end if;
  if v_saved_status <> 'active' then
    raise exception 'Only an active Saved Problem can be newly linked to a Research Project'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Research Project Problem link requires a confirmed Problem Card'
      using errcode = '23514';
  end if;
  if v_raw_status <> 'completed' then
    raise exception 'Research Project Problem link requires a completed source analysis'
      using errcode = '23514';
  end if;

  select * into v_link
  from public.ar_research_project_problem_links
  where project_id = p_project_id
    and problem_candidate_id = p_problem_candidate_id
    and user_id = p_user_id;
  if found then
    return v_link;
  end if;

  insert into public.ar_research_project_problem_links (
    project_id,
    problem_candidate_id,
    user_id
  ) values (
    p_project_id,
    p_problem_candidate_id,
    p_user_id
  )
  returning * into v_link;

  update public.ar_research_projects
  set updated_at = now()
  where id = p_project_id and user_id = p_user_id;

  return v_link;
end;
$$;

create or replace function public.ar_unlink_research_project_problem(
  p_project_id uuid,
  p_problem_candidate_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_status text;
begin
  select status into v_project_status
  from public.ar_research_projects
  where id = p_project_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Research Project not found' using errcode = 'P0002';
  end if;
  if v_project_status <> 'active' then
    raise exception 'Archived Research Project must be restored before changing links'
      using errcode = '23514';
  end if;

  delete from public.ar_research_project_problem_links
  where project_id = p_project_id
    and problem_candidate_id = p_problem_candidate_id
    and user_id = p_user_id;
  if not found then
    raise exception 'Research Project Problem link not found' using errcode = 'P0002';
  end if;

  update public.ar_research_projects
  set updated_at = now()
  where id = p_project_id and user_id = p_user_id;

  return true;
end;
$$;

create or replace function public.ar_link_research_project_idea(
  p_project_id uuid,
  p_idea_candidate_id uuid,
  p_user_id uuid
)
returns public.ar_research_project_idea_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_status text;
  v_idea_user_id uuid;
  v_link public.ar_research_project_idea_links%rowtype;
begin
  select status into v_project_status
  from public.ar_research_projects
  where id = p_project_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Research Project not found' using errcode = 'P0002';
  end if;
  if v_project_status <> 'active' then
    raise exception 'Research Project must be active before linking an Idea Candidate'
      using errcode = '23514';
  end if;

  select user_id into v_idea_user_id
  from public.ar_idea_candidates
  where id = p_idea_candidate_id
  for update;
  if not found then
    raise exception 'Idea Candidate not found' using errcode = 'P0002';
  end if;
  if v_idea_user_id <> p_user_id then
    raise exception 'Idea Candidate owner must match Research Project owner'
      using errcode = '23514';
  end if;

  select * into v_link
  from public.ar_research_project_idea_links
  where project_id = p_project_id
    and idea_candidate_id = p_idea_candidate_id
    and user_id = p_user_id;
  if found then
    return v_link;
  end if;

  insert into public.ar_research_project_idea_links (
    project_id,
    idea_candidate_id,
    user_id
  ) values (
    p_project_id,
    p_idea_candidate_id,
    p_user_id
  )
  returning * into v_link;

  update public.ar_research_projects
  set updated_at = now()
  where id = p_project_id and user_id = p_user_id;

  return v_link;
end;
$$;

create or replace function public.ar_unlink_research_project_idea(
  p_project_id uuid,
  p_idea_candidate_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_status text;
begin
  select status into v_project_status
  from public.ar_research_projects
  where id = p_project_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Research Project not found' using errcode = 'P0002';
  end if;
  if v_project_status <> 'active' then
    raise exception 'Archived Research Project must be restored before changing links'
      using errcode = '23514';
  end if;

  delete from public.ar_research_project_idea_links
  where project_id = p_project_id
    and idea_candidate_id = p_idea_candidate_id
    and user_id = p_user_id;
  if not found then
    raise exception 'Research Project Idea link not found' using errcode = 'P0002';
  end if;

  update public.ar_research_projects
  set updated_at = now()
  where id = p_project_id and user_id = p_user_id;

  return true;
end;
$$;

alter table public.ar_research_projects enable row level security;
alter table public.ar_research_project_problem_links enable row level security;
alter table public.ar_research_project_idea_links enable row level security;

drop policy if exists ar_users_can_read_own_research_projects
  on public.ar_research_projects;
create policy ar_users_can_read_own_research_projects
  on public.ar_research_projects
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ar_users_can_read_own_research_project_problem_links
  on public.ar_research_project_problem_links;
create policy ar_users_can_read_own_research_project_problem_links
  on public.ar_research_project_problem_links
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ar_users_can_read_own_research_project_idea_links
  on public.ar_research_project_idea_links;
create policy ar_users_can_read_own_research_project_idea_links
  on public.ar_research_project_idea_links
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ar_research_projects from anon, authenticated, service_role;
revoke all on table public.ar_research_project_problem_links from anon, authenticated, service_role;
revoke all on table public.ar_research_project_idea_links from anon, authenticated, service_role;
grant select on table public.ar_research_projects to authenticated, service_role;
grant select on table public.ar_research_project_problem_links to authenticated, service_role;
grant select on table public.ar_research_project_idea_links to authenticated, service_role;

revoke all on function public.ar_validate_research_project_problem_link()
  from public, anon, authenticated, service_role;
revoke all on function public.ar_validate_research_project_idea_link()
  from public, anon, authenticated, service_role;
revoke all on function public.ar_create_research_project(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.ar_create_research_project_with_problem(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_update_research_project_metadata(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_set_research_project_status(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.ar_link_research_project_problem(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_unlink_research_project_problem(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_link_research_project_idea(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_unlink_research_project_idea(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.ar_create_research_project(uuid, text, text)
  to service_role;
grant execute on function public.ar_create_research_project_with_problem(uuid, text, text, uuid)
  to service_role;
grant execute on function public.ar_update_research_project_metadata(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.ar_set_research_project_status(uuid, uuid, text)
  to service_role;
grant execute on function public.ar_link_research_project_problem(uuid, uuid, uuid)
  to service_role;
grant execute on function public.ar_unlink_research_project_problem(uuid, uuid, uuid)
  to service_role;
grant execute on function public.ar_link_research_project_idea(uuid, uuid, uuid)
  to service_role;
grant execute on function public.ar_unlink_research_project_idea(uuid, uuid, uuid)
  to service_role;
