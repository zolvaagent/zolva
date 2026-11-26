-- A live agent needs somewhere to trade from: a spot agent its Privy trading_wallet, a Lighter perps agent its
-- Lighter account (lighter_account_index, set only by Zolva). The init rule only knew the first, so it
-- refused every live Lighter agent. The final agent guard (20261125000500) still limits
-- lighter_account_index to live perps agents.
alter table public.agents drop constraint agents_live_needs_wallet;
alter table public.agents add constraint agents_live_needs_wallet
  check (mode = 'paper' or trading_wallet is not null or lighter_account_index is not null);
