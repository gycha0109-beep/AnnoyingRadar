-- Phase 15.5C: Real Gold Acquisition Campaign and immutable benchmark partition freeze.
-- The benchmark membership table is editorial evaluation metadata only. It does not
-- promote Source Signals into Raw Inputs, Pain Evidence, or Public Problems.

create table if not exists public.ar_source_signal_gold_benchmark_memberships (
  id uuid primary key default gen_random_uuid(),
  source_signal_id uuid not null,
  gold_set_version text not null,
  benchmark_version text not null,
  sample_rank integer not null,
  evaluation_partition text not null,
  assigned_by uuid not null
    references auth.users(id)
    on delete restrict,
  assigned_at timestamptz not null default now(),

  constraint ar_source_signal_gold_benchmark_memberships_gold_fk
    foreign key (source_signal_id, gold_set_version)
    references public.ar_source_signal_gold_annotations(source_signal_id, gold_set_version)
    on delete cascade,
  constraint ar_source_signal_gold_benchmark_memberships_gold_version_check
    check (length(trim(gold_set_version)) between 1 and 80),
  constraint ar_source_signal_gold_benchmark_memberships_benchmark_version_check
    check (length(trim(benchmark_version)) between 1 and 120),
  constraint ar_source_signal_gold_benchmark_memberships_rank_check
    check (sample_rank between 1 and 10000),
  constraint ar_source_signal_gold_benchmark_memberships_partition_check
    check (evaluation_partition in ('calibration', 'holdout')),
  constraint ar_source_signal_gold_benchmark_memberships_signal_unique
    unique (benchmark_version, source_signal_id),
  constraint ar_source_signal_gold_benchmark_memberships_rank_unique
    unique (benchmark_version, sample_rank)
);

create index if not exists ar_idx_source_signal_gold_benchmark_partition
  on public.ar_source_signal_gold_benchmark_memberships
  (benchmark_version, evaluation_partition, sample_rank);

alter table public.ar_source_signal_gold_benchmark_memberships enable row level security;

revoke all on table public.ar_source_signal_gold_benchmark_memberships
  from public, anon, authenticated;
grant select, insert on table public.ar_source_signal_gold_benchmark_memberships
  to service_role;

create or replace function public.ar_guard_frozen_source_signal_gold_annotation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source_signal_id uuid;
  v_gold_set_version text;
begin
  v_source_signal_id := old.source_signal_id;
  v_gold_set_version := old.gold_set_version;

  if exists (
    select 1
    from public.ar_source_signal_gold_benchmark_memberships membership
    where membership.source_signal_id = v_source_signal_id
      and membership.gold_set_version = v_gold_set_version
  ) then
    raise exception 'Frozen Gold benchmark annotations are immutable'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

revoke all on function public.ar_guard_frozen_source_signal_gold_annotation()
  from public, anon, authenticated;
grant execute on function public.ar_guard_frozen_source_signal_gold_annotation()
  to service_role;

drop trigger if exists ar_trg_guard_frozen_source_signal_gold_annotation
  on public.ar_source_signal_gold_annotations;
create trigger ar_trg_guard_frozen_source_signal_gold_annotation
before update or delete
on public.ar_source_signal_gold_annotations
for each row execute function public.ar_guard_frozen_source_signal_gold_annotation();
