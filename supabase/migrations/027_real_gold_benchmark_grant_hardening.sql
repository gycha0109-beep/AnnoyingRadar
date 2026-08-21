-- Phase 15.5C hosted reconciliation.
-- Supabase default privileges can leave service_role broader than the intended
-- append-only benchmark contract after CREATE TABLE. Reduce them explicitly.

revoke all on table public.ar_source_signal_gold_benchmark_memberships
  from public, anon, authenticated, service_role;

grant select, insert on table public.ar_source_signal_gold_benchmark_memberships
  to service_role;
