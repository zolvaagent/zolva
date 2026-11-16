# Outreach: AlphaMorph (@alphamorpheus, alphamorph.si)

Drafted 2026-11-15. Draft only: the owner sends the DM. Pitch: "AlphaMorph tries stocks on Zolva".

## Who they are (checked 2026-11-15)
- X @alphamorpheus, created 2026-11-10, ~264 followers, DMs open, posts every 1-2 hours. Bio: "An experimental brain for LLMs. Specialist circuits compete, remember and evolve against real on-chain markets." Pons-launched token $MORPH (like ZOLVA).
- Site alphamorph.si, title "an evolving trading brain, with open books". Six regions (market awareness, timing, risk, provenance, flow, curve), each a small population of strategies with generations; PnL in paper ETH after fees. A "Read this first" box states the paper-first setup and its limits plainly. AI models paper-trade in a tournament on top of rule strategies; "AI proposals never bypass the deterministic risk gate" (same principle as our co-pilot veto).
- Recent posts (2026-11-14/15): evolutionary arena guard (model-family diversity, atomic model replacement, time-bounded evidence epochs), public changelog + RSS (alphamorph.si/changelog), Verified Builder on @HeyResearch, MLL lineage NFTs, settled-spend ledger for inference costs.
- Tone: short dated lab notes, concrete mechanisms, "evidence" and "eligibility" vocabulary. Not hype. Their universe is Pons memecoins only: no stocks.

## Hook
- Their arena wants new, separate evidence windows. Tokenized US stocks are a different market structure from bonding-curve memecoins: a clean out-of-sample environment for the same brain.
- Both projects say "rules gate the AI" and both publish limits. Easy, honest common ground.

## Pitch facts (checked against app/(docs)/docs/mcp/page.tsx, lib/tiers.ts, docs/tasks.md)
- MCP: https://zolvaagent.app/mcp (Streamable HTTP). No key: 5 read-only tools (list_agents, get_agent, list_markets, get_market, recent_activity). With a key: 16 tools.
- Key: log in on zolvaagent.app (email, Google or wallet), Settings, API keys card (/settings#api-keys), tick scopes, copy (shown once). Send as `Authorization: Bearer zk_...`. Max 5 keys per account; revoke any time; every write is logged.
- Scopes they need: `read:private`, `compute` (validate_rules, backtest), `ai` (write_strategy), `agents:write` (create_paper_agent, pause/resume, publish). They do NOT need `live:stop`; tell them to leave it unticked.
- Limits: 120 requests and 30 writes a minute per key; per account 20 creates a day, 60 backtests an hour and 200 a day; Free tier runs 5 paper agents at once.
- Cost: the key, backtests and paper agents are free. `write_strategy` is paid from AI credits; every account gets $0.50 free credits once at first login (Lite models). Their own LLM can skip write_strategy and send Custom rules JSON straight to validate_rules / backtest, so it costs nothing.
- Paper only. create_paper_agent is two steps (preview with a 30 day backtest, then confirm true). Publishing to the leaderboard needs 24 paper hours.
- Markets: tokenized US stocks plus ETH/BTC on Robinhood Chain (hourly closes); Lighter perps for research. Hourly decisions only: no sub-hour trading.
- No code change on our side, nothing to pay.

## Don'ts (followed in the draft)
No "partnership", no price/returns/token talk, no "buy" anything, no mention of their halted real trading, no copying their brain/neuro framing.

## DM draft v2 (main, 2026-11-16)

v1 felt too abrupt to the owner (setup steps in a first message from a stranger). v2 opens with what we liked, asks a question, and keeps the setup for the second message.

> Hey AlphaMorph team, Zolva here. We also build paper-trading agents on Robinhood Chain (also a Pons launch).
>
> Really like the "Read this first" box on alphamorph.si, and the rule that AI proposals never skip the risk gate. Our co-pilot works the same way.
>
> Curious: has your team thought about running the brain on a different kind of market? We have tokenized US stocks with hourly data, and an MCP your models could use for backtests and paper agents. Free, paper only.
>
> No rush at all, just thought it could be a fun experiment. Happy to share details if it sounds interesting.

## Follow-up (only if they say yes)

> Nice! Setup is about 2 minutes: log in at zolvaagent.app → Settings → API keys, tick read:private, compute and agents:write. Then:
>
> claude mcp add --transport http zolva https://zolvaagent.app/mcp --header "Authorization: Bearer zk_..."
>
> Any MCP client works with the same URL and header. Your model gets backtest, validate_rules, create_paper_agent and the read tools, and every agent decision comes with a plain-word reason. Happy to help with the first run.

## DM draft v1 (superseded)

> Hey AlphaMorph team, Zolva here (no-code paper agents on Robinhood Chain, also a Pons launch). Been reading your arena posts. Idea: let one of your specialist LLMs test ideas on tokenized US stocks through our MCP. [...] First step, ~2 min: log in at zolvaagent.app → Settings → API keys [...]

Notes for the owner:
- Any MCP client works, not only Claude Code: the same URL plus the Bearer header. If they ask for a raw JSON config:
  `{"mcpServers":{"zolva":{"type":"http","url":"https://zolvaagent.app/mcp","headers":{"Authorization":"Bearer zk_..."}}}}`
- If they ask about cost: backtests and paper agents are free; only write_strategy uses AI credits ($0.50 free once), and their own model can write the rules JSON instead.
- If they ask about limits: 20 creates a day, 60 backtests an hour (200 a day), 5 running paper agents on Free.

## Optional second idea (send only after a reply)

> Side idea: we both run agent labs on Robinhood Chain and publish our limits and losses. A joint "open books" post sometime? Each side shows one thing that didn't work and what changed after. No pressure.

## Status
- [x] 2026-11-16: owner sent DM v2 to @alphamorpheus. Waiting for a reply; send the follow-up only if they say yes
- [ ] If they try it: ask for their paper agent's name or id (key activity is only visible to their own account), then offer a lab-log tweet once they post
