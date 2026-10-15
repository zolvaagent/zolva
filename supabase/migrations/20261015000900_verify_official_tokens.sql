-- All 20 tokens checked against Robinhood's official asset list
-- (GET https://api.robinhood.com/rhj/assets, chain 4663) on 2026-10-15:
-- every address matches an official, active Stock Token.
update tokens set verified_official = true
where address in (
  '0xc0d6457c16cc70d6790dd43521c899c87ce02f35',
  '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec',
  '0x117cc2133c37b721f49de2a7a74833232b3b4c0c',
  '0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344',
  '0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5',
  '0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e',
  '0xec262a75e413fafd0df80480274532c79d42da09',
  '0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea',
  '0xd5f3879160bc7c32ebb4dc785f8a4f505888de68',
  '0x05a3d1cd21d0c88145e82600e62e7e496e0f222b',
  '0xad25ac6c84d497db898fa1e8387bf6af3532a1c4',
  '0x05b37fb53a299a1b874a619e1c4c404d52c36f4c',
  '0x322f0929c4625ed5bad873c95208d54e1c003b2d',
  '0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3',
  '0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a',
  '0x12f190a9f9d7d37a250758b26824b97ce941bf54',
  '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9',
  '0xff080c8ce2e5feadaca0da81314ae59d232d4afd',
  '0x58ffe4a942d3885baa22d7520691f611ef09e7aa',
  '0x1b0e319c6a659f002271b69db8a7df2f911c153e'
);
