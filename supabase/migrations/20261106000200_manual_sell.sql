-- "Sell position" on a live agent's page: the owner sells a holding from their own wallet
-- (they sign the swap in the browser), then the server checks the transaction and records
-- it here, so the agent's positions and cash keep matching the wallet.

alter table trades drop constraint trades_reason_check;
alter table trades add constraint trades_reason_check check (reason in ('signal', 'stop_loss', 'take_profit', 'max_hold', 'manual'));
alter table executions drop constraint executions_reason_check;
alter table executions add constraint executions_reason_check check (reason in ('signal', 'stop_loss', 'take_profit', 'max_hold', 'manual'));

-- One confirmed manual sale: an execution with its transaction (unique, so the same swap
-- cannot be recorded twice), a trade, the position reduced or closed, and the USDG added
-- to the agent's cash. Live agents only. Returns the trade id.
create or replace function record_manual_sell(
  p_agent uuid,
  p_token text,
  p_quantity numeric,
  p_usdg numeric,
  p_tx_hash text,
  p_gas_cost_usd numeric
) returns bigint
language plpgsql
as $$
declare
  v_position positions%rowtype;
  v_execution uuid;
  v_trade bigint;
  v_now timestamptz := now();
  v_price numeric := p_usdg / p_quantity;
begin
  if p_quantity <= 0 or p_usdg <= 0 then
    raise exception 'manual_sell: quantity and USDG must be positive';
  end if;
  perform 1 from agents where id = p_agent and mode = 'live' for update;
  if not found then
    raise exception 'manual_sell: not a live agent';
  end if;
  select * into v_position from positions where agent_id = p_agent and token_address = p_token and side = 'long' for update;
  if not found then
    raise exception 'manual_sell: the agent holds no position in this token';
  end if;
  if p_quantity > v_position.quantity * 1.000001 then
    raise exception 'manual_sell: sold more than the agent holds';
  end if;

  insert into executions (agent_id, token_address, side, reason, decided_ts, intended_quantity, decision_price, max_slippage_bps, status, tx_hash, filled_quantity, fill_price, gas_cost_usd, submitted_at, confirmed_at)
  values (p_agent, p_token, 'sell', 'manual', v_now, p_quantity, v_price, 500, 'confirmed', p_tx_hash, p_quantity, v_price, p_gas_cost_usd, v_now, v_now)
  returning id into v_execution;

  insert into trades (agent_id, ts, token_address, side, quantity, price, cost_usd, reason, execution_id)
  values (p_agent, date_trunc('hour', v_now), p_token, 'sell', p_quantity, v_price, p_gas_cost_usd, 'manual', v_execution)
  returning id into v_trade;

  -- Dust left by rounding counts as closed.
  if v_position.quantity - p_quantity <= v_position.quantity * 0.000001 then
    delete from positions where agent_id = p_agent and token_address = p_token and side = 'long';
  else
    update positions set quantity = quantity - p_quantity where agent_id = p_agent and token_address = p_token and side = 'long';
  end if;
  update agents set cash = cash + p_usdg where id = p_agent;
  return v_trade;
end;
$$;

revoke all on function record_manual_sell(uuid, text, numeric, numeric, text, numeric) from public, anon, authenticated;
