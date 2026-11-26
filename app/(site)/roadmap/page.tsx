import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { RoadmapSwitch } from "@/components/site/RoadmapSwitch";
import { Words } from "@/components/ui/Words";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "What is live on Zolva today (v1), and what comes next (v2): a place where trading agents prove themselves.",
};

// "Today" on the progress line is worked out per request, so the page must not be cached at build time.
export const dynamic = "force-dynamic";

/** The progress line runs to scale from the day v1 went live to the end of the v2 target quarter. */
const V1_START = Date.UTC(2026, 9, 15); // 15 Oct 2026
const V2_TARGET = Date.UTC(2027, 2, 31); // 31 Mar 2027, end of Q1 2027

type Status = "shipped" | "progress" | "planned";

const STATUS_LABEL: Record<Status, string> = { shipped: "Shipped", progress: "In progress", planned: "Planned" };

/** v1 milestones. `shippedOn` (UTC, first day of a range) places the dot on the progress line; `date` is what the page shows. */
const MILESTONES = [
  {
    shippedOn: Date.UTC(2026, 9, 15),
    date: "15 Oct",
    title: "Paper agents on tokenized US stocks",
    text: "Agents decide once an hour on real prices read on Robinhood Chain, and explain every buy, sell or hold in plain words.",
  },
  {
    shippedOn: Date.UTC(2026, 9, 16),
    date: "16 Oct",
    title: "Studio and the AI co-pilot",
    text: "Build an agent without code and replay it on past prices. The optional co-pilot can only say no to a rule's signal.",
  },
  {
    shippedOn: Date.UTC(2026, 10, 4),
    date: "4–6 Nov",
    title: "Public API, MCP server and x402",
    text: "Read every public agent from your own tools or AI assistant. Premium calls can be paid per request over x402.",
  },
  {
    shippedOn: Date.UTC(2026, 10, 7),
    date: "7 Nov",
    title: "Perps research agents on Lighter",
    text: "Paper agents that can go long or short on Lighter perps, with funding counted every hour.",
  },
  {
    shippedOn: Date.UTC(2026, 10, 10),
    date: "10 Nov",
    title: "ZOLVA token and holder tiers",
    text: "Holding ZOLVA unlocks the Holder and Pro tiers in the app.",
  },
  {
    shippedOn: Date.UTC(2026, 10, 13),
    date: "13–16 Nov",
    title: "Verify, Tested labels and an honest leaderboard",
    text: "Anyone can replay an agent's record. Agents are labelled Tested or Experiment, and the leaderboard ranks only agents with 30 days of record.",
  },
];

const PILLARS = [
  {
    letter: "A",
    icon: "ph-seal-check",
    title: "Proof layer",
    text: "A record anyone can check, for Zolva's agents and outside ones.",
    items: [
      { icon: "ph-hash", text: "Rules hashed on chain before an agent runs" },
      { icon: "ph-arrows-clockwise", text: "Live trades checked against a replay of the same rules" },
      { icon: "ph-tag", text: "Badges: Tested, Verified live, Experiment" },
      { icon: "ph-file-text", text: "A proof page for every agent" },
      { icon: "ph-plugs-connected", text: "Outside agents can submit their record" },
    ],
  },
  {
    letter: "B",
    icon: "ph-storefront",
    title: "Strategy marketplace",
    text: "Strategies that pass the test, ready to copy.",
    items: [
      { icon: "ph-paper-plane-tilt", text: "Apply with a Studio strategy" },
      { icon: "ph-flask", text: "An automatic 6 year test decides the listing" },
      { icon: "ph-copy", text: "Copy a listed strategy, paper first" },
      { icon: "ph-user", text: "Creators get credit for every copy" },
    ],
  },
  {
    letter: "C",
    icon: "ph-broadcast",
    title: "Signal API",
    text: "The tested trend signal, for other agents to use.",
    items: [
      { icon: "ph-trend-up", text: "Trend regime and suggested size per market" },
      { icon: "ph-squares-four", text: "A portfolio view across markets" },
      { icon: "ph-plug", text: "Through MCP, paid per call over x402" },
      { icon: "ph-link", text: "Every signal links to its proof page" },
    ],
  },
];

const GROUNDWORK: { status: Status; title: string; text: string }[] = [
  { status: "progress", title: "A house agent with a public record", text: "Zolva's tested strategy, trading real money on Lighter, every trade public." },
  { status: "shipped", title: "A simpler agents page", text: "Tested agents first, everyone else in a short list. Live since 23 Nov." },
  { status: "planned", title: "Backtest without logging in", text: "Try a strategy on past prices before you sign in." },
];

/** Where a date falls on the progress line, as a percentage clamped to 0–100. */
function positionOf(time: number): number {
  const share = ((time - V1_START) / (V2_TARGET - V1_START)) * 100;
  return Math.min(100, Math.max(0, Math.round(share * 10) / 10));
}

/** Today's spot on the line. Read per request (force-dynamic), so it moves forward each day without a deploy. */
function todayPosition(): number {
  return positionOf(Date.now());
}

/** Plain-words version of today's position for screen readers. */
function describeProgress(today: number): string {
  const words = ["just past the start", "about a quarter", "about halfway", "about three quarters", "at"][Math.round(today / 25)];
  return `v1 started in October 2026; today is ${words} of the way to the v2 target in Q1 2027`;
}

function StatusChip({ status, children }: { status: Status; children?: string }) {
  return <span className={`pill roadmap-status roadmap-status--${status}`}>{children ?? STATUS_LABEL[status]}</span>;
}

/** /roadmap: what is live (v1) and what comes next (v2). Approved design: prototype/roadmap.html. */
export default function RoadmapPage() {
  const today = todayPosition();

  return (
    <div className="container roadmap">
      <section className="roadmap-hero" aria-labelledby="roadmap-title">
        <span className="label">Roadmap</span>
        <Words as="h1" className="section-heading__title roadmap-hero__title" text="What's live," highlight="and what comes next." />
        <p className="section-heading__lead roadmap-hero__lead">v1 is what you can use today. v2 is where we are heading: a place where trading agents prove themselves.</p>

        {/* Progress line, to scale: the filled part is done, dots are v1 milestones, the dashed part is still ahead. */}
        <div className="roadmap-progress" role="img" aria-label={describeProgress(today)} style={{ "--today": `${today}%` } as CSSProperties}>
          <div className="roadmap-progress__track">
            <span className="roadmap-progress__fill" />
            {MILESTONES.map((milestone, index) => (
              <span key={milestone.title} className="roadmap-progress__tick" style={{ "--at": `${positionOf(milestone.shippedOn)}%`, "--order": index } as CSSProperties} />
            ))}
            <span className="roadmap-progress__today" />
            <span className="roadmap-progress__goal">
              <i className="ph ph-flag-checkered" aria-hidden="true" />
            </span>
          </div>
          <div className="roadmap-progress__labels" aria-hidden="true">
            <span className="roadmap-progress__label">
              <b>v1</b>
              <span className="roadmap-progress__date"> Oct 2026</span>
            </span>
            <span className="roadmap-progress__label roadmap-progress__label--today">
              <b>Today</b>
            </span>
            <span className="roadmap-progress__label roadmap-progress__label--end">
              <b>v2</b> Q1 2027
            </span>
          </div>
        </div>
      </section>

      {/* Outside the hero so it stays stuck while both sections scroll past. */}
      <RoadmapSwitch />

      {/* ---------- v1 ---------- */}
      <section className="roadmap-section" id="v1" aria-labelledby="v1-title">
        <div className="roadmap-section__head">
          <div>
            <span className="roadmap-kicker">v1 · Oct–Nov 2026</span>
            <h2 className="roadmap-section__title" id="v1-title">
              Built so far
            </h2>
            <p className="roadmap-section__lead">Everything here is live on zolvaagent.app. Agents trade with virtual money unless a line says otherwise.</p>
          </div>
          <StatusChip status="shipped" />
        </div>

        <ol className="roadmap-timeline">
          {MILESTONES.map((milestone) => (
            <li key={milestone.title} className="roadmap-milestone">
              <span className="roadmap-milestone__date">{milestone.date}</span>
              <div>
                <div className="roadmap-milestone__top">
                  <h3>{milestone.title}</h3>
                  <StatusChip status="shipped" />
                </div>
                <p>{milestone.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- v2 ---------- */}
      <section className="roadmap-section" id="v2" aria-labelledby="v2-title">
        <div className="roadmap-section__head">
          <div>
            <span className="roadmap-kicker">v2 · target Q1 2027</span>
            <h2 className="roadmap-section__title" id="v2-title">
              What comes next
            </h2>
            <p className="roadmap-section__lead">Three pieces, built on one idea, what they mean for ZOLVA holders, and the groundwork they need.</p>
          </div>
          <StatusChip status="planned" />
        </div>

        <div className="roadmap-thesis">
          <q>Zolva is where trading agents prove themselves.</q>
          <p>
            Profit claims are easy to make and hard to check. We want every agent&apos;s record to be checkable: rules fixed before the test, long backtests, live results compared with them, and
            the misses published too.
          </p>
        </div>

        <div className="roadmap-pillars">
          {PILLARS.map((pillar) => (
            <article key={pillar.letter} className="roadmap-pillar">
              <span className="roadmap-pillar__icon">
                <i className={`ph ${pillar.icon}`} aria-hidden="true" />
              </span>
              <span className="roadmap-kicker">{pillar.letter}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
              <ul>
                {pillar.items.map((item) => (
                  <li key={item.text}>
                    <i className={`ph ${item.icon}`} aria-hidden="true" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {/* Revenue from services only, never from trading; no numbers and no yield words (owner, 2026-11-26). */}
        <article className="roadmap-holders" aria-labelledby="holders-title">
          <span className="roadmap-holders__icon">
            <i className="ph ph-coins" aria-hidden="true" />
          </span>
          <div className="roadmap-holders__body">
            <div className="roadmap-holders__top">
              <span className="roadmap-kicker">For ZOLVA holders</span>
              <StatusChip status="planned">Planned · Q1 2027</StatusChip>
            </div>
            <h3 id="holders-title">Revenue back to ZOLVA</h3>
            <p>v2 adds paid services: agent verification, strategy copies and the signal API. A share of that revenue is planned to buy back ZOLVA, on chain and public.</p>
            <p>Holders get more from the product: lower fees on verification and the signal API, and early access to new tested strategies.</p>
            <div className="roadmap-holders__from">
              <span>Comes from</span>
              <span className="roadmap-from-chip">
                <b>A</b> Proof layer
              </span>
              <span className="roadmap-from-chip">
                <b>B</b> Marketplace
              </span>
              <span className="roadmap-from-chip">
                <b>C</b> Signal API
              </span>
            </div>
            <p className="roadmap-holders__note">Share size and timing are not decided yet.</p>
          </div>
        </article>

        <div className="roadmap-groundwork">
          {GROUNDWORK.map((item) => (
            <div key={item.title} className="roadmap-groundwork__item">
              <StatusChip status={item.status} />
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </div>
          ))}
        </div>

        <div className="roadmap-when">
          <i className="ph ph-flag-checkered" aria-hidden="true" />
          <div>
            <b>Target: Q1 2027</b>
            <span>We will share more detail as each piece gets closer.</span>
          </div>
        </div>

        <div className="roadmap-notes">
          <p>Q1 2027 is a target, not a promise; we will update this page if it moves.</p>
          <p>Fees and prices for v2 are not decided yet. They will be announced before anything is charged.</p>
        </div>
      </section>

      <p className="roadmap-disclaimer">
        Paper trading with virtual money at real prices, unless a line says otherwise. Past results do not predict future results. Not investment advice.
      </p>
    </div>
  );
}
