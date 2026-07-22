-- Reset extraction metadata whenever raw_text changes.
create or replace function public.ar_reset_extraction_metadata_on_raw_text_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.raw_text is distinct from old.raw_text then
    new.extraction_attempt_id := null;
    new.extraction_model := null;
    new.extraction_prompt_version := null;
    new.extraction_provider_request_id := null;
    new.extraction_error_code := null;
    new.extraction_started_at := null;
    new.extraction_completed_at := null;
    new.extraction_input_tokens := null;
    new.extraction_output_tokens := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ar_reset_extraction_metadata_on_raw_text_change on public.ar_raw_inputs;
create trigger trg_ar_reset_extraction_metadata_on_raw_text_change
before update of raw_text on public.ar_raw_inputs
for each row execute function public.ar_reset_extraction_metadata_on_raw_text_change();
