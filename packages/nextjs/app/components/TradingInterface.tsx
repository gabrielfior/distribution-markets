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

function normalPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
  const exponent = -0.5 * Math.pow((x - mu) / sigma, 2);
  return coeff * Math.exp(exponent);
}

function l2Norm(sigma: number): number {
  // L2(σ) = 1 / sqrt(2 * σ * sqrt(pi))
  const sqrtPi = Math.sqrt(Math.PI);
  return 1 / Math.sqrt(2 * sigma * sqrtPi);
}

export default function TradingInterface({ market }: TradingInterfaceProps) {
  const [userMu, setUserMu] = useState(market.marketMu);
  const [userSigma, setUserSigma] = useState(market.marketSigma);
  const [resolutionValue, setResolutionValue] = useState(market.marketMu);
  const [collateral, setCollateral] = useState(0.01); // ETH

  // Constants matching the smart contract plan
  const MIN_BACKING = 0.001; // ETH (~$1-2)
  const BASE_FEE_BPS = 100; // 1%
  const L2_MULTIPLIER = 10;
  const REFERENCE_SIGMA = 400;

  // Compute L2 norm and minimum collateral
  const l2 = useMemo(() => l2Norm(userSigma), [userSigma]);
  const minCollateral = useMemo(() => {
    return l2 * MIN_BACKING; // simplified for frontend
  }, [l2]);

  // Fee breakdown
  const { baseFee, l2Fee, totalFee, netCollateral } = useMemo(() => {
    const base = (collateral * BASE_FEE_BPS) / 10000;
    const referenceL2 = l2Norm(REFERENCE_SIGMA);
    const l2FeeAmount = (collateral * l2 * L2_MULTIPLIER) / referenceL2;
    const total = base + l2FeeAmount;
    const net = Math.max(0, collateral - total);
    return {
      baseFee: base,
      l2Fee: l2FeeAmount,
      totalFee: total,
      netCollateral: net,
    };
  }, [collateral, l2]);

  // Payout proportional to PDF ratio at outcome
  // payout = collateral * (traderPDF / marketPDF)
  const { payout, profit, traderPDF, marketPDF, pdfRatio } = useMemo(() => {
    const tPDF = normalPDF(resolutionValue, userMu, userSigma);
    const mPDF = normalPDF(resolutionValue, market.marketMu, market.marketSigma);

    if (mPDF > 0) {
      const ratio = tPDF / mPDF;
      const p = netCollateral * ratio;
      return {
        payout: p,
        profit: p - collateral,
        traderPDF: tPDF,
        marketPDF: mPDF,
        pdfRatio: ratio,
      };
    }
    return {
      payout: 0,
      profit: -collateral,
      traderPDF: tPDF,
      marketPDF: mPDF,
      pdfRatio: 0,
    };
  }, [resolutionValue, userMu, userSigma, market.marketMu, market.marketSigma, netCollateral, collateral]);

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

          {/* Collateral / Stake */}
          <div className="pt-4 border-t border-base-300">
            <label className="label">
              <span className="label-text font-medium">
                Stake (ETH): <span className="text-accent">{collateral.toFixed(4)} ETH</span>
              </span>
            </label>
            <input
              type="range"
              min={0.001}
              max={1}
              step={0.001}
              value={collateral}
              onChange={e => setCollateral(Number(e.target.value))}
              className="range range-accent w-full"
            />
            <div className="flex justify-between text-xs text-base-content/50 mt-1">
              <span>0.001 ETH</span>
              <span>1 ETH</span>
            </div>
            <p className="text-xs text-base-content/50 mt-2">Minimum for this σ: {minCollateral.toFixed(4)} ETH</p>
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

          {/* Collateral Breakdown */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-base-content/60">Your Stake:</span>
              <div className="font-mono font-medium">{collateral.toFixed(4)} ETH</div>
            </div>
            <div>
              <span className="text-base-content/60">Net Collateral:</span>
              <div className="font-mono font-medium">{netCollateral.toFixed(4)} ETH</div>
            </div>
          </div>

          <div className="p-2 bg-base-200 rounded text-xs text-base-content/60 space-y-1">
            <div className="flex justify-between">
              <span>Base Fee (1%):</span>
              <span className="font-mono">{baseFee.toFixed(6)} ETH</span>
            </div>
            <div className="flex justify-between">
              <span>L2 Fee:</span>
              <span className="font-mono">{l2Fee.toFixed(6)} ETH</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-base-300 pt-1">
              <span>Total Fees:</span>
              <span className="font-mono">{totalFee.toFixed(6)} ETH</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm pt-2">
            <div>
              <span className="text-base-content/60">PDF Ratio:</span>
              <div
                className={`font-mono font-medium ${pdfRatio > 1 ? "text-success" : pdfRatio > 0 ? "text-error" : "text-base-content/50"}`}
              >
                {pdfRatio.toFixed(3)}x
              </div>
            </div>
            <div>
              <span className="text-base-content/60">Your PDF:</span>
              <div className="font-mono font-medium">{traderPDF.toExponential(3)}</div>
            </div>
            <div>
              <span className="text-base-content/60">Market PDF:</span>
              <div className="font-mono font-medium">{marketPDF.toExponential(3)}</div>
            </div>
          </div>

          <div className="pt-3 border-t border-base-300">
            <div className="flex justify-between items-center mb-1">
              <span className="text-base-content/60">Payout:</span>
              <span className="font-mono font-bold">{payout.toFixed(4)} ETH</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold">Net Profit/Loss:</span>
              <span
                className={`font-mono font-bold text-lg ${profit > 0 ? "text-success" : profit < 0 ? "text-error" : ""}`}
              >
                {profit > 0 ? "+" : ""}
                {profit.toFixed(4)} ETH
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-base-200 text-xs text-base-content/60 space-y-2">
            <p>
              <strong>How the payout works:</strong> Payout = Net Collateral × (your PDF / market PDF). Fees are
              deducted upfront. You profit when your probability density at the outcome is higher than the
              market&apos;s.
            </p>
            <p>
              <strong>What is PDF?</strong> Probability Density Function — the height of the bell curve at a specific
              point. Higher = more probability mass concentrated there. Narrow distributions have taller peaks; wide
              distributions have flatter peaks.
            </p>
            <p>
              <strong>L2 Fee:</strong> Higher confidence (narrower σ) requires higher fees to prevent manipulation. A
              very narrow prediction costs significantly more.
            </p>
            <p className="text-base-content/40">
              Reference: Distribution Markets (2024) —{" "}
              <a
                href="https://www.paradigm.xyz/2024/12/distribution-markets"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                paradigm.xyz/2024/12/distribution-markets
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
