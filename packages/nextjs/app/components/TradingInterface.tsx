"use client";

import { useState } from "react";
import DistributionCurve from "./DistributionCurve";

interface TradingInterfaceProps {
  market: {
    id: string;
    question: string;
    marketMu: number;
    marketSigma: number;
  };
}

export default function TradingInterface({ market }: TradingInterfaceProps) {
  const [userMu, setUserMu] = useState(market.marketMu);
  const [userSigma, setUserSigma] = useState(market.marketSigma);

  const generateNormalPoints = (mu: number, sigma: number) => {
    const points = [];
    const step = sigma / 20;
    for (let x = mu - 3.5 * sigma; x <= mu + 3.5 * sigma; x += step) {
      const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
      points.push({ x, y });
    }
    return points;
  };

  const marketDist = generateNormalPoints(market.marketMu, market.marketSigma);
  const userDist = generateNormalPoints(userMu, userSigma);

  return (
    <div className="space-y-6">
      <DistributionCurve
        marketDistribution={marketDist}
        userDistribution={userDist}
        height={300}
        key={`${userMu}-${userSigma}`}
      />

      <div className="bg-base-200 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Your Prediction</h3>

        <div className="space-y-6">
          <div>
            <label className="label">
              <span className="label-text font-medium">
                Expected Price (μ): <span className="text-primary">${userMu.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.round(market.marketMu - 3 * market.marketSigma)}
              max={Math.round(market.marketMu + 3 * market.marketSigma)}
              value={userMu}
              onChange={e => setUserMu(Number(e.target.value))}
              className="range range-primary w-full"
            />
            <div className="flex justify-between text-xs text-base-content/50 mt-1">
              <span>${Math.round(market.marketMu - 3 * market.marketSigma).toLocaleString()}</span>
              <span>${Math.round(market.marketMu + 3 * market.marketSigma).toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="label">
              <span className="label-text font-medium">
                Confidence (σ): <span className="text-secondary">{userSigma.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.round(market.marketSigma * 0.2)}
              max={Math.round(market.marketSigma * 3)}
              value={userSigma}
              onChange={e => setUserSigma(Number(e.target.value))}
              className="range range-secondary w-full"
            />
            <div className="flex justify-between text-xs text-base-content/50 mt-1">
              <span>Narrow (confident)</span>
              <span>Wide (uncertain)</span>
            </div>
          </div>
        </div>

        <button className="btn btn-primary w-full mt-6">Submit Trade</button>
        <p className="text-xs text-center text-base-content/50 mt-2">
          Cost calculated based on how much you move the market
        </p>
      </div>
    </div>
  );
}
