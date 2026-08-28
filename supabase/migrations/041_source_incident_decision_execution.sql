-- Phase 15.9Q: execute one explicit durable curator Incident decision.
--
-- This phase consumes an exact decision id from Phase 15.9P and may mutate only:
--   * ar_source_incidents (create_new only)
--   * ar_source_incident_links (exact approved Source only)
--   * ar_source_incident_decision_executions (append-only execution lineage)
--
-- It does not create/mutate Public Problems, Public Evidence, feed state, or publication.

alter table public.ar_source_incidents
  add column created_from_curator_decision_id uuid
    references public.ar_source_incident_curator_decisions(id)
    on delete restrict;

create unique index ar_uidx_source_incidents_creation_decision
  on public.ar_source_incidents (created_from_curator_decision_id)
  where created_from_curator_decision_id is not null;

alter table public.ar_source_incident_links
  add column curator_decision_id uuid
    references public.ar_source_incident_curator_decisions(id)
    on delete restrict;

create unique index ar_uidx_source_incident_links_curator_decision
  on public.ar_source_incident_links (curator_decision_id)
  where curator_decision_id is not null;

create table public.ar_source_incident_decision_executions (
  id uuid primary key default gen_random_uuid(),
  curator_decision_id uuid not null
    references public.ar_source_incident_curator_decisions(id)
    on delete restrict,
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete restrict,
  incident_id uuid not null
    references public.ar_source_incidents(id)
    on delete restrict,
  incident_action text not null,
  executed_by_curator_user_id uuid not null
    references public.ar_radar_curators(user_id)
    on delete restrict,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint ar_source_incident_decision_executions_action_check
    check (incident_action in ('create_new', 'reuse_existing')),
  constraint ar_source_incident_decision_executions_unique_decision
    unique (curator_decision_id),
  constraint ar_source_incident_decision_executions_unique_source
    unique (source_signal_id),
  constraint ar_source_incident_decision_executions_unique_pair
    unique (incident_id, source_signal_id)
);

create index ar_idx_source_incident_decision_executions_incident
  on public.ar_source_incident_decision_executions (incident_id, executed_at, id);
create index ar_idx_source_incident_decision_executions_curator
  on public.ar_source_incident_decision_executions (executed_by_curator_user_id, executed_at, id);

alter table public.ar_source_incident_decision_executions enable row level security;

revoke all on table public.ar_source_incident_decision_executions
  from public, anon, authenticated, service_role;
grant select on table public.ar_source_incident_decision_executions
  to service_role;

create or replace function public.ar_block_source_incident_decision_execution_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Incident decision executions are append-only; update/delete is forbidden'
    using errcode = '23514';
end;
$$;

revoke all on function public.ar_block_source_incident_decision_execution_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists ar_trg_block_source_incident_decision_execution_mutation
  on public.ar_source_incident_decision_executions;
create trigger ar_trg_block_source_incident_decision_execution_mutation
before update or delete on public.ar_source_incident_decision_executions
for each row execute function public.ar_block_source_incident_decision_execution_mutation();

create or replace function public.ar_execute_source_incident_curator_decision(
  p_curator_user_id uuid,
  p_curator_decision_id uuid
)
returns public.ar_source_incident_decision_executions
language plpgsql
security definer
set search_path = public
as $$
declare
  decision_row public.ar_source_incident_curator_decisions%rowtype;
  incident_row public.ar_source_incidents%rowtype;
  execution_row public.ar_source_incident_decision_executions%rowtype;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  if p_curator_decision_id is null then
    raise exception 'An explicit curator decision id is required; latest-decision inference is forbidden'
      using errcode = '22023';
  end if;

  select *
  into decision_row
  from public.ar_source_incident_curator_decisions decision
  where decision.id = p_curator_decision_id
  for update;

  if not found then
    raise exception 'Curator Incident decision not found'
      using errcode = 'P0002';
  end if;

  if decision_row.evidence_decision <> 'accept'
     or decision_row.incident_action not in ('create_new', 'reuse_existing')
     or decision_row.incident_persistence_authorized <> true then
    raise exception 'Curator Incident decision does not authorize Incident persistence'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_source_incident_decision_executions execution
    where execution.curator_decision_id = decision_row.id
  ) then
    raise exception 'Curator Incident decision has already been executed'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_source_signal_evaluation_samples sample
    where sample.source_signal_id = decision_row.source_signal_id
  ) then
    raise exception 'Blind evaluation Source Signal cannot receive Incident execution'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_source_incident_links link
    where link.source_signal_id = decision_row.source_signal_id
  ) then
    raise exception 'Approved Source Signal already has Incident authority'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_public_problem_evidence_snapshots evidence
    where evidence.source_signal_id = decision_row.source_signal_id
  ) then
    raise exception 'Approved Source Signal already has Public Evidence authority'
      using errcode = '23514';
  end if;

  if decision_row.incident_action = 'create_new' then
    if exists (
      select 1
      from public.ar_source_incidents incident
      where incident.incident_key = decision_row.new_incident_key
    ) then
      raise exception 'Approved create_new Incident key is no longer unused; reapproval is required'
        using errcode = '23514';
    end if;

    insert into public.ar_source_incidents (
      incident_key,
      label,
      created_by_user_id,
      created_from_curator_decision_id
    ) values (
      decision_row.new_incident_key,
      decision_row.new_incident_label,
      p_curator_user_id,
      decision_row.id
    )
    returning * into incident_row;
  else
    select *
    into incident_row
    from public.ar_source_incidents incident
    where incident.id = decision_row.existing_incident_id
    for share;

    if not found then
      raise exception 'Approved reuse_existing Incident no longer exists; reapproval is required'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.ar_source_incident_links (
    incident_id,
    source_signal_id,
    linked_by_curator_user_id,
    curator_decision_id
  ) values (
    incident_row.id,
    decision_row.source_signal_id,
    p_curator_user_id,
    decision_row.id
  );

  insert into public.ar_source_incident_decision_executions (
    curator_decision_id,
    source_signal_id,
    incident_id,
    incident_action,
    executed_by_curator_user_id
  ) values (
    decision_row.id,
    decision_row.source_signal_id,
    incident_row.id,
    decision_row.incident_action,
    p_curator_user_id
  )
  returning * into execution_row;

  return execution_row;
end;
$$;

revoke all on function public.ar_execute_source_incident_curator_decision(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.ar_execute_source_incident_curator_decision(uuid, uuid)
  to service_role;
