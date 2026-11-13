# Integration scan (2026-11-13)

Which ecosystem integration Zolva should ship next. The scan ran as a multi-agent workflow: one research agent per candidate, then a separate agent checked each report from primary sources. Eight read-only agents took about 10 minutes and about 757k subagent tokens. Scores are 1 to 10 for "do this next" and are the verifier's adjusted scores.

| Rank | Candidate | Score | Live on chain 4663 | Cheapest real step | Cost |
|---|---|---|---|---|---|
| 1 | ERC-8004 (agent identity registry) | 7 (high confidence) | Yes, registries verified on chain | Register Zolva itself, one owner-signed tx | Gas in cents, a few hours |
| 2 | Longbow (Morpho-based lending) | 6 (medium) | Yes, mainnet | Read-only "Longbow market for this token" field | $0, under a day |
| 3 | Dune | 4 (medium) | Yes, indexed as `robinhood` | Link ZOLVA's Blockscout pages instead | Dune itself is about $65+/mo |
| 4 | Oak Agent Kit recipes | 3 (high) | Yes | A doc: Oak and Zolva MCP side by side | $0 |

## 1. ERC-8004

**What it is.** A draft ERC with three per-chain registries.
- Identity: an ERC-721 per agent, whose URI points to a JSON file listing its name, description and endpoints such as MCP and A2A.
- Reputation.
- Validation.

**On Robinhood Chain.** Live: the verifier read the contract code over our own RPC. About 25k agents are registered on 4663. The registries are upgradeable proxies, so whoever holds the proxy admin can change the logic.

**Kyte already did this.** Kyte registered on Nov 8 as token 22541 with MCP and Web endpoints, showing "verified: no" and "x402: no" on 8004scan.

**How Zolva can do better than Kyte:**
- Publish the domain-verification file at `/.well-known/agent-registration.json`.
- Declare x402 support next to MCP.
- Check what drives 8004scan's "total score" before publishing.

**Step 1, Zolva itself.**
- One `register()` transaction signed by the owner.
- The agent URI can be any https URL or a data: URI, so the transaction alone needs no app deploy. The verification file needs a small deploy.
- Gas is about 0.03 gwei, so cents. No funds at risk.

**Later:**
- Opt-in per-agent identities that users mint themselves.
- Showing reputation on agent pages.

**Post angle.** "Zolva is on ERC-8004 (agent #N), verified domain, MCP and x402 endpoints", with the 8004scan link. It is a listing, not a partnership.

## 2. Longbow

**What it is.** A live lending protocol built on Morpho Blue. Users post stock tokens, ETFs, ETH or cbBTC as collateral and borrow USDG. It also has:
- a USDG vault
- 4x "multiply"
- an MCP with 31 tools, no key needed
- Autopilot
- a builders program that pays integrators at least 50% of the fees they bring

**Reach.** The most agent-focused DeFi team on the chain. It quote-tweets agent projects, and Robinhood Crypto quoted it on Nov 11.

**Catch: liquidity is thin on our tokens.**
- Available USDG on the 20 tokens Zolva lists is 0 to 93 (median 25; AMZN is 0).
- GLD, RDDT and AMC use a Uniswap TWAP oracle.
- The `/api/markets` JSON is undocumented, has no rate limit or terms, and serves two domains.

**Step 1 (under a day, no money):**
- Add a `longbow` field to a market in the API/MCP, plus an optional line on the stock page: "Longbow lists a market for this token", with LLTV and a link.
- Do not show "borrow up to $X", because the numbers are small enough to look broken.
- Cache the response and treat the API as optional.

**Later, real money:**
- builder-code deep links, where the user signs in their own wallet
- live agents lending idle USDG or posting collateral

## 3. Dune

**Data.** Robinhood Chain is indexed under the `robinhood` schema, so ZOLVA burns, x402 payments and live swaps are queryable.

**Why not now:**
- **Cost.** Since Sept 2026 the free tier is view-only: no queries, API or uploads. Analyst is about $65/mo billed annually, about $780 up front. The 7-day trial needs a card.
- **Little to show.** Zolva has almost no on-chain activity, so a dashboard of near-zero charts could hurt credibility.
- **Paper trades.** They are off-chain and would have to be labelled as paper.
- **Exposure.** Live swaps would show the owner's wallets.

**Cheaper:**
- Link ZOLVA's Blockscout token page.
- Or publish contract addresses and let a Dune community wizard build a dashboard.

**Revisit** when there is real volume.

## 4. Oak Agent Kit

**What it is.** A free MCP and CLI add-on that lets Claude Code, Codex and others use about 35 Robinhood Chain projects. Actions need a verified ERC-8004 agent ID.

**Recipes don't fit Zolva.** A recipe is a JSON file that calls one on-chain contract function. Zolva's agents and markets are off-chain, so a recipe could only read ZOLVA's supply and burns.

**Reach is small.** About 1.2k followers, and the account is roughly 3 weeks old.

**Honest option:** a short doc or post showing Oak and Zolva's MCP side by side in Claude Code. Oak already ships Lighter and HEY Research, the same sources Zolva uses.

**Bonus.** ERC-8004 registration (step 1 above) is also what Oak requires before actions.

## Recommendation

1. **ERC-8004 first.**
   - The owner signs one `register()` transaction.
   - I prepare the registration JSON and the `.well-known` verification file, which needs one deploy.
   - Then post it.
2. **Longbow read-only second.**
   - API/MCP field plus one line on the stock page.
   - Post it with a tag, since Longbow reposts agent projects.
3. **Skip Dune and Oak recipes for now.**
   - Link Blockscout.
   - Consider the Oak + Zolva MCP doc as a cheap post later.
