"use client";

import { useMemo } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DistributionCurveProps {
  marketMu: number;
  marketSigma: number;
  userMu?: number;
  userSigma?: number;
  actualPrice?: number;
  height?: number;
}

function normalPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
  const exponent = -0.5 * Math.pow((x - mu) / sigma, 2);
  return coeff * Math.exp(exponent);
}

export default function DistributionCurve({
  marketMu,
  marketSigma,
  userMu,
  userSigma,
  actualPrice,
  height = 250,
}: DistributionCurveProps) {
  const data = useMemo(() => {
    // Determine the unified x range
    const allMus = [marketMu];
    const allSigmas = [marketSigma];
    if (userMu !== undefined && userSigma !== undefined) {
      allMus.push(userMu);
      allSigmas.push(userSigma);
    }

    const minMu = Math.min(...allMus);
    const maxMu = Math.max(...allMus);
    const maxSigma = Math.max(...allSigmas);

    const xMin = minMu - 3.5 * maxSigma;
    const xMax = maxMu + 3.5 * maxSigma;
    const step = (xMax - xMin) / 200;

    const points = [];
    for (let x = xMin; x <= xMax; x += step) {
      points.push({
        x: Math.round(x),
        market: normalPDF(x, marketMu, marketSigma),
        user: userMu !== undefined && userSigma !== undefined ? normalPDF(x, userMu, userSigma) : 0,
      });
    }
    return points;
  }, [marketMu, marketSigma, userMu, userSigma]);

  const hasUserDist = userMu !== undefined && userSigma !== undefined;

  return (
    <div className="w-full bg-base-200 rounded-lg p-4" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={["auto", "auto"]}
            tick={{ fontSize: 12 }}
            tickFormatter={val => `$${val.toLocaleString()}`}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            formatter={value => (typeof value === "number" ? value.toExponential(2) : value)}
            labelFormatter={label => `Price: $${Number(label).toLocaleString()}`}
          />
          <Line
            type="monotone"
            dataKey="market"
            stroke="#8884d8"
            strokeWidth={3}
            dot={false}
            name="Market consensus"
            isAnimationActive={false}
          />
          {hasUserDist && (
            <Line
              type="monotone"
              dataKey="user"
              stroke="#82ca9d"
              strokeWidth={3}
              dot={false}
              strokeDasharray="5 5"
              name="Your prediction"
              isAnimationActive={false}
            />
          )}
          {actualPrice && (
            <ReferenceLine
              x={actualPrice}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="3 3"
              label={{ value: "Outcome", position: "top", fill: "#ef4444", fontSize: 12 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
