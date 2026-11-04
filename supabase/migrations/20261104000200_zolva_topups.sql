-- Paying for AI credits with ZOLVA (docs/ai-and-token-plan.md section 11): the user's
-- wallet sends ZOLVA to the burn address, the server checks the transaction on chain,
-- then this records it and adds paid credits in one step. A transaction counts once.

create table zolva_topups (
  tx_hash       text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  owner         text not null references wallets (address) on delete cascade,
  wallet        text not null,
  amount_raw    numeric not null check (amount_raw > 0),
  price         numeric not null check (price > 0),
  usd           numeric not null check (usd > 0),
  credits_micro bigint not null check (credits_micro > 0),
  block_number  bigint not null,
  created_at    timestamptz not null default now()
);
create index zolva_topups_owner_idx on zolva_topups (owner, created_at desc);
alter table zolva_topups enable row level security;

alter table ai_ledger drop constraint ai_ledger_kind_check;
alter table ai_ledger add constraint ai_ledger_kind_check check (kind in ('welcome', 'manual', 'spend', 'refund', 'zolva'));

-- Returns false (and changes nothing) if this transaction was already credited.
create function ai_grant_zolva(
  p_owner text,
  p_tx_hash text,
  p_wallet text,
  p_amount_raw numeric,
  p_price numeric,
  p_usd numeric,
  p_credits_micro bigint,
  p_block_number bigint
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.zolva_topups (tx_hash, owner, wallet, amount_raw, price, usd, credits_micro, block_number)
  values (p_tx_hash, p_owner, p_wallet, p_amount_raw, p_price, p_usd, p_credits_micro, p_block_number)
  on conflict (tx_hash) do nothing;
  if not found then
    return false;
  end if;
  insert into public.ai_credits (owner) values (p_owner) on conflict (owner) do nothing;
  update public.ai_credits set paid_micro = paid_micro + p_credits_micro, updated_at = now() where owner = p_owner;
  insert into public.ai_ledger (owner, bucket, delta_micro, kind, note) values (p_owner, 'paid', p_credits_micro, 'zolva', p_tx_hash);
  return true;
end;
$$;

revoke execute on function public.ai_grant_zolva(text, text, text, numeric, numeric, numeric, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ai_grant_zolva(text, text, text, numeric, numeric, numeric, bigint, bigint) to service_role;
