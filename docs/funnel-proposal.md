# Activation funnel proposal (2026-11-13)

Status: **Option A approved (2026-11-13) and built; not deployed yet.** The migration `20261113000200_funnel_login_dismiss.sql` must be applied before or with the deploy.

## 1. What the data says

Source: `funnel_events` from 2026-11-11 06:41 UTC (first event) to 2026-11-13, grouped per browser (`visitor`).

| Step | Visitors |
|---|---|
| Opened the Studio | 116 |
| ...and never logged in anywhere | 104 (90%) |
| Picked a preset | 15 |
| Pressed Launch | 19 |
| Pressed Launch while logged out | 15 |
| ...then finished the login | **2** |
| ...then launched | 2 |

- **The login wall is confirmed.** 13 of 15 logged-out visitors who pressed Launch (87%) never finished the login. The 2 who did log in launched, so the launch dialog after login is not the problem.
- Median time from opening the Studio to pressing Launch: 32 s. People decide fast, then stop at the login window.
- Median time from Launch to finished login (the 2 who did): 60 s.
- The bigger, quieter leak: about 100 of 116 visitors never press Launch at all. Fixing the login wall helps the 15 who try; it does not explain the 100 who leave earlier. This proposal focuses on the login wall because it is the sharpest drop and the cheapest to fix.

### Why launches are under-counted

Agents created since tracking started (06:41 UTC on 11-11), excluding house wallets: 14. Tracked `launch_ok`: 10 of them.

The 4 missing ones were all made in the Studio (`/api/agents` is the only way to create an agent; there is no API or Copy-to-Studio path that skips the Studio). For those launches **no event of any kind** was recorded around that time, not even `studio_view`. So the browser sent nothing to `/api/events`: most likely an ad or tracker blocker (Brave Shields, uBlock) blocking the request. One wallet (0x6081…) was tracked on one launch and missing on three, which fits a blocker on one device.

Effect: the funnel under-counts every step for these users, not just launches. Steps that matter most should be recorded on the server, where a blocker cannot stop them.

## 2. The current flow

1. `/studio` opens on the best preset. The 30-day backtest already runs for logged-out visitors (it is computed in the browser, `components/app/Studio.tsx`). Nothing to change there.
2. **Launch agent** (`openLaunch` in `Studio.tsx`) records `launch_click` with `logged_out`, then calls `openLogin(show)`.
3. The visitor sees the generic login window from `components/ui/Providers.tsx`: "Log in or sign up", then "Continue with email or Google" and "Continue with a wallet", with a small note at the bottom. It says nothing about the agent they just built, that it is paper money, or that it is free. It looks the same as logging in from the header.
4. Email or Google opens Privy's own window. After a login, `afterLogin` opens the launch dialog (terms checkboxes), then the agent is created.
5. The draft lives only in React state. If the page reloads during login (for example, if a Google login redirects instead of opening a popup), the draft and the "open the launch dialog" step are lost. This has not been tested; it needs a check before it is called a bug.
6. Not recorded today: which login option was chosen, whether the window was closed, and whether Privy failed.

## 3. Options, ranked

### Option A (recommended): fix tracking first, then a Studio-specific login step

Two parts, shipped together, because part 1 is how we measure part 2.

**A1. Reliable tracking (about 2 hours, very low risk)**
- Record `launch_ok` on the server inside `POST /api/agents` after the agent is created, and `login_ok` inside the login routes (`/api/auth/privy` and the wallet login), instead of from the browser.
- Keep the browser events for `studio_view`, `preset_pick` and `launch_click` (they only exist in the browser), and add a `login_dismiss` event when the login window is closed without a login, with which option was tried.
- Metric it worked: `launch_ok` count equals agents created (excluding house wallets), every day.

**A2. Login step made for the Studio (about half a day, low risk)**
- When the login comes from Launch, the window shows the agent: "Save and launch *GOOGL META NVDA Mean reversion*", plus one line: "Free paper trading with $10,000 of test money. No deposit, no wallet needed." Email or Google stays the first button and is made the visual main button; wallet stays second.
- The draft (strategy, markets, rules, sliders, name) is saved in the browser before the login and restored after it, and the launch dialog reopens on its own, even if the page reloaded.
- Metric it worked: the share of logged-out Launch clicks that finish a login goes from 2 of 15 (13%) to at least 35% over the next 30 logged-out clicks (about one week at current traffic).

Why first: it attacks the confirmed 87% drop directly, uses the code that already exists, and needs no new accounts model.

### Option B: launch without logging in (guest agents)

- A visitor launches a paper agent with no login. It runs as a guest agent tied to the browser, and the visitor is asked to log in to keep it, see it on another device, or publish it.
- Effort: 2 to 4 days. Every agent today belongs to a wallet, so this needs a guest owner, a merge into the wallet on login, limits against spam (guest agents cost cron and AI credits), and clean-up of abandoned guest agents.
- Risk: medium to high (data model, abuse, a lot of orphan agents that make "active agents" numbers look better than real users).
- Metric: logged-out Launch clicks that end in a running agent, then the share of guest agents claimed by a login within 7 days.
- Do this only if Option A still leaves most people at the login step.

### Option C: copy change only

- Only change the text in the current login window (free, paper, no deposit), no draft saving, no tracking fix.
- Effort: 30 minutes, almost no risk.
- Weak: the change could not be measured well, because the blocker gap hides part of the funnel, and the generic window stays the same everywhere else. It is already part of Option A.

### Already done, not an option

- "Let logged-out visitors run the backtest": they already can.
- "Email login first": email or Google is already the first button. A2 only makes it stand out more.

## 4. Recommendation

Option A (A1 and A2 together). Re-check the numbers one week after deploy; decide on Option B only then.
