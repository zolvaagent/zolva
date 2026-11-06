# Larpcheck readiness (researched 2026-11-06)

Crypto Twitter (CT) now runs projects through https://larpcheck.app before buying. These notes cover how it scores and what Zolva should have in place before a launch post or a token. Sources: larpcheck.app/how and public check pages (MET, INVERSE). Full reports are behind credits, so the details of the scoring weights are not public.

## How a check works

- Input: a coin contract address (full picture), an X post (that one claim), or any link (the product itself).
- An AI agent opens the link in a fresh sandboxed Chrome, **uses the product the way a visitor would**, and looks at what the page actually does (network responses, files).
- It reads the X post and its replies, checks claims against the web, and looks at who is behind it, **including their GitHub**.
- On chain: the token, its holders, the dev wallet and its other coins, and **where the creator fees go**.
- **It never connects a wallet, signs anything or runs downloads.** Anything only visible after a wallet login or a signature cannot be "seen working".
- Every finding cites evidence: a file, an address or an API response. Example from INVERSE: `https://useinverse.xyz/api/reserves` and an on-chain flow of burns.

## Scores

- **Narrative score (0 to 100)**, labelled REAL (75+), LIKELY REAL (60 to 80), PARTLY REAL (35 to 60), UNCLEAR, LIKELY LARP, LARP, SCAM.
- **Holders score (0 to 100)**, only for coins: OK, NEUTRAL, SKETCHY, RIGGED. Based on holder spread, how it launched, dev share, linked wallet groups, snipers and what the dev can still change.
- **Total = narrative and holders weighted equally.** A real product with a bad holder table still ends up mediocre.
- A coin named after a real person or brand stays at PARTLY REAL or below until they recognise it.

## Why good projects score low

1. **Claims it could not see working.** INVERSE got PARTLY REAL 55 because "no trade was tested": trading needs a wallet, which the agent never connects.
2. **Headline bigger than the product.** INVERSE was also marked down because its "10x" header was inflated against its own 2x/5x rules.
3. **"Coming soon" and roadmap claims** read as pending: UNCLEAR or PARTLY REAL.
4. **The holder side**: dev holding a real share, snipers, bundled wallets, mint or freeze still possible, fees going to an unexplained wallet.
5. **Nothing independent to check.** No public code, no on-chain trail, no API to hit.

What scores high (MET, REAL 86): a large, working product, an official token, independent evidence. Even MET lost points for one thing it could not trace (its staking program).

## Zolva today

Good already:
- Every page can be browsed without login: leaderboard, /agents, agent pages, activity, markets. The Studio backtest runs without login. The checker can see the product work.
- Public API (`/api/public/v1/...`) and MCP: machine-readable evidence the checker can cite.
- Public GitHub repo with README and MIT license.
- Copy already says paper trading and that real money is in testing with Zolva's own wallet.

Gaps:
1. **The real money claim cannot be verified.** Both live agents are unpublished, so nobody can see a live trade. Fix: a public live agent page with each fill linked to its transaction on Blockscout. Trade-off: it makes the owner's trading wallet public.
2. **Coming soon items on the landing page** (Agent launchpad, the soon badges). Either remove them before a launch post or label them clearly as not live, so they are not read as claims.
3. **Overclaim risk in posts.** Avoid lines like "Agentic finance, live today" next to features that are paper only. Post claims the checker can click: a link to the exact agent, trade or API response.
4. **ZOLVA token (if launched):** half the score. Fair launch, small and disclosed team share, no snipers or bundles, mint and freeze authority gone, and every fee or burn wallet documented on one page with links to its on-chain history, so the "where do the fees go" step finds a clear answer. Note: Larpcheck's coin checks look Solana-first (pump.fun, Jupiter, Solscan); whether it reads a Robinhood Chain token is unconfirmed.
5. **A "verify it yourself" page** (docs or footer): contract addresses, team wallet, fee and burn wallets, GitHub, public API and the live wallet. One page the agent can read, with every claim next to its evidence.

## Before launch

- Do not run a check on Zolva before the gaps above are closed: checks are public, coin checks show on their front page, and an old read stays on the page until a fresh check replaces it (fresh checks and reruns look limited on the free tier).
- When ready, check the site (`zolvaagent.app`) first, then the launch post.
- If a check is wrong, they have "Are you the team? Respond to this check".

## Done (2026-11-06)

- Gap 1: the live agent page is public, with every fill linked to Blockscout. It stays off the leaderboard, Agents, the activity feed and the public API, which are paper only.
- Gap 2: the landing roadmap says Live, In testing and Planned, not built; the launchpad preview is marked as a design.
- Gap 3: claim rules added to `docs/x/profile.md`.
- Gap 5: `/docs/verify` (Verify Zolva), linked from the footer and the roadmap.
- Gap 4 (token) waits for the token launch.
