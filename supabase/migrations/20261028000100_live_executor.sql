-- Real money trading, step 2: the live executor (docs/real-trading-spike.md).
--
-- live_settings is the global kill switch and the limits, one row. Trading is
-- off until it is switched on by hand. live_wallets is the allowlist: only
-- these wallets may run a live agent, each with the Privy wallet and policy
-- that limit Zolva's signer. apply_live_fill writes one confirmed on-chain
-- fill atomically: the execution, the trade, the position and the cash.

create table live_settings (
  id                    smallint primary key default 1 check (id = 1),
  -- Kill switch: false stops every new live order at once.
  enabled               boolean not null default false,
  max_agent_capital_usd numeric not null default 100 check (max_agent_capital_usd > 0),
  -- Total live buy and sell volume per wallet per UTC day.
  daily_volume_usd      numeric not null default 300 check (daily_volume_usd > 0),
  -- Minimum output is the fresh quote minus this (100 = 1%).
  max_slippage_bps      integer not null default 100 check (max_slippage_bps between 1 and 500),
  -- An order is cancelled when the quote's price is further than this from the reference (200 = 2%).
  max_deviation_bps     integer not null default 200 check (max_deviation_bps between 1 and 1000),
  updated_at            timestamptz not null default now()
);
insert into live_settings (id) values (1);

create table live_wallets (
  address          text primary key check (address = lower(address) and address ~ '^0x[0-9a-f]{40}$'),
  privy_wallet_id  text not null,
  policy_id        text not null,
  note             text,
  added_at         timestamptz not null default now()
);

alter table live_settings enable row level security;
alter table live_wallets enable row level security;

-- A live agent may only be created for an allowlisted wallet, with capital within the cap.
create function live_agent_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap numeric;
begin
  if new.mode <> 'live' then
    return new;
  end if;
  if not exists (select 1 from public.live_wallets w where w.address = new.trading_wallet) then
    raise exception 'live_wallet_not_allowed: % is not on the live allowlist', new.trading_wallet;
  end if;
  select max_agent_capital_usd into cap from public.live_settings where id = 1;
  if new.start_capital > cap then
    raise exception 'live_capital_over_cap: % is above the % cap', new.start_capital, cap;
  end if;
  return new;
end;
$$;

create trigger agents_live_guard
  before insert on agents
  for each row execute function live_agent_guard();

-- Executions record the swap amounts in token units, so fills can be audited against the chain.
alter table executions
  add column amount_in  numeric check (amount_in > 0),
  add column amount_out numeric check (amount_out > 0);

/**
 * Writes one confirmed live fill. Buys spend amount_in USDG for amount_out
 * tokens; sells spend amount_in tokens for amount_out USDG. The trade price is
 * the real fill (USDG per token); cost_usd is gas plus the gap to the decision
 * price. Returns false if the execution was already confirmed (idempotent).
 */
create function apply_live_fill(
  p_execution_id uuid,
  p_tx_hash      text,
  p_amount_in    numeric,
  p_amount_out   numeric,
  p_gas_used     numeric,
  p_gas_cost_usd numeric
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  e public.executions%rowtype;
  usd numeric;
  qty numeric;
  price numeric;
  cost numeric;
begin
  select * into e from public.executions where id = p_execution_id for update;
  if not found then
    raise exception 'execution % not found', p_execution_id;
  end if;
  if e.status = 'confirmed' then
    return false;
  end if;

  if e.side = 'buy' then
    usd := p_amount_in;
    qty := p_amount_out;
  else
    usd := p_amount_out;
    qty := p_amount_in;
  end if;
  price := usd / qty;
  cost := p_gas_cost_usd + greatest(0, case when e.side = 'buy' then (price - e.decision_price) * qty else (e.decision_price - price) * qty end);

  update public.executions
     set status = 'confirmed', tx_hash = p_tx_hash, amount_in = p_amount_in, amount_out = p_amount_out,
         filled_quantity = qty, fill_price = price, gas_used = p_gas_used, gas_cost_usd = p_gas_cost_usd,
         confirmed_at = now(), error = null
   where id = p_execution_id;

  insert into public.trades (agent_id, ts, token_address, side, quantity, price, cost_usd, reason, execution_id)
  values (e.agent_id, e.decided_ts, e.token_address, e.side, qty, price, cost, e.reason, e.id);

  if e.side = 'buy' then
    -- One position per token: the engine only buys a token it does not hold.
    insert into public.positions (agent_id, token_address, quantity, avg_entry_price, opened_at)
    values (e.agent_id, e.token_address, qty, (usd + p_gas_cost_usd) / qty, e.decided_ts)
    on conflict (agent_id, token_address) do update
      set quantity = public.positions.quantity + excluded.quantity,
          avg_entry_price = (public.positions.quantity * public.positions.avg_entry_price + excluded.quantity * excluded.avg_entry_price)
                            / (public.positions.quantity + excluded.quantity);
    update public.agents set cash = greatest(0, cash - usd - p_gas_cost_usd) where id = e.agent_id;
  else
    delete from public.positions where agent_id = e.agent_id and token_address = e.token_address;
    update public.agents set cash = cash + usd - p_gas_cost_usd where id = e.agent_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.apply_live_fill(uuid, text, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.apply_live_fill(uuid, text, numeric, numeric, numeric, numeric) to service_role;
revoke execute on function public.live_agent_guard() from public, anon, authenticated;
