"use client";

import { useId, useMemo, useRef, useState } from "react";

import { dateAt, dayAt, usd } from "@/lib/format";

export type ChartSeries = { label: string; values: number[]; color: string; dashed?: boolean };

/**
 * Line chart in plain SVG: the first series gets a fading fill and draws
 * itself in; hovering shows the date and every series' value.
 *
 * @param startTs  unix seconds of values[0]; each value is one hour later
 * @param step     keep every nth point, for calmer lines on long ranges
 */
export function LineChart({
  series: rawSeries,
  startTs,
  height = 220,
  baseline,
  legend = true,
  step = 1,
}: {
  series: ChartSeries[];
  startTs: number;
  height?: number;
  baseline?: number;
  legend?: boolean;
  step?: number;
}) {
  const id = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const pad = { top: 12, right: 8, bottom: 24, left: 8 };

  const chart = useMemo(() => {
    const series = rawSeries.map((line) => ({ ...line, values: line.values.filter((_, i) => i % step === 0 || i === line.values.length - 1) }));
    const count = series[0]?.values.length ?? 0;
    const all = series.flatMap((line) => line.values);
    if (baseline !== undefined) all.push(baseline);
    let min = Math.min(...all);
    let max = Math.max(...all);
    if (!Number.isFinite(min) || max - min < 1e-9) {
      min = (Number.isFinite(min) ? min : 0) - 1;
      max = min + 2;
    }
    const span = max - min;
    min -= span * 0.08;
    max += span * 0.08;
    const x = (i: number) => pad.left + (count > 1 ? (i / (count - 1)) * (width - pad.left - pad.right) : 0);
    const y = (value: number) => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom);
    const timeAt = (i: number) => startTs + Math.min(i * step, (rawSeries[0]?.values.length ?? 1) - 1) * 3600;
    return { series, count, x, y, timeAt };
  }, [rawSeries, step, baseline, height, startTs, pad.left, pad.right, pad.top, pad.bottom]);

  if (chart.count < 2) {
    return <div className="empty" style={{ padding: "var(--space-500) var(--space-300)" }}><p>The chart appears after the first hours of trading.</p></div>;
  }

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover(Math.round(ratio * (chart.count - 1)));
  };

  return (
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${rawSeries.map((line) => line.label).join(" versus ")} chart`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {baseline !== undefined && (
          <line x1={pad.left} x2={width - pad.right} y1={chart.y(baseline)} y2={chart.y(baseline)} stroke="var(--color-border-strong)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        )}
        {chart.series.map((line, seriesIndex) => {
          const d = line.values.map((value, i) => `${i ? "L" : "M"}${chart.x(i).toFixed(1)},${chart.y(value).toFixed(1)}`).join("");
          return (
            <g key={line.label}>
              {seriesIndex === 0 && (
                <>
                  <defs>
                    <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" style={{ stopColor: line.color, stopOpacity: 0.14 }} />
                      <stop offset="1" style={{ stopColor: line.color, stopOpacity: 0 }} />
                    </linearGradient>
                  </defs>
                  <path d={`${d}L${chart.x(chart.count - 1).toFixed(1)},${height - pad.bottom}L${chart.x(0).toFixed(1)},${height - pad.bottom}Z`} fill={`url(#fill-${id})`} />
                </>
              )}
              <path
                d={d}
                className={seriesIndex === 0 && !line.dashed ? "chart__line" : undefined}
                pathLength={seriesIndex === 0 && !line.dashed ? 1 : undefined}
                fill="none"
                stroke={line.color}
                strokeWidth={seriesIndex === 0 ? 2 : 1.5}
                strokeDasharray={line.dashed ? "4 4" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {[0, Math.floor((chart.count - 1) / 2), chart.count - 1].map((i, n) => (
          <text key={n} x={chart.x(i)} y={height - 6} fontSize="11" fill="var(--color-text-faint)" textAnchor={(["start", "middle", "end"] as const)[n]} fontFamily="var(--font-sans)">
            {dayAt(chart.timeAt(i))}
          </text>
        ))}
        {hover !== null && (
          <line x1={chart.x(hover)} x2={chart.x(hover)} y1={pad.top} y2={height - pad.bottom} stroke="var(--color-text)" strokeWidth={1} opacity={0.25} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <div className="chart__tooltip" style={{ left: `${(chart.x(hover) / width) * 100}%`, opacity: 1 }}>
          {dateAt(chart.timeAt(hover))} {chart.series.map((line) => `${line.label} ${usd(line.values[hover])}`).join("  ")}
        </div>
      )}
      {legend && (
        <div className="chart__legend">
          {rawSeries.map((line) => (
            <span key={line.label}>
              <span className="chart__swatch" style={{ background: line.color }} />
              {line.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
