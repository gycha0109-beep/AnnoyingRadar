-- Phase 15.5 hosted poststate hardening.
-- Supabase default privileges can leave service_role with broader table grants
-- than the complaint gate requires, so reset service_role explicitly.

revoke all on table public.ar_source_signal_classifications from service_role;
grant select, insert on table public.ar_source_signal_classifications to service_role;

revoke all on table public.ar_source_signal_gold_annotations from service_role;
grant select, insert, update on table public.ar_source_signal_gold_annotations to service_role;
