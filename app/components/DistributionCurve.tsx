"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scaledPDF } from "~~/utils/distributionMath";

const DIST_COLORS = ["#34495e", "#e74c3c", "#2ecc71", "#3498db", "#9b59b6", "#f39c12", "#1abc9c"];

interface CurveData {
  initialMu: number;
  initialSigma: number;
  currentMu: number;
  currentSigma: number;
  userMu?: number;
  userSigma?: number;
  k: number;
}

export default function DistributionCurve({ data, height = 400 }: { data: CurveData; height?: number }) {
  const { chartData, config } = useMemo(() => {
    const allMus = [data.initialMu, data.currentMu];
    const allSigmas = [data.initialSigma, data.currentSigma];
    if (data.userMu !== undefined && data.userSigma !== undefined) {
      allMus.push(data.userMu);
      allSigmas.push(data.userSigma);
    }
    const minMu = Math.min(...allMus);
    const maxMu = Math.max(...allMus);
    const maxSig = Math.max(...allSigmas);
    const xMin = minMu - 4 * maxSig - 2;
    const xMax = maxMu + 4 * maxSig + 2;
    const step = (xMax - xMin) / 300;

    const points: Record<string, number>[] = [];
    for (let x = xMin; x <= xMax; x += step) {
      const p: Record<string, number> = { x: Math.round(x) };
      p["Initial f₀"] = scaledPDF(x, data.initialMu, data.initialSigma, data.k);
      p["Current market"] = scaledPDF(x, data.currentMu, data.currentSigma, data.k);
      if (data.userMu !== undefined && data.userSigma !== undefined) {
        p["Your prediction"] = scaledPDF(x, data.userMu, data.userSigma, data.k);
      }
      points.push(p);
    }

    const cols: { key: string; color: string; dash?: string }[] = [
      { key: "Initial f₀", color: DIST_COLORS[0], dash: "5 5" },
      { key: "Current market", color: "#8884d8" },
    ];
    if (data.userMu !== undefined && data.userSigma !== undefined) {
      cols.push({ key: "Your prediction", color: DIST_COLORS[1], dash: "5 5" });
    }

    return { chartData: points, config: cols };
  }, [data]);

  return (
    <div className="bg-base-200 rounded-lg p-4" style={{ height }}>
      <h4 className="text-sm font-bold mb-2 text-base-content/70">Distributions</h4>
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
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            formatter={(value: number) => value.toFixed(4)}
            labelFormatter={label => `x = $${Number(label).toLocaleString()}`}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
          />
          {config.map(c => (
            <Area
              key={c.key}
              type="monotone"
              dataKey={c.key}
              stroke={c.color}
              strokeWidth={2}
              strokeDasharray={c.dash}
              fill={c.color}
              fillOpacity={0.04}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
