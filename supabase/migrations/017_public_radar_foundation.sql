-- Phase 15.1: Public Radar canonical Problem and public-safe Evidence publication layer.

create table if not exists public.ar_radar_curators (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,
  role text not null default 'editor',
  created_at timestamptz not null default now(),

  constraint ar_radar_curators_role_check
    check (role in ('owner', 'editor'))
);

create table if not exists public.ar_public_problems (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  target_user text,
  situation text,
  category text,
  status text not null default 'draft',
  created_by_user_id uuid
    references auth.users(id)
    on delete set null,
  updated_by_user_id uuid
    references auth.users(id)
    on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (
    lower(
      title || ' ' || summary || ' '
      || coalesce(target_user, '') || ' '
      || coalesce(situation, '') || ' '
      || coalesce(category, '')
    )
  ) stored,

  constraint ar_public_problems_title_length
    check (length(trim(title)) between 1 and 240),
  constraint ar_public_problems_summary_length
    check (length(trim(summary)) between 1 and 4000),
  constraint ar_public_problems_target_user_length
    check (target_user is null or length(target_user) <= 1000),
  constraint ar_public_problems_situation_length
    check (situation is null or length(situation) <= 2000),
  constraint ar_public_problems_category_length
    check (category is null or length(trim(category)) between 1 and 120),
  constraint ar_public_problems_status_check
    check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.ar_public_problem_evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  public_problem_id uuid not null
    references public.ar_public_problems(id)
    on delete cascade,
  excerpt text not null,
  publication_basis text not null,
  source_type text,
  source_label text,
  source_url text,
  source_key text not null,
  source_observed_at timestamptz,
  order_index integer,
  created_by_user_id uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_public_problem_evidence_excerpt_length
    check (length(trim(excerpt)) between 1 and 600),
  constraint ar_public_problem_evidence_basis_check
    check (publication_basis in ('external_public', 'user_opt_in')),
  constraint ar_public_problem_evidence_source_type_length
    check (source_type is null or length(source_type) <= 120),
  constraint ar_public_problem_evidence_source_label_length
    check (source_label is null or length(source_label) <= 240),
  constraint ar_public_problem_evidence_source_url_length
    check (source_url is null or length(source_url) <= 2000),
  constraint ar_public_problem_evidence_source_key_length
    check (length(trim(source_key)) between 1 and 500),
  constraint ar_public_problem_evidence_order_index_check
    check (order_index is null or order_index >= 0),
  constraint ar_public_problem_evidence_unique_source_excerpt
    unique (public_problem_id, source_key, excerpt)
);

create index if not exists ar_idx_public_problems_status_published
  on public.ar_public_problems (status, published_at desc nulls last, id);
create index if not exists ar_idx_public_problems_category_status
  on public.ar_public_problems (category, status, published_at desc nulls last);
create index if not exists ar_idx_public_problem_evidence_problem_order
  on public.ar_public_problem_evidence_snapshots
  (public_problem_id, order_index asc nulls last, created_at asc);
create index if not exists ar_idx_public_problem_evidence_source_key
  on public.ar_public_problem_evidence_snapshots (source_key);

create trigger ar_trg_public_problems_updated_at
before update on public.ar_public_problems
for each row execute function public.ar_set_updated_at();

create trigger ar_trg_public_problem_evidence_updated_at
before update on public.ar_public_problem_evidence_snapshots
for each row execute function public.ar_set_updated_at();

create or replace function public.ar_require_radar_curator(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_user_id is null then
    raise exception 'curator user_id is required' using errcode = '22023';
  end if;

  select role into v_role
  from public.ar_radar_curators
  where user_id = p_user_id;

  if v_role is null then
    raise exception 'Radar curator permission is required' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

create or replace function public.ar_bootstrap_radar_owner(p_user_id uuid)
returns public.ar_radar_curators
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curator public.ar_radar_curators%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Auth user not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.ar_radar_curators) then
    raise exception 'Radar owner is already bootstrapped' using errcode = '23514';
  end if;

  insert into public.ar_radar_curators (user_id, role)
  values (p_user_id, 'owner')
  returning * into v_curator;

  return v_curator;
end;
$$;

create or replace function public.ar_create_public_problem(
  p_curator_user_id uuid,
  p_title text,
  p_summary text,
  p_target_user text default null,
  p_situation text default null,
  p_category text default null
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

  if length(trim(coalesce(p_title, ''))) not between 1 and 240 then
    raise exception 'title must contain 1 to 240 characters' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_summary, ''))) not between 1 and 4000 then
    raise exception 'summary must contain 1 to 4000 characters' using errcode = '22023';
  end if;
  if p_target_user is not null and length(p_target_user) > 1000 then
    raise exception 'target_user must be at most 1000 characters' using errcode = '22023';
  end if;
  if p_situation is not null and length(p_situation) > 2000 then
    raise exception 'situation must be at most 2000 characters' using errcode = '22023';
  end if;
  if p_category is not null and length(trim(p_category)) not between 1 and 120 then
    raise exception 'category must contain 1 to 120 characters' using errcode = '22023';
  end if;

  insert into public.ar_public_problems (
    title,
    summary,
    target_user,
    situation,
    category,
    status,
    created_by_user_id,
    updated_by_user_id
  ) values (
    trim(p_title),
    trim(p_summary),
    nullif(trim(coalesce(p_target_user, '')), ''),
    nullif(trim(coalesce(p_situation, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    'draft',
    p_curator_user_id,
    p_curator_user_id
  )
  returning * into v_problem;

  return v_problem;
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

create or replace function public.ar_add_public_problem_evidence(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_excerpt text,
  p_publication_basis text,
  p_source_type text default null,
  p_source_label text default null,
  p_source_url text default null,
  p_source_key text default null,
  p_source_observed_at timestamptz default null,
  p_order_index integer default null
)
returns public.ar_public_problem_evidence_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_status text;
  v_snapshot public.ar_public_problem_evidence_snapshots%rowtype;
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
    raise exception 'Archive a published Public Problem before changing Evidence'
      using errcode = '23514';
  end if;

  if length(trim(coalesce(p_excerpt, ''))) not between 1 and 600 then
    raise exception 'excerpt must contain 1 to 600 characters' using errcode = '22023';
  end if;
  if p_publication_basis not in ('external_public', 'user_opt_in') then
    raise exception 'unsupported publication basis' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_source_key, ''))) not between 1 and 500 then
    raise exception 'source_key must contain 1 to 500 characters' using errcode = '22023';
  end if;
  if p_source_type is not null and length(p_source_type) > 120 then
    raise exception 'source_type must be at most 120 characters' using errcode = '22023';
  end if;
  if p_source_label is not null and length(p_source_label) > 240 then
    raise exception 'source_label must be at most 240 characters' using errcode = '22023';
  end if;
  if p_source_url is not null and length(p_source_url) > 2000 then
    raise exception 'source_url must be at most 2000 characters' using errcode = '22023';
  end if;
  if p_order_index is not null and p_order_index < 0 then
    raise exception 'order_index must be non-negative' using errcode = '22023';
  end if;

  insert into public.ar_public_problem_evidence_snapshots (
    public_problem_id,
    excerpt,
    publication_basis,
    source_type,
    source_label,
    source_url,
    source_key,
    source_observed_at,
    order_index,
    created_by_user_id
  ) values (
    p_problem_id,
    trim(p_excerpt),
    p_publication_basis,
    nullif(trim(coalesce(p_source_type, '')), ''),
    nullif(trim(coalesce(p_source_label, '')), ''),
    nullif(trim(coalesce(p_source_url, '')), ''),
    trim(p_source_key),
    p_source_observed_at,
    p_order_index,
    p_curator_user_id
  )
  returning * into v_snapshot;

  update public.ar_public_problems
  set updated_by_user_id = p_curator_user_id
  where id = p_problem_id;

  return v_snapshot;
end;
$$;

create or replace function public.ar_update_public_problem_evidence(
  p_problem_id uuid,
  p_evidence_id uuid,
  p_curator_user_id uuid,
  p_patch jsonb
)
returns public.ar_public_problem_evidence_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_status text;
  v_snapshot public.ar_public_problem_evidence_snapshots%rowtype;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a JSON object' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_patch) as k(key)
    where key not in (
      'excerpt',
      'publication_basis',
      'source_type',
      'source_label',
      'source_url',
      'source_key',
      'source_observed_at',
      'order_index'
    )
  ) then
    raise exception 'patch contains unsupported fields' using errcode = '22023';
  end if;

  select status into v_problem_status
  from public.ar_public_problems
  where id = p_problem_id
  for update;
  if not found then
    raise exception 'Public Problem not found' using errcode = 'P0002';
  end if;
  if v_problem_status = 'published' then
    raise exception 'Archive a published Public Problem before changing Evidence'
      using errcode = '23514';
  end if;

  select * into v_snapshot
  from public.ar_public_problem_evidence_snapshots
  where id = p_evidence_id and public_problem_id = p_problem_id
  for update;
  if not found then
    raise exception 'Public Evidence snapshot not found' using errcode = 'P0002';
  end if;

  if p_patch ? 'excerpt'
     and length(trim(coalesce(p_patch->>'excerpt', ''))) not between 1 and 600 then
    raise exception 'excerpt must contain 1 to 600 characters' using errcode = '22023';
  end if;
  if p_patch ? 'publication_basis'
     and (p_patch->>'publication_basis') not in ('external_public', 'user_opt_in') then
    raise exception 'unsupported publication basis' using errcode = '22023';
  end if;
  if p_patch ? 'source_key'
     and length(trim(coalesce(p_patch->>'source_key', ''))) not between 1 and 500 then
    raise exception 'source_key must contain 1 to 500 characters' using errcode = '22023';
  end if;

  update public.ar_public_problem_evidence_snapshots
  set
    excerpt = case when p_patch ? 'excerpt' then trim(p_patch->>'excerpt') else excerpt end,
    publication_basis = case
      when p_patch ? 'publication_basis' then p_patch->>'publication_basis'
      else publication_basis
    end,
    source_type = case
      when p_patch ? 'source_type' then nullif(trim(coalesce(p_patch->>'source_type', '')), '')
      else source_type
    end,
    source_label = case
      when p_patch ? 'source_label' then nullif(trim(coalesce(p_patch->>'source_label', '')), '')
      else source_label
    end,
    source_url = case
      when p_patch ? 'source_url' then nullif(trim(coalesce(p_patch->>'source_url', '')), '')
      else source_url
    end,
    source_key = case when p_patch ? 'source_key' then trim(p_patch->>'source_key') else source_key end,
    source_observed_at = case
      when p_patch ? 'source_observed_at'
        then nullif(trim(coalesce(p_patch->>'source_observed_at', '')), '')::timestamptz
      else source_observed_at
    end,
    order_index = case
      when p_patch ? 'order_index'
        then nullif(trim(coalesce(p_patch->>'order_index', '')), '')::integer
      else order_index
    end
  where id = p_evidence_id and public_problem_id = p_problem_id
  returning * into v_snapshot;

  update public.ar_public_problems
  set updated_by_user_id = p_curator_user_id
  where id = p_problem_id;

  return v_snapshot;
end;
$$;

create or replace function public.ar_remove_public_problem_evidence(
  p_problem_id uuid,
  p_evidence_id uuid,
  p_curator_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_status text;
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
    raise exception 'Archive a published Public Problem before changing Evidence'
      using errcode = '23514';
  end if;

  delete from public.ar_public_problem_evidence_snapshots
  where id = p_evidence_id and public_problem_id = p_problem_id;
  if not found then
    raise exception 'Public Evidence snapshot not found' using errcode = 'P0002';
  end if;

  update public.ar_public_problems
  set updated_by_user_id = p_curator_user_id
  where id = p_problem_id;

  return true;
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
  v_evidence_count integer;
  v_distinct_source_count integer;
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
    select count(*), count(distinct source_key)
      into v_evidence_count, v_distinct_source_count
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

alter table public.ar_radar_curators enable row level security;
alter table public.ar_public_problems enable row level security;
alter table public.ar_public_problem_evidence_snapshots enable row level security;

drop policy if exists ar_public_can_read_published_problems
  on public.ar_public_problems;
create policy ar_public_can_read_published_problems
  on public.ar_public_problems
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists ar_public_can_read_published_problem_evidence
  on public.ar_public_problem_evidence_snapshots;
create policy ar_public_can_read_published_problem_evidence
  on public.ar_public_problem_evidence_snapshots
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.ar_public_problems p
      where p.id = ar_public_problem_evidence_snapshots.public_problem_id
        and p.status = 'published'
    )
  );

revoke all on table public.ar_radar_curators from anon, authenticated, service_role;
revoke all on table public.ar_public_problems from anon, authenticated, service_role;
revoke all on table public.ar_public_problem_evidence_snapshots from anon, authenticated, service_role;

grant select on table public.ar_radar_curators to service_role;
grant select on table public.ar_public_problems to anon, authenticated, service_role;
grant select on table public.ar_public_problem_evidence_snapshots to anon, authenticated, service_role;

revoke all on function public.ar_require_radar_curator(uuid)
  from public, anon, authenticated;
revoke all on function public.ar_bootstrap_radar_owner(uuid)
  from public, anon, authenticated;
revoke all on function public.ar_create_public_problem(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.ar_update_public_problem_metadata(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_add_public_problem_evidence(uuid, uuid, text, text, text, text, text, text, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.ar_update_public_problem_evidence(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_remove_public_problem_evidence(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ar_set_public_problem_status(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.ar_require_radar_curator(uuid)
  to service_role;
grant execute on function public.ar_bootstrap_radar_owner(uuid)
  to service_role;
grant execute on function public.ar_create_public_problem(uuid, text, text, text, text, text)
  to service_role;
grant execute on function public.ar_update_public_problem_metadata(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.ar_add_public_problem_evidence(uuid, uuid, text, text, text, text, text, text, timestamptz, integer)
  to service_role;
grant execute on function public.ar_update_public_problem_evidence(uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.ar_remove_public_problem_evidence(uuid, uuid, uuid)
  to service_role;
grant execute on function public.ar_set_public_problem_status(uuid, uuid, text)
  to service_role;
