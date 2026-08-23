-- Phase 15.5D hardening: the legacy Phase 15.5 classifier is still retained for
-- historical compatibility, but it must not create AI output for an open blind
-- human evaluation sample.

drop trigger if exists ar_trg_legacy_classification_blind_guard
  on public.ar_source_signal_classifications;
create trigger ar_trg_legacy_classification_blind_guard
before insert on public.ar_source_signal_classifications
for each row execute function public.ar_guard_blind_evaluation_from_ai();
