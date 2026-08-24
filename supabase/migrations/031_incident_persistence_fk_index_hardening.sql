-- Phase 15.6D follow-up: FK index hygiene after live advisor review.

-- The UNIQUE(source_signal_id) constraint already owns a covering btree index,
-- so the explicit duplicate index is unnecessary.
drop index if exists public.ar_idx_source_incident_links_source;

create index if not exists ar_idx_source_incidents_created_by
  on public.ar_source_incidents (created_by_user_id)
  where created_by_user_id is not null;

create index if not exists ar_idx_source_incident_links_curator
  on public.ar_source_incident_links (linked_by_curator_user_id)
  where linked_by_curator_user_id is not null;
