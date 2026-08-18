-- Phase 15.4: external Source Adapter ingestion foundation.
-- External signals are editorial supply data, not user-owned Raw Inputs.

create table if not exists public.ar_source_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_platform text not null,
  query_text text not null,
  search_type text not null default 'RECENT',
  search_mode text not null default 'KEYWORD',
  since_at timestamptz,
  until_at timestamptz,
  requested_limit integer not null default 25,
  status text not null default 'running',
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  skipped_count integer not null default 0,
  error_code text,
  error_message text,
  created_by_curator_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint ar_source_ingestion_runs_platform_check
    check (source_platform in ('threads')),
  constraint ar_source_ingestion_runs_query_not_empty
    check (length(trim(query_text)) between 1 and 120),
  constraint ar_source_ingestion_runs_search_type_check
    check (search_type in ('TOP', 'RECENT')),
  constraint ar_source_ingestion_runs_search_mode_check
    check (search_mode in ('KEYWORD', 'TAG')),
  constraint ar_source_ingestion_runs_limit_check
    check (requested_limit between 1 and 50),
  constraint ar_source_ingestion_runs_status_check
    check (status in ('running', 'completed', 'failed')),
  constraint ar_source_ingestion_runs_counts_check
    check (
      fetched_count >= 0
      and inserted_count >= 0
      and duplicate_count >= 0
      and skipped_count >= 0
    ),
  constraint ar_source_ingestion_runs_window_check
    check (since_at is null or until_at is null or since_at < until_at)
);

create table if not exists public.ar_source_signals (
  id uuid primary key default gen_random_uuid(),
  source_platform text not null,
  external_content_id text not null,
  canonical_url text,
  author_handle text,
  raw_text text not null,
  media_type text,
  published_at timestamptz,
  content_hash text not null,
  adapter_version text not null,
  is_quote_post boolean,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_source_signals_platform_check
    check (source_platform in ('threads')),
  constraint ar_source_signals_external_id_not_empty
    check (length(trim(external_content_id)) > 0),
  constraint ar_source_signals_raw_text_not_empty
    check (length(trim(raw_text)) > 0),
  constraint ar_source_signals_content_hash_not_empty
    check (length(trim(content_hash)) > 0),
  constraint ar_source_signals_adapter_version_not_empty
    check (length(trim(adapter_version)) > 0),
  constraint ar_source_signals_unique_external
    unique (source_platform, external_content_id)
);

create table if not exists public.ar_source_signal_observations (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid not null
    references public.ar_source_ingestion_runs(id)
    on delete cascade,
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete cascade,
  query_text text not null,
  rank_index integer,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint ar_source_signal_observations_query_not_empty
    check (length(trim(query_text)) between 1 and 120),
  constraint ar_source_signal_observations_rank_check
    check (rank_index is null or rank_index >= 0),
  constraint ar_source_signal_observations_unique_run_signal
    unique (ingestion_run_id, source_signal_id)
);

create index if not exists ar_idx_source_ingestion_runs_platform_started
  on public.ar_source_ingestion_runs (source_platform, started_at desc);
create index if not exists ar_idx_source_ingestion_runs_query_started
  on public.ar_source_ingestion_runs (query_text, started_at desc);
create index if not exists ar_idx_source_signals_platform_published
  on public.ar_source_signals (source_platform, published_at desc nulls last);
create index if not exists ar_idx_source_signals_content_hash
  on public.ar_source_signals (content_hash);
create index if not exists ar_idx_source_signals_last_seen
  on public.ar_source_signals (last_seen_at desc);
create index if not exists ar_idx_source_signal_observations_signal
  on public.ar_source_signal_observations (source_signal_id, observed_at desc);
create index if not exists ar_idx_source_signal_observations_run
  on public.ar_source_signal_observations (ingestion_run_id, rank_index);

alter table public.ar_source_ingestion_runs enable row level security;
alter table public.ar_source_signals enable row level security;
alter table public.ar_source_signal_observations enable row level security;

revoke all on table public.ar_source_ingestion_runs from public, anon, authenticated;
revoke all on table public.ar_source_signals from public, anon, authenticated;
revoke all on table public.ar_source_signal_observations from public, anon, authenticated;

grant select, insert, update, delete on table public.ar_source_ingestion_runs to service_role;
grant select, insert, update, delete on table public.ar_source_signals to service_role;
grant select, insert, update, delete on table public.ar_source_signal_observations to service_role;

drop trigger if exists ar_trg_source_signals_updated_at on public.ar_source_signals;
create trigger ar_trg_source_signals_updated_at
before update on public.ar_source_signals
for each row execute function public.ar_set_updated_at();
