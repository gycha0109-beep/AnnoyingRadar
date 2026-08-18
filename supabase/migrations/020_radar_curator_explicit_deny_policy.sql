-- Phase 15.1 clarity hardening: direct curator table reads remain forbidden.
-- service_role bypasses RLS; anon/authenticated receive an explicit deny policy.

drop policy if exists ar_radar_curators_deny_direct_read
  on public.ar_radar_curators;

create policy ar_radar_curators_deny_direct_read
  on public.ar_radar_curators
  for select to anon, authenticated
  using (false);
