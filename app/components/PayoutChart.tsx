"use client";

import { useMemo } from "react";
import { scaledPDF } from "~~/utils/distributionMath";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PAYOUT_COLORS = ["#e74c3c", "#2ecc71", "#3498db", "#9b59b6", "#f39c12", "#1abc9c", "#e67e22"];

interface TradePreview {
  label: string;
  prevMu: number;
  prevSigma: number;
  tradeMu: number;
  tradeSigma: number;
  collateral: number;
  k: number;
}

interface PayoutChartProps {
  trades: TradePreview[];
  currentMu: number;
  currentSigma: number;
  k: number;
  height?: number;
}

export default function PayoutChart({ trades, currentMu, currentSigma, k, height = 400 }: PayoutChartProps) {
  const { chartData, minPayout, maxPayout } = useMemo(() => {
    if (trades.length === 0) return { chartData: [], minPayout: 0, maxPayout: 0 };

    const allPrevMu = trades.map(t => t.prevMu);
    const allTradeMu = trades.map(t => t.tradeMu);
    const allPrevSig = trades.map(t => t.prevSigma);
    const allTradeSig = trades.map(t => t.tradeSigma);
    const minMu = Math.min(...allPrevMu, ...allTradeMu);
    const maxMu = Math.max(...allPrevMu, ...allTradeMu);
    const maxSig = Math.max(...allPrevSig, ...allTradeSig);

    const xMin = minMu - 4 * maxSig - 2;
    const xMax = maxMu + 4 * maxSig + 2;
    const step = (xMax - xMin) / 300;

    let minP = Infinity;
    let maxP = -Infinity;
    const points: Record<string, number>[] = [];
    for (let x = xMin; x <= xMax; x += step) {
      const p: Record<string, number> = { x: Math.round(x) };
      trades.forEach((t, i) => {
        const prevScaled = scaledPDF(x, t.prevMu, t.prevSigma, k);
        const tradeScaled = scaledPDF(x, t.tradeMu, t.tradeSigma, k);
        const payout = tradeScaled - prevScaled;
        p[t.label] = payout;
        p[t.label + "_pos"] = payout > 0 ? payout : undefined;
        if (payout < minP) minP = payout;
        if (payout > maxP) maxP = payout;
      });
      points.push(p);
    }

    return { chartData: points, minPayout: minP, maxPayout: maxP };
  }, [trades, k]);

  const hasTrades = trades.length > 0;

  return (
    <div className="bg-base-200 rounded-lg p-4" style={{ height }}>
      <h4 className="text-sm font-bold mb-2 text-base-content/70">Trader Payouts (g − f)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11 }}
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name.endsWith("_pos")) return null;
              return [value.toFixed(4), name];
            }}
            labelFormatter={label => `x = $${Number(label).toLocaleString()}`}
          />
          <ReferenceLine y={0} stroke="rgba(0,0,0,0.3)" strokeWidth={1} strokeDasharray="4 4" />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
          />
          {hasTrades &&
            trades.map((trade, idx) => {
              const color = PAYOUT_COLORS[idx % PAYOUT_COLORS.length];
              const label = trade.label;
              return (
                <g key={label}>
                  <defs>
                    <linearGradient id={`profitFill_${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey={label + "_pos"}
                    stroke="none"
                    fill={`url(#profitFill_${idx})`}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={label}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name={label}
                  />
                </g>
              );
            })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}


