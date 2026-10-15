-- Backup scheduler: Supabase pg_cron calls the app's /api/cron/tick every
-- hour, in addition to the Cloudflare cron trigger (Loopa's Cloudflare cron
-- once never fired). The tick is idempotent, so two callers are harmless.
--
-- scripts/deploy-production.mjs calls configure_hourly_tick() after each
-- deploy with the Worker URL and the production cron secret, so the secret
-- goes straight into Vault and never has to be copied by hand.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create function configure_hourly_tick(p_url text, p_secret text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if p_url !~ '^https://[a-z0-9.-]+/api/cron/tick$' or length(p_secret) < 32 then
    raise exception 'configure_hourly_tick: invalid url or secret';
  end if;

  select id into existing from vault.secrets where name = 'sita_cron_secret';
  if existing is null then
    perform vault.create_secret(p_secret, 'sita_cron_secret');
  else
    perform vault.update_secret(existing, p_secret);
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'sita-hourly-tick';
  -- Minute 7: two minutes after the Cloudflare trigger, as a backup.
  perform cron.schedule(
    'sita-hourly-tick',
    '7 * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sita_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
      );
      $job$,
      p_url
    )
  );
  return 'scheduled';
end;
$$;

revoke execute on function public.configure_hourly_tick(text, text) from public, anon, authenticated;
grant execute on function public.configure_hourly_tick(text, text) to service_role;
