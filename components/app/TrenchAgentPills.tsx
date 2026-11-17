import { usd } from "@/lib/format";
import type { TrenchAgentView } from "@/lib/trench/data";
import { PRESET_INFO } from "@/lib/trench/rules";

const STATUS: Record<TrenchAgentView["status"], { label: string; tone: string }> = {
  setup: { label: "Setting up", tone: "idle" },
  active: { label: "Trading", tone: "live" },
  paused: { label: "Paused", tone: "idle" },
  halted: { label: "Stopped", tone: "down" },
  closed: { label: "Closed", tone: "idle" },
};

/**
 * One trench agent at a glance, as pills: status, strategy, the money it started with, what it is
 * worth now (wallet ETH plus open tokens, on chain) and its Rushr handle.
 */
export function TrenchAgentPills({ agent, valueUsd }: { agent: TrenchAgentView; valueUsd: number | null }) {
  const status = STATUS[agent.status];
  const started = agent.status !== "setup" ? agent.budgetUsd : null;
  const change = started !== null && valueUsd !== null ? valueUsd - started : null;
  return (
    <span className="trench-pills">
      <span className={`trench-pill trench-pill--${status.tone}`}>
        <span className="trench-pill__dot" aria-hidden="true" />
        {status.label}
      </span>
      <span className="trench-pill" title={PRESET_INFO[agent.preset].summary}>
        <i className={`ph ph-${PRESET_INFO[agent.preset].icon}`} aria-hidden="true" />
        <span className="trench-pill__label">Strategy</span>
        {PRESET_INFO[agent.preset].name}
      </span>
      {agent.custom ? (
        <span className="trench-pill trench-pill--custom" title="Its own rules, edited from the preset">
          <i className="ph ph-sliders-horizontal" aria-hidden="true" />
          Custom
        </span>
      ) : null}
      <span className="trench-pill" title="What the wallet held when the agent started">
        <i className="ph ph-arrow-circle-down" aria-hidden="true" />
        <span className="trench-pill__label">Started with</span>
        {started !== null ? usd(started) : "not funded yet"}
      </span>
      {valueUsd !== null ? (
        <span className="trench-pill" title="Wallet ETH plus open tokens at their on-chain sell price">
          <i className="ph ph-chart-line-up" aria-hidden="true" />
          <span className="trench-pill__label">Now</span>
          {usd(valueUsd)}
          {change !== null && Math.abs(change) >= 0.01 ? <span className={change >= 0 ? "gain" : "loss"}>{`${change >= 0 ? "+" : "-"}${usd(Math.abs(change))}`}</span> : null}
        </span>
      ) : null}
      {agent.rushrHandle ? (
        <span className="trench-pill" title="Its Agent profile on Rushr">
          <img src="/img/partners/rushr-mark.png" alt="" width={14} height={14} />@{agent.rushrHandle}
        </span>
      ) : null}
    </span>
  );
}
