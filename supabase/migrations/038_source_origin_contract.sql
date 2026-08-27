alter table public.ar_source_signals
  add column if not exists source_origin_kind text,
  add column if not exists source_origin_host text,
  add column if not exists source_origin_classifier_version text;

alter table public.ar_source_signals
  drop constraint if exists ar_source_signals_source_origin_kind_check,
  add constraint ar_source_signals_source_origin_kind_check
    check (
      source_origin_kind is null
      or source_origin_kind in ('naver_blog', 'external_web', 'threads')
    ),
  drop constraint if exists ar_source_signals_source_origin_completeness_check,
  add constraint ar_source_signals_source_origin_completeness_check
    check (
      (source_origin_kind is null and source_origin_host is null and source_origin_classifier_version is null)
      or
      (
        source_origin_kind is not null
        and source_origin_host is not null
        and source_origin_classifier_version is not null
        and source_origin_host = lower(source_origin_host)
        and source_origin_host not like 'www.%'
        and source_origin_host ~ '^[a-z0-9.-]{1,253}$'
        and length(btrim(source_origin_classifier_version)) between 1 and 120
      )
    );

create index if not exists ar_source_signals_origin_idx
  on public.ar_source_signals (source_origin_kind, source_origin_host)
  where source_origin_kind is not null;

comment on column public.ar_source_signals.source_origin_kind is
  'Actual content origin classification. Orthogonal to discovery provider and legacy source_platform identity namespace.';
comment on column public.ar_source_signals.source_origin_host is
  'Normalized actual content origin hostname. Null on historical rows unless explicitly classified by a later governed phase.';
comment on column public.ar_source_signals.source_origin_classifier_version is
  'Version of the origin classifier that produced source_origin_kind/source_origin_host. Historical rows are intentionally not backfilled by migration 038.';
