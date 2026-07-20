-- Align pmd_forecasts RLS with reservoir_reading (authenticated dashboard reads)
drop policy if exists "pmd_forecasts_select_authenticated" on public.pmd_forecasts;
create policy "pmd_forecasts_select_authenticated"
  on public.pmd_forecasts for select
  to authenticated
  using (true);

NOTIFY pgrst, 'reload schema';
