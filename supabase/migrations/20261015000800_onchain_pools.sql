-- On-chain prices: the hourly snapshot now reads each token's USDG pool
-- straight from Robinhood Chain (Alchemy RPC) instead of GeckoTerminal, which
-- answers 429 to every call from Cloudflare's shared IPs.
--
-- Every token is now priced from a direct stock/USDG pool. AMC, MU and TSM
-- move off their old pools (AMC/MEME, MU/SPY, TSM/SPY) to the deepest
-- USDG pool found on chain (2026-10-15); prices matched within 0.3%.
--
-- pool_kind: 'v3' = pool contract address, 'v4' = pool id in the PoolManager.
-- stock_is_token0: which side of the pool the stock is on (USDG is the other).

alter table tokens
  add column pool_kind text check (pool_kind in ('v3', 'v4')),
  add column stock_is_token0 boolean,
  add column token_decimals smallint not null default 18;

update tokens t
set price_pool = v.pool, pool_kind = v.kind, stock_is_token0 = v.is0, token_decimals = v.decimals
from (values
  ('0xc0d6457c16cc70d6790dd43521c899c87ce02f35', '0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36', 'v4', false, 18), -- META
  ('0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3', 'v3', false, 18), -- NVDA
  ('0x117cc2133c37b721f49de2a7a74833232b3b4c0c', '0xfe2a80bb5618fd14984b92ca6d45bf5ba67443ddb1435e28b2e48df2fc1526cd', 'v4', true, 18), -- SPY
  ('0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344', '0x02175608f1b5e6b5ed221ccfdc7be197d111d915', 'v3', false, 18), -- USO
  ('0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5', '0x654e4143e82a5824445ade0824351c2a9acd95a8', 'v3', false, 18), -- CRCL
  ('0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e', '0xba2f1ed4ceb2169d538d1e614d847e83c5a55913', 'v3', false, 18), -- GLD
  ('0xec262a75e413fafd0df80480274532c79d42da09', '0x319bac87e616a89e241c10aeb8afd4892a852cdd8b373cd9765ecddc40b87cfe', 'v4', false, 18), -- MSTR
  ('0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea', '0xc61284332117c3fb23a2a56cceffd07f7af60029', 'v3', true, 18), -- SPCX
  ('0xd5f3879160bc7c32ebb4dc785f8a4f505888de68', '0xd60a5d14db690b7afad71f76b108071d7175597d', 'v3', false, 18), -- QQQ
  ('0x05a3d1cd21d0c88145e82600e62e7e496e0f222b', '0x7499938c352d5b5b8f0c648722aca5ee964ef9b85c3a3041f1ec379726291d9d', 'v4', true, 18), -- AMC: new direct USDG pool
  ('0xad25ac6c84d497db898fa1e8387bf6af3532a1c4', '0xfe709115a71c7f9c007f2ac9cb932071ff3b3117865122134e2c1bd96719734c', 'v4', false, 18), -- BABA
  ('0x05b37fb53a299a1b874a619e1c4c404d52c36f4c', '0xa8744e76aed23b05f0126335e7bd38f7935d19fe', 'v3', true, 18), -- RDDT
  ('0x322f0929c4625ed5bad873c95208d54e1c003b2d', '0x8517f8071ae5b831b738052f12125e8e3d6c158b78728aa44ce3b25e5104d32e', 'v4', true, 18), -- TSLA
  ('0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3', '0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7', 'v3', true, 18), -- GOOGL
  ('0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a', '0xee430ee1003e1985e1828a01b9a20dad67ad4302994fe2abb4a173de4ac54623', 'v4', false, 18), -- PLTR
  ('0x12f190a9f9d7d37a250758b26824b97ce941bf54', '0x8ac92da74ab5f3b1d024dc1943ad7e15dc4179ef', 'v3', true, 18), -- AMZN
  ('0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', '0xaae0d815ee56e4092a5e5c2911e676fea50b2d6d', 'v3', false, 18), -- AAPL
  ('0xff080c8ce2e5feadaca0da81314ae59d232d4afd', '0xd057b1bc54917855bbee58ead58647f47cab35e5', 'v3', false, 18), -- MU: new direct USDG pool
  ('0x58ffe4a942d3885baa22d7520691f611ef09e7aa', '0x0ba5d53d2f6255f334b7c8ead4f56b6aef5af3402c5e4d11180afd38c6b85fb1', 'v4', true, 18), -- TSM: new direct USDG pool
  ('0x1b0e319c6a659f002271b69db8a7df2f911c153e', '0xe2b46c905e12ab8e2f864e4821a4325884c1b126', 'v3', true, 18) -- GME
) as v (address, pool, kind, is0, decimals)
where t.address = v.address;

alter table tokens
  alter column pool_kind set not null,
  alter column stock_is_token0 set not null;

-- Candles read from chain at the hour boundary.
alter table candles drop constraint if exists candles_source_check;
alter table candles add constraint candles_source_check check (source in ('ohlcv', 'snapshot', 'onchain'));
