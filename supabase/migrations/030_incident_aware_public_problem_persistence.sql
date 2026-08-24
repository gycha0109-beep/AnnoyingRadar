-- Phase 15.6D: incident-aware Source -> Public Problem persistence.
--
-- Source identity and incident identity are deliberately separate:
--   source_signal_id = one publication/source row
--   incident_id      = one underlying real-world case
--
-- A repeated Public Problem must be supported by at least two distinct
-- incidents. Distinct source_key values alone are not sufficient.

create table public.ar_source_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  label text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_source_incidents_key_length
    check (length(trim(incident_key)) between 1 and 500),
  constraint ar_source_incidents_label_length
    check (label is null or length(label) <= 500)
);

create table public.ar_source_incident_links (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null
    references public.ar_source_incidents(id)
    on delete restrict,
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete restrict,
  linked_by_curator_user_id uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),

  constraint ar_source_incident_links_unique_source
    unique (source_signal_id),
  constraint ar_source_incident_links_unique_pair
    unique (incident_id, source_signal_id)
);

create index ar_idx_source_incident_links_incident
  on public.ar_source_incident_links (incident_id, created_at, id);
create index ar_idx_source_incident_links_source
  on public.ar_source_incident_links (source_signal_id);

create trigger ar_trg_source_incidents_updated_at
before update on public.ar_source_incidents
for each row execute function public.ar_set_updated_at();

alter table public.ar_source_incidents enable row level security;
alter table public.ar_source_incident_links enable row level security;

revoke all on table public.ar_source_incidents
  from public, anon, authenticated;
revoke all on table public.ar_source_incident_links
  from public, anon, authenticated;
grant select on table public.ar_source_incidents to service_role;
grant select on table public.ar_source_incident_links to service_role;

alter table public.ar_public_problem_evidence_snapshots
  add column source_signal_id uuid
    references public.ar_source_signals(id)
    on delete restrict,
  add column incident_id uuid
    references public.ar_source_incidents(id)
    on delete restrict;

create index ar_idx_public_problem_evidence_source_signal
  on public.ar_public_problem_evidence_snapshots (source_signal_id);
create index ar_idx_public_problem_evidence_incident
  on public.ar_public_problem_evidence_snapshots (incident_id);
create index ar_idx_public_problem_evidence_problem_incident
  on public.ar_public_problem_evidence_snapshots (public_problem_id, incident_id);

-- Curator authority creates/reuses one stable incident identity and attaches
-- Source Signals to it. A Source Signal may never belong to two incidents.
create or replace function public.ar_register_source_incident(
  p_curator_user_id uuid,
  p_incident_key text,
  p_label text,
  p_source_signal_ids uuid[]
)
returns public.ar_source_incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.ar_source_incidents%rowtype;
  v_source_id uuid;
  v_existing_incident_id uuid;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if length(trim(coalesce(p_incident_key, ''))) not between 1 and 500 then
    raise exception 'incident_key must contain 1 to 500 characters' using errcode = '22023';
  end if;
  if p_label is not null and length(p_label) > 500 then
    raise exception 'incident label must be at most 500 characters' using errcode = '22023';
  end if;
  if p_source_signal_ids is null or cardinality(p_source_signal_ids) < 1 then
    raise exception 'at least one source_signal_id is required' using errcode = '22023';
  end if;
  if cardinality(p_source_signal_ids) <> cardinality(array(select distinct unnest(p_source_signal_ids))) then
    raise exception 'source_signal_ids must be unique' using errcode = '22023';
  end if;

  insert into public.ar_source_incidents (
    incident_key,
    label,
    created_by_user_id
  ) values (
    trim(p_incident_key),
    nullif(trim(coalesce(p_label, '')), ''),
    p_curator_user_id
  )
  on conflict (incident_key) do update
    set label = coalesce(ar_source_incidents.label, excluded.label)
  returning * into v_incident;

  foreach v_source_id in array p_source_signal_ids loop
    if not exists (
      select 1 from public.ar_source_signals where id = v_source_id
    ) then
      raise exception 'Source Signal not found: %', v_source_id using errcode = 'P0002';
    end if;

    select incident_id into v_existing_incident_id
    from public.ar_source_incident_links
    where source_signal_id = v_source_id;

    if v_existing_incident_id is not null and v_existing_incident_id <> v_incident.id then
      raise exception 'Source Signal is already assigned to another incident'
        using errcode = '23514';
    end if;

    insert into public.ar_source_incident_links (
      incident_id,
      source_signal_id,
      linked_by_curator_user_id
    ) values (
      v_incident.id,
      v_source_id,
      p_curator_user_id
    )
    on conflict (source_signal_id) do nothing;
  end loop;

  return v_incident;
end;
$$;

-- Strict external-public Evidence path. The Source Signal and Incident must
-- already be linked. This function does not publish the Problem.
create or replace function public.ar_add_incident_bound_public_problem_evidence(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_excerpt text,
  p_source_signal_id uuid,
  p_incident_id uuid,
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

  if p_source_signal_id is null or p_incident_id is null then
    raise exception 'source_signal_id and incident_id are required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.ar_source_incident_links
    where source_signal_id = p_source_signal_id
      and incident_id = p_incident_id
  ) then
    raise exception 'Source Signal is not bound to the supplied incident'
      using errcode = '23514';
  end if;
  if length(trim(coalesce(p_excerpt, ''))) not between 1 and 600 then
    raise exception 'excerpt must contain 1 to 600 characters' using errcode = '22023';
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
    created_by_user_id,
    source_signal_id,
    incident_id
  ) values (
    p_problem_id,
    trim(p_excerpt),
    'external_public',
    nullif(trim(coalesce(p_source_type, '')), ''),
    nullif(trim(coalesce(p_source_label, '')), ''),
    nullif(trim(coalesce(p_source_url, '')), ''),
    trim(p_source_key),
    p_source_observed_at,
    p_order_index,
    p_curator_user_id,
    p_source_signal_id,
    p_incident_id
  )
  returning * into v_snapshot;

  update public.ar_public_problems
  set updated_by_user_id = p_curator_user_id
  where id = p_problem_id;

  return v_snapshot;
end;
$$;

-- Publication remains curator-explicit, but repetition is now asserted from
-- independent incidents. Source diversity remains an additional provenance
-- requirement rather than a substitute for incident diversity.
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
  v_distinct_incident_count integer;
  v_missing_incident_count integer;
  v_invalid_basis_count integer;
  v_invalid_external_binding_count integer;
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
    count(distinct incident_id),
    count(*) filter (where incident_id is null),
    count(*) filter (where publication_basis not in ('external_public', 'user_opt_in')),
    count(*) filter (
      where publication_basis = 'external_public'
        and (
          source_signal_id is null
          or incident_id is null
          or not exists (
            select 1
            from public.ar_source_incident_links l
            where l.source_signal_id = ar_public_problem_evidence_snapshots.source_signal_id
              and l.incident_id = ar_public_problem_evidence_snapshots.incident_id
          )
        )
    )
  into
    v_evidence_count,
    v_distinct_source_count,
    v_distinct_incident_count,
    v_missing_incident_count,
    v_invalid_basis_count,
    v_invalid_external_binding_count
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
  if v_missing_incident_count > 0 then
    raise exception 'Published Public Problem requires incident identity for every Evidence snapshot'
      using errcode = '23514';
  end if;
  if v_distinct_incident_count < 2 then
    raise exception 'Published Public Problem requires at least 2 distinct incident_id values'
      using errcode = '23514';
  end if;
  if v_invalid_basis_count > 0 then
    raise exception 'Published Public Problem contains non-publishable Evidence'
      using errcode = '23514';
  end if;
  if v_invalid_external_binding_count > 0 then
    raise exception 'Published Public Problem contains invalid Source-to-Incident Evidence lineage'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.ar_register_source_incident(uuid, text, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.ar_add_incident_bound_public_problem_evidence(
  uuid, uuid, text, uuid, uuid, text, text, text, text, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.ar_register_source_incident(uuid, text, text, uuid[])
  to service_role;
grant execute on function public.ar_add_incident_bound_public_problem_evidence(
  uuid, uuid, text, uuid, uuid, text, text, text, text, timestamptz, integer
) to service_role;
