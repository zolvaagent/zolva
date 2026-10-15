-- Display names for the stock tokens, and one call that returns recent
-- closes for every enabled token (PostgREST caps plain selects at 1000 rows).

alter table tokens add column name text;

update tokens t set name = v.name
  from (values
  ('0xc0d6457c16cc70d6790dd43521c899c87ce02f35', 'Meta Platforms'),
  ('0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', 'NVIDIA'),
  ('0x117cc2133c37b721f49de2a7a74833232b3b4c0c', 'SPDR S&P 500 ETF Trust'),
  ('0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344', 'United States Oil Fund'),
  ('0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5', 'Circle Internet Group'),
  ('0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e', 'SPDR Gold Shares'),
  ('0xec262a75e413fafd0df80480274532c79d42da09', 'Strategy Inc.'),
  ('0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea', 'Space Exploration Technologies'),
  ('0xd5f3879160bc7c32ebb4dc785f8a4f505888de68', 'Invesco QQQ'),
  ('0x05a3d1cd21d0c88145e82600e62e7e496e0f222b', 'AMC Entertainment Holdings, Inc.'),
  ('0xad25ac6c84d497db898fa1e8387bf6af3532a1c4', 'Alibaba'),
  ('0x05b37fb53a299a1b874a619e1c4c404d52c36f4c', 'Reddit'),
  ('0x322f0929c4625ed5bad873c95208d54e1c003b2d', 'Tesla'),
  ('0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3', 'Alphabet Class A'),
  ('0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a', 'Palantir Technologies'),
  ('0x12f190a9f9d7d37a250758b26824b97ce941bf54', 'Amazon'),
  ('0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', 'Apple'),
  ('0xff080c8ce2e5feadaca0da81314ae59d232d4afd', 'Micron Technology'),
  ('0x58ffe4a942d3885baa22d7520691f611ef09e7aa', 'Taiwan Semiconductor Manufacturing'),
  ('0x1b0e319c6a659f002271b69db8a7df2f911c153e', 'GameStop')
  ) as v(address, name)
 where t.address = v.address;

-- Hourly closes since p_from for every enabled token, as one JSON document:
-- [{ "address", "symbol", "name", "candles": [[unix_seconds, close], ...] }]
create function candle_closes(p_from timestamptz) returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(token_row order by symbol), '[]'::jsonb)
    from (
      select t.symbol,
             jsonb_build_object(
               'address', t.address,
               'symbol', t.symbol,
               'name', coalesce(t.name, t.symbol),
               'candles', coalesce((
                 select jsonb_agg(jsonb_build_array(extract(epoch from c.ts)::bigint, c.close) order by c.ts)
                   from public.candles c
                  where c.token_address = t.address and c.ts >= p_from
               ), '[]'::jsonb)
             ) as token_row
        from public.tokens t
       where t.enabled
    ) rows;
$$;

revoke execute on function public.candle_closes(timestamptz) from public, anon, authenticated;
grant execute on function public.candle_closes(timestamptz) to service_role;
