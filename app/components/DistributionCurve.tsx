"use client";

import { memo, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

function buildCurve(data: CurveData) {
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
  const step = (xMax - xMin) / 80;

  const showUser = data.userMu !== undefined && data.userSigma !== undefined;
  const k = data.k;

  const points: Record<string, number>[] = [];
  const initLambda = k / (1 / Math.sqrt(2 * data.initialSigma * Math.sqrt(Math.PI)));
  const curLambda = k / (1 / Math.sqrt(2 * data.currentSigma * Math.sqrt(Math.PI)));

  for (let x = xMin; x <= xMax; x += step) {
    const p: Record<string, number> = { x: Math.round(x) };
    p["Initial f₀"] = initLambda * normalPDF(x, data.initialMu, data.initialSigma);
    p["Current market"] = curLambda * normalPDF(x, data.currentMu, data.currentSigma);
    if (showUser) {
      p["Your prediction"] = scaledPDF(x, data.userMu, data.userSigma, k);
    }
    points.push(p);
  }

  const cols = [
    { key: "Initial f₀", color: DIST_COLORS[0], dash: "5 5" },
    { key: "Current market", color: "#8884d8" },
  ];
  if (showUser) {
    cols.push({ key: "Your prediction", color: DIST_COLORS[1], dash: "5 5" });
  }

  return { chartData: points, config: cols };
}

function normalPDF(x: number, mu: number, sigma: number): number {
  const coeff = 1 / (sigma * 2.5066282746310002);
  const exponent = -0.5 * ((x - mu) / sigma) ** 2;
  return coeff * Math.exp(exponent);
}

const DistributionCurve = memo(function DistributionCurve({ data, height = 400 }: { data: CurveData; height?: number }) {
  const { chartData, config } = useMemo(() => buildCurve(data), [data]);

  return (
    <div className="bg-base-200 rounded-lg p-4" style={{ height }}>
      <h4 className="text-sm font-bold mb-2 text-base-content/70">Distributions</h4>
      <ResponsiveContainer width="100%" height="100%" minHeight={400}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="x" type="number" domain={["auto", "auto"]} tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip formatter={(value: number) => value.toFixed(4)} labelFormatter={label => `x = $${Number(label).toLocaleString()}`} />
          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
          {config.map(c => (
            <Area key={c.key} type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={2} strokeDasharray={c.dash} fill={c.color} fillOpacity={0.04} dot={false} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default DistributionCurve;
