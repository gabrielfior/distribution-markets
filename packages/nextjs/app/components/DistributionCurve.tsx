"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DistributionPoint {
  x: number;
  y: number;
}

interface DistributionCurveProps {
  marketDistribution: DistributionPoint[];
  userDistribution?: DistributionPoint[];
  actualPrice?: number;
  height?: number;
}

export default function DistributionCurve({
  marketDistribution,
  userDistribution,
  actualPrice,
  height = 250,
}: DistributionCurveProps) {
  const data = marketDistribution.map((p, i) => ({
    x: Math.round(p.x),
    market: p.y,
    user: userDistribution?.[i]?.y ?? 0,
  }));

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
          {userDistribution && userDistribution.length > 0 && (
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
