-- Palisec link (owner 2026-11-24, docs/outreach-palisec.md): an agent's owner may name the Palisec
-- smart account on Robinhood Chain (chain id 4663) that this agent belongs to. Public on
-- GET /api/public/v1/agents/{id} as agent.palisecAccount, and shown on the agent page. The page
-- calls it linked only when the account names this agent back on chain (AgentLinks.linkOf).
-- Stored checksummed by the app; null = not set. Paper agents only (the page says its trades are paper).

alter table agents add column palisec_account text
  constraint agents_palisec_account_address check (palisec_account ~ '^0x[0-9a-fA-F]{40}$');
