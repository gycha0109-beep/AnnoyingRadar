-- Phase 15.5B: multi-source real signal acquisition.
-- Preserve external Source Signals as editorial supply data and make provider/content scope explicit.

alter table public.ar_source_ingestion_runs
  drop constraint if exists ar_source_ingestion_runs_platform_check;

alter table public.ar_source_ingestion_runs
  add constraint ar_source_ingestion_runs_platform_check
  check (source_platform in ('threads', 'naver_blog'));

alter table public.ar_source_signals
  drop constraint if exists ar_source_signals_platform_check;

alter table public.ar_source_signals
  add constraint ar_source_signals_platform_check
  check (source_platform in ('threads', 'naver_blog'));

alter table public.ar_source_ingestion_runs
  add column if not exists request_metadata jsonb not null default '{}'::jsonb;

alter table public.ar_source_signals
  add column if not exists acquisition_method text not null default 'official_api',
  add column if not exists content_scope text not null default 'full_content',
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table public.ar_source_ingestion_runs
  drop constraint if exists ar_source_ingestion_runs_request_metadata_object_check;

alter table public.ar_source_ingestion_runs
  add constraint ar_source_ingestion_runs_request_metadata_object_check
  check (jsonb_typeof(request_metadata) = 'object');

alter table public.ar_source_signals
  drop constraint if exists ar_source_signals_acquisition_method_check;

alter table public.ar_source_signals
  add constraint ar_source_signals_acquisition_method_check
  check (acquisition_method in ('official_api', 'manual_curator_import'));

alter table public.ar_source_signals
  drop constraint if exists ar_source_signals_content_scope_check;

alter table public.ar_source_signals
  add constraint ar_source_signals_content_scope_check
  check (content_scope in ('full_content', 'search_snippet'));

alter table public.ar_source_signals
  drop constraint if exists ar_source_signals_source_metadata_object_check;

alter table public.ar_source_signals
  add constraint ar_source_signals_source_metadata_object_check
  check (jsonb_typeof(source_metadata) = 'object');

create index if not exists ar_idx_source_signals_platform_last_seen
  on public.ar_source_signals (source_platform, last_seen_at desc);
