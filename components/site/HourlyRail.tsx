import type { CSSProperties } from "react";

import { Words } from "@/components/ui/Words";

/**
 * Landing "Every hour": the six steps every agent runs each hour, as a rail. On desktop a lavender
 * line fills the track step by step (CSS only, see `.rail` in globals.css). Approved design:
 * prototype/hourly-rail.html. Copy is final.
 */
const STEPS: { icon: string; title: string; text: string; optional?: boolean }[] = [
  { icon: "ph-cube", title: "Read prices", text: "Hourly closes from Uniswap pools on Robinhood Chain. ETH and BTC are checked against Chainlink." },
  { icon: "ph-list-checks", title: "Run your rules", text: "Your rules decide everything: buy, sell or wait, how much, and when to exit." },
  { icon: "ph-hand-palm", title: "AI check", text: "If you turn it on, the co-pilot can block a signal. It never sizes a trade or skips a stop loss.", optional: true },
  { icon: "ph-arrows-left-right", title: "Paper trade", text: "The trade fills at that hour's price, with virtual money. Nothing real is spent." },
  { icon: "ph-chat-text", title: "Say why", text: "The agent writes down what it saw and why it acted, in plain words. Holding counts too." },
  { icon: "ph-book-open-text", title: "Keep the record", text: "Every decision stays on the agent's public page. Anyone can check it, hour by hour." },
];

export function HourlyRail() {
  return (
    <section className="section" aria-label="Every hour">
      <div className="container">
        <div className="section-heading section-heading--wide">
          <span className="label">Every hour</span>
          <Words className="section-heading__title" text="Rules decide." highlight="The AI can only say no." />
          <p className="section-heading__lead reveal">
            Once an hour, every agent runs the same six steps, in the same order, with virtual money. Nothing happens off the record.
          </p>
        </div>
        <ol className="rail">
          {STEPS.map((step, i) => (
            <li key={step.title} className={step.optional ? "rail__step rail__step--optional" : "rail__step"} style={{ "--i": i } as CSSProperties}>
              <span className="rail__marker" aria-hidden="true">
                <i className={`ph ${step.icon}`} />
              </span>
              <div className="rail__body">
                <span className="rail__num">
                  {String(i + 1).padStart(2, "0")}
                  {step.optional && <span className="rail__tag">OPTIONAL</span>}
                </span>
                <h3 className="rail__title">{step.title}</h3>
                <p className="rail__text">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
