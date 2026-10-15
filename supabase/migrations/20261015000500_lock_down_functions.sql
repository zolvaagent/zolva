-- Only the server (service role) may call these; Postgres grants EXECUTE to
-- everyone by default, which would expose them through the public API.
revoke execute on function public.apply_agent_hour(uuid, timestamptz, numeric, numeric, numeric, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.agents_active_limit(text) from public, anon, authenticated;
revoke execute on function public.enforce_active_agent_limit() from public, anon, authenticated;
revoke execute on function public.agents_mode_is_immutable() from public, anon, authenticated;
revoke all on public.agent_stats from anon, authenticated;

-- The server role only had EXECUTE through PUBLIC; grant it back explicitly.
grant execute on function public.apply_agent_hour(uuid, timestamptz, numeric, numeric, numeric, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.agents_active_limit(text) to service_role;
grant execute on function public.enforce_active_agent_limit() to service_role;
grant execute on function public.agents_mode_is_immutable() to service_role;
grant select on public.agent_stats to service_role;
