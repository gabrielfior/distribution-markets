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

function fmtY(v: number) {
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(4);
  return "$" + v.toFixed(6);
}

function fmtX(v: number) {
  if (v >= 1000) return "$" + (v / 1000).toFixed(v > 10000 ? 0 : 1) + "k";
  return "$" + v.toFixed(0);
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
  const pad = maxSig * 3.5;
  const xMin = minMu - pad;
  const xMax = maxMu + pad;
  const width = xMax - xMin;
  const step = width / 80;

  const showUser = data.userMu !== undefined && data.userSigma !== undefined;

  const initLambda = data.k / (1 / Math.sqrt(2 * data.initialSigma * Math.sqrt(Math.PI)));
  const curLambda = data.k / (1 / Math.sqrt(2 * data.currentSigma * Math.sqrt(Math.PI)));

  let maxVal = 0;
  const points: Record<string, number>[] = [];
  for (let x = xMin; x <= xMax; x += step) {
    const p: Record<string, number> = { x: Math.round(x) };
    const iv = initLambda * normalPDF(x, data.initialMu, data.initialSigma);
    const cv = curLambda * normalPDF(x, data.currentMu, data.currentSigma);
    p["Initial f₀"] = iv;
    p["Current market"] = cv;
    if (showUser) {
      const uv = scaledPDF(x, data.userMu, data.userSigma, data.k);
      p["Your prediction"] = uv;
      maxVal = Math.max(uv, maxVal);
    }
    maxVal = Math.max(iv, cv, maxVal);
    points.push(p);
  }

  const config = [
    { key: "Initial f₀", color: DIST_COLORS[0], dash: "5 5" },
    { key: "Current market", color: "#8884d8" },
  ];
  if (showUser) config.push({ key: "Your prediction", color: DIST_COLORS[1], dash: "5 5" });

  const yMax = maxVal > 0 ? maxVal * 1.15 : 1;

  return { chartData: points, config, xDomain: [xMin, xMax] as [number, number], yMax };
}

function normalPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const coeff = 1 / (sigma * 2.5066282746310002);
  const exponent = -0.5 * ((x - mu) / sigma) ** 2;
  return coeff * Math.exp(exponent);
}

const DistributionCurve = memo(function DistributionCurve({ data, height = 400 }: { data: CurveData; height?: number }) {
  const { chartData, config, xDomain, yMax } = useMemo(() => buildCurve(data), [data]);

  if (chartData.length === 0) {
    return <div className="bg-base-200 rounded-lg p-4 flex items-center justify-center" style={{ height, minHeight: 400 }}><p className="text-base-content/50">No data</p></div>;
  }

  return (
    <div className="bg-base-200 rounded-lg p-4" style={{ height, minHeight: 400 }}>
      <h4 className="text-sm font-bold mb-2 text-base-content/70">Distributions</h4>
      <ResponsiveContainer width="100%" height="100%" aspect={4/3}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="x" type="number" domain={xDomain} tick={{ fontSize: 11 }} tickFormatter={fmtX} />
          <YAxis domain={[0, yMax]} width={65} tick={{ fontSize: 11 }} tickFormatter={fmtY} />
          <Tooltip
            formatter={(value: number) => value.toFixed(4)}
            labelFormatter={label => `x = $${Number(label).toLocaleString()}`}
          />
          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
          {config.map(c => (
            <Area key={c.key} type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={c.dash ? 2 : 3} strokeDasharray={c.dash} fill={c.color} fillOpacity={0.04} dot={false} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default DistributionCurve;
