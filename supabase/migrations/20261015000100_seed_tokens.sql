-- Candidate stock-token allowlist from data/stock-tokens.json (GeckoTerminal
-- snapshot 2026-10-15). Each token is priced from its deepest USDG pool where
-- one exists (AMC, MU, TSM: deepest pool of any pair; GeckoTerminal still
-- returns the USD price when asked with token=<address>).
-- verified_official stays false until each address is checked against
-- Robinhood's official Stock Token list.

insert into tokens (address, symbol, price_pool) values
  ('0xc0d6457c16cc70d6790dd43521c899c87ce02f35', 'META', '0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36'),
  ('0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', 'NVDA', '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3'),
  ('0x117cc2133c37b721f49de2a7a74833232b3b4c0c', 'SPY', '0xfe2a80bb5618fd14984b92ca6d45bf5ba67443ddb1435e28b2e48df2fc1526cd'),
  ('0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344', 'USO', '0x02175608f1b5e6b5ed221ccfdc7be197d111d915'),
  ('0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5', 'CRCL', '0x654e4143e82a5824445ade0824351c2a9acd95a8'),
  ('0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e', 'GLD', '0xba2f1ed4ceb2169d538d1e614d847e83c5a55913'),
  ('0xec262a75e413fafd0df80480274532c79d42da09', 'MSTR', '0x319bac87e616a89e241c10aeb8afd4892a852cdd8b373cd9765ecddc40b87cfe'),
  ('0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea', 'SPCX', '0xc61284332117c3fb23a2a56cceffd07f7af60029'),
  ('0xd5f3879160bc7c32ebb4dc785f8a4f505888de68', 'QQQ', '0xd60a5d14db690b7afad71f76b108071d7175597d'),
  ('0x05a3d1cd21d0c88145e82600e62e7e496e0f222b', 'AMC', '0x27ccf0a6d1ee74840220715bcca7d3b01e0d33aa30d0259b47ae1585b3f4c071'),
  ('0xad25ac6c84d497db898fa1e8387bf6af3532a1c4', 'BABA', '0xfe709115a71c7f9c007f2ac9cb932071ff3b3117865122134e2c1bd96719734c'),
  ('0x05b37fb53a299a1b874a619e1c4c404d52c36f4c', 'RDDT', '0xa8744e76aed23b05f0126335e7bd38f7935d19fe'),
  ('0x322f0929c4625ed5bad873c95208d54e1c003b2d', 'TSLA', '0x8517f8071ae5b831b738052f12125e8e3d6c158b78728aa44ce3b25e5104d32e'),
  ('0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3', 'GOOGL', '0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7'),
  ('0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a', 'PLTR', '0xee430ee1003e1985e1828a01b9a20dad67ad4302994fe2abb4a173de4ac54623'),
  ('0x12f190a9f9d7d37a250758b26824b97ce941bf54', 'AMZN', '0x8ac92da74ab5f3b1d024dc1943ad7e15dc4179ef'),
  ('0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', 'AAPL', '0xaae0d815ee56e4092a5e5c2911e676fea50b2d6d'),
  ('0xff080c8ce2e5feadaca0da81314ae59d232d4afd', 'MU', '0xcc2a903a8744a65258bb07fbeea553a25410f731c9fef306321d0c176a09542c'),
  ('0x58ffe4a942d3885baa22d7520691f611ef09e7aa', 'TSM', '0x4c862e5846659b086fe73896bbb9058513417e4e6938a1be93aeb7a768fa5754'),
  ('0x1b0e319c6a659f002271b69db8a7df2f911c153e', 'GME', '0xe2b46c905e12ab8e2f864e4821a4325884c1b126')
on conflict (address) do nothing;
