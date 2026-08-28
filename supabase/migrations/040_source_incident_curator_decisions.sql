-- Phase 15.9P: durable, private, append-only curator Incident decision authority.
-- This records an explicit curator decision bound to one exact durable Formation assessment.
-- It does not create/reuse Incidents, create Source→Incident links, mutate Public Problems,
-- persist Public Evidence, or publish anything.

create table public.ar_source_incident_curator_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_schema_version text not null,
  decision_packet_version text not null,

  formation_assessment_id uuid not null
    references public.ar_source_formation_assessments(id)
    on delete restrict,
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete restrict,

  reviewed_context_content_sha256 text not null,
  reviewed_context_char_count integer not null,
  reviewed_evidence_quote_sha256 text not null,
  reviewed_evidence_quote_char_count integer not null,

  evidence_decision text not null,
  incident_action text,
  existing_incident_id uuid
    references public.ar_source_incidents(id)
    on delete restrict,
  new_incident_key text,
  new_incident_label text,
  decision_reason text,

  incident_persistence_authorized boolean not null,

  decided_by_curator_user_id uuid not null
    references public.ar_radar_curators(user_id)
    on delete restrict,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint ar_source_incident_curator_decisions_schema_check
    check (length(trim(decision_schema_version)) between 1 and 120),
  constraint ar_source_incident_curator_decisions_packet_check
    check (length(trim(decision_packet_version)) between 1 and 120),
  constraint ar_source_incident_curator_decisions_context_hash_check
    check (reviewed_context_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ar_source_incident_curator_decisions_context_count_check
    check (reviewed_context_char_count >= 20),
  constraint ar_source_incident_curator_decisions_evidence_hash_check
    check (reviewed_evidence_quote_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ar_source_incident_curator_decisions_evidence_count_check
    check (reviewed_evidence_quote_char_count > 0),
  constraint ar_source_incident_curator_decisions_evidence_decision_check
    check (evidence_decision in ('accept', 'reject')),
  constraint ar_source_incident_curator_decisions_incident_action_check
    check (incident_action is null or incident_action in ('create_new', 'reuse_existing', 'hold')),
  constraint ar_source_incident_curator_decisions_key_length_check
    check (new_incident_key is null or length(trim(new_incident_key)) between 1 and 500),
  constraint ar_source_incident_curator_decisions_label_length_check
    check (new_incident_label is null or length(new_incident_label) <= 500),
  constraint ar_source_incident_curator_decisions_reason_length_check
    check (decision_reason is null or length(decision_reason) <= 2000),
  constraint ar_source_incident_curator_decisions_shape_check
    check (
      (
        evidence_decision = 'reject'
        and incident_action is null
        and existing_incident_id is null
        and new_incident_key is null
        and new_incident_label is null
        and incident_persistence_authorized = false
      )
      or
      (
        evidence_decision = 'accept'
        and incident_action = 'hold'
        and existing_incident_id is null
        and new_incident_key is null
        and new_incident_label is null
        and incident_persistence_authorized = false
      )
      or
      (
        evidence_decision = 'accept'
        and incident_action = 'create_new'
        and existing_incident_id is null
        and new_incident_key is not null
        and length(trim(new_incident_key)) between 1 and 500
        and incident_persistence_authorized = true
      )
      or
      (
        evidence_decision = 'accept'
        and incident_action = 'reuse_existing'
        and existing_incident_id is not null
        and new_incident_key is null
        and new_incident_label is null
        and incident_persistence_authorized = true
      )
    ),
  constraint ar_source_incident_curator_decisions_unique_formation
    unique (formation_assessment_id)
);

create index ar_idx_source_incident_curator_decisions_signal_created
  on public.ar_source_incident_curator_decisions (source_signal_id, created_at desc);
create index ar_idx_source_incident_curator_decisions_existing_incident
  on public.ar_source_incident_curator_decisions (existing_incident_id)
  where existing_incident_id is not null;
create index ar_idx_source_incident_curator_decisions_curator
  on public.ar_source_incident_curator_decisions (decided_by_curator_user_id, created_at desc);

alter table public.ar_source_incident_curator_decisions enable row level security;

revoke all on table public.ar_source_incident_curator_decisions
  from public, anon, authenticated, service_role;
grant select, insert on table public.ar_source_incident_curator_decisions
  to service_role;

create or replace function public.ar_guard_source_incident_curator_decision()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  formation public.ar_source_formation_assessments%rowtype;
begin
  perform public.ar_require_radar_curator(new.decided_by_curator_user_id);

  select *
  into formation
  from public.ar_source_formation_assessments assessment
  where assessment.id = new.formation_assessment_id;

  if not found then
    raise exception 'Curator Incident decision requires an existing Formation assessment'
      using errcode = '23514';
  end if;

  if formation.source_signal_id <> new.source_signal_id then
    raise exception 'Curator Incident decision Formation/Source lineage mismatch'
      using errcode = '23514';
  end if;

  if formation.status <> 'resolved'
     or formation.resolved <> true
     or formation.formation_state <> 'eligible' then
    raise exception 'Curator Incident decision requires a resolved eligible Formation assessment'
      using errcode = '23514';
  end if;

  if formation.context_content_sha256 <> new.reviewed_context_content_sha256
     or formation.context_char_count <> new.reviewed_context_char_count
     or formation.evidence_quote_sha256 <> new.reviewed_evidence_quote_sha256
     or formation.evidence_quote_char_count <> new.reviewed_evidence_quote_char_count
     or formation.evidence_quote_grounded <> true then
    raise exception 'Curator Incident decision reviewed integrity does not match durable Formation authority'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_source_signal_evaluation_samples sample
    where sample.source_signal_id = new.source_signal_id
  ) then
    raise exception 'Blind evaluation Source Signal cannot receive curator Incident decisions'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_source_incident_links link
    where link.source_signal_id = new.source_signal_id
  ) or exists (
    select 1
    from public.ar_public_problem_evidence_snapshots evidence
    where evidence.source_signal_id = new.source_signal_id
  ) then
    raise exception 'Source with downstream Incident/Public Evidence authority cannot receive a curator Incident decision'
      using errcode = '23514';
  end if;

  if new.evidence_decision = 'accept' and new.incident_action = 'create_new' then
    if exists (
      select 1
      from public.ar_source_incidents incident
      where incident.incident_key = trim(new.new_incident_key)
    ) then
      raise exception 'create_new curator decision requires an unused Incident key at decision time'
        using errcode = '23514';
    end if;
    new.new_incident_key := trim(new.new_incident_key);
    new.new_incident_label := nullif(trim(coalesce(new.new_incident_label, '')), '');
  elsif new.evidence_decision = 'accept' and new.incident_action = 'reuse_existing' then
    if not exists (
      select 1
      from public.ar_source_incidents incident
      where incident.id = new.existing_incident_id
    ) then
      raise exception 'reuse_existing curator decision requires an existing Incident'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.ar_guard_source_incident_curator_decision()
  from public, anon, authenticated;

drop trigger if exists ar_trg_guard_source_incident_curator_decision
  on public.ar_source_incident_curator_decisions;
create trigger ar_trg_guard_source_incident_curator_decision
before insert on public.ar_source_incident_curator_decisions
for each row execute function public.ar_guard_source_incident_curator_decision();

create or replace function public.ar_block_source_incident_curator_decision_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Curator Incident decisions are append-only; update/delete is forbidden'
    using errcode = '23514';
end;
$$;

revoke all on function public.ar_block_source_incident_curator_decision_mutation()
  from public, anon, authenticated;

create trigger ar_trg_block_source_incident_curator_decision_mutation
before update or delete on public.ar_source_incident_curator_decisions
for each row execute function public.ar_block_source_incident_curator_decision_mutation();

create or replace function public.ar_record_source_incident_curator_decision(
  p_curator_user_id uuid,
  p_decision_schema_version text,
  p_decision_packet_version text,
  p_formation_assessment_id uuid,
  p_source_signal_id uuid,
  p_reviewed_context_content_sha256 text,
  p_reviewed_context_char_count integer,
  p_reviewed_evidence_quote_sha256 text,
  p_reviewed_evidence_quote_char_count integer,
  p_evidence_decision text,
  p_incident_action text,
  p_existing_incident_id uuid,
  p_new_incident_key text,
  p_new_incident_label text,
  p_decision_reason text
)
returns public.ar_source_incident_curator_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  decision_row public.ar_source_incident_curator_decisions%rowtype;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  insert into public.ar_source_incident_curator_decisions (
    decision_schema_version,
    decision_packet_version,
    formation_assessment_id,
    source_signal_id,
    reviewed_context_content_sha256,
    reviewed_context_char_count,
    reviewed_evidence_quote_sha256,
    reviewed_evidence_quote_char_count,
    evidence_decision,
    incident_action,
    existing_incident_id,
    new_incident_key,
    new_incident_label,
    decision_reason,
    incident_persistence_authorized,
    decided_by_curator_user_id
  ) values (
    trim(p_decision_schema_version),
    trim(p_decision_packet_version),
    p_formation_assessment_id,
    p_source_signal_id,
    p_reviewed_context_content_sha256,
    p_reviewed_context_char_count,
    p_reviewed_evidence_quote_sha256,
    p_reviewed_evidence_quote_char_count,
    p_evidence_decision,
    p_incident_action,
    p_existing_incident_id,
    p_new_incident_key,
    p_new_incident_label,
    nullif(trim(coalesce(p_decision_reason, '')), ''),
    p_evidence_decision = 'accept' and p_incident_action in ('create_new', 'reuse_existing'),
    p_curator_user_id
  )
  returning * into decision_row;

  return decision_row;
end;
$$;

revoke all on function public.ar_record_source_incident_curator_decision(
  uuid, text, text, uuid, uuid, text, integer, text, integer, text, text, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.ar_record_source_incident_curator_decision(
  uuid, text, text, uuid, uuid, text, integer, text, integer, text, text, uuid, text, text, text
) to service_role;
