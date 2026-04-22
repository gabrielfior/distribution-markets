"use client";

import { useMemo, useState } from "react";
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
  const [resolutionValue, setResolutionValue] = useState(market.marketMu);

  // Trade cost: proportional to information content
  // Moving μ costs more the further you go. Narrowing σ costs more (more information).
  const tradeCost = useMemo(() => {
    const muDelta = Math.abs(userMu - market.marketMu) / market.marketSigma;
    const sigmaRatio = market.marketSigma / userSigma;
    const baseCost = 100;
    return baseCost * (1 + muDelta * 0.5 + Math.abs(sigmaRatio - 1) * 0.3);
  }, [userMu, userSigma, market.marketMu, market.marketSigma]);

  // Z-score based payout: rewards being "closer" in standard-deviation terms
  const { payout, profit, zUser, zMarket, scoreRatio } = useMemo(() => {
    const zU = (resolutionValue - userMu) / userSigma;
    const zM = (resolutionValue - market.marketMu) / market.marketSigma;

    // Gaussian kernel score: exp(-0.5 * z^2)
    // Higher = closer to the mean in relative terms
    const userScore = Math.exp(-0.5 * zU * zU);
    const marketScore = Math.exp(-0.5 * zM * zM);

    // Payout multiplier: how much better was your relative prediction?
    const ratio = userScore / marketScore;

    // Payout = cost * ratio (if ratio > 1, you profit; if < 1, you lose)
    const p = tradeCost * ratio;
    return {
      payout: p,
      profit: p - tradeCost,
      zUser: zU,
      zMarket: zM,
      scoreRatio: ratio,
    };
  }, [resolutionValue, userMu, userSigma, market.marketMu, market.marketSigma, tradeCost]);

  const maxRange = Math.round(market.marketMu + 3 * market.marketSigma);
  const minRange = Math.round(market.marketMu - 3 * market.marketSigma);

  return (
    <div className="space-y-6">
      <DistributionCurve
        marketMu={market.marketMu}
        marketSigma={market.marketSigma}
        userMu={userMu}
        userSigma={userSigma}
        actualPrice={resolutionValue}
        height={300}
      />

      <div className="bg-base-200 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Your Prediction</h3>

        <div className="space-y-6">
          {/* Expected Price (μ) */}
          <div>
            <label className="label">
              <span className="label-text font-medium">
                Expected Price (μ): <span className="text-primary">${userMu.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={minRange}
              max={maxRange}
              value={userMu}
              step={1}
              onChange={e => setUserMu(Number(e.target.value))}
              className="range range-primary w-full"
            />
            <div className="flex justify-between text-xs text-base-content/50 mt-1">
              <span>${minRange.toLocaleString()}</span>
              <span>${maxRange.toLocaleString()}</span>
            </div>
          </div>

          {/* Confidence (σ) */}
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
              step={1}
              onChange={e => setUserSigma(Number(e.target.value))}
              className="range range-secondary w-full"
            />
            <div className="flex justify-between text-xs text-base-content/50 mt-1">
              <span>Narrow (confident)</span>
              <span>Wide (uncertain)</span>
            </div>
          </div>

          {/* Resolution Value */}
          <div className="pt-4 border-t border-base-300">
            <label className="label">
              <span className="label-text font-medium">
                Resolution Price (outcome): <span className="text-error">${resolutionValue.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={minRange}
              max={maxRange}
              value={resolutionValue}
              step={1}
              onChange={e => setResolutionValue(Number(e.target.value))}
              className="range range-error w-full"
            />
            <div className="flex justify-between text-xs text-base-content/50 mt-1">
              <span>${minRange.toLocaleString()}</span>
              <span>${maxRange.toLocaleString()}</span>
            </div>
            <p className="text-xs text-base-content/50 mt-2">
              Simulate the actual outcome. See how your payout changes.
            </p>
          </div>
        </div>

        {/* Payout Box */}
        <div className="mt-6 p-4 bg-base-100 rounded-lg space-y-3">
          <h4 className="font-bold text-sm uppercase tracking-wide text-base-content/70">Hypothetical Payout</h4>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-base-content/60">Trade Cost:</span>
              <div className="font-mono font-medium">${tradeCost.toFixed(2)}</div>
            </div>
            <div>
              <span className="text-base-content/60">Your z-score:</span>
              <div className="font-mono font-medium">{zUser.toFixed(3)}σ</div>
            </div>
            <div>
              <span className="text-base-content/60">Market z-score:</span>
              <div className="font-mono font-medium">{zMarket.toFixed(3)}σ</div>
            </div>
            <div>
              <span className="text-base-content/60">Score ratio:</span>
              <div className={`font-mono font-medium ${scoreRatio > 1 ? "text-success" : "text-error"}`}>
                {scoreRatio.toFixed(3)}x
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-base-300">
            <div className="flex justify-between items-center mb-1">
              <span className="text-base-content/60">Payout:</span>
              <span className="font-mono font-bold">${payout.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold">Net Profit/Loss:</span>
              <span
                className={`font-mono font-bold text-lg ${profit > 0 ? "text-success" : profit < 0 ? "text-error" : ""}`}
              >
                {profit > 0 ? "+" : ""}${profit.toFixed(2)}
              </span>
            </div>
          </div>

          <p className="text-xs text-base-content/50 pt-2 border-t border-base-200">
            Lower z-score = closer in relative terms. You profit when your z-score is lower than the market&apos;s.
          </p>
        </div>

        <button className="btn btn-primary w-full mt-6">Submit Trade</button>
        <p className="text-xs text-center text-base-content/50 mt-2">
          Cost calculated based on how much you move the market
        </p>
      </div>
    </div>
  );
}
