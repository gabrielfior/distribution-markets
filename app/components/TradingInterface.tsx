"use client";

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import DistributionCurve from "./DistributionCurve";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { computeCollateral, computeTotalToSend, scaledPDF, computeKFromGaussian } from "~~/utils/distributionMath";

interface TradingInterfaceProps {
  marketId: string;
}

const SCALE = 1e18;

export default function TradingInterface({ marketId }: TradingInterfaceProps) {
  const { address } = useAccount();
  const [userMu, setUserMu] = useState(0);
  const [userSigma, setUserSigma] = useState(0);
  const [resolutionValue, setResolutionValue] = useState(0);

  const { data: marketData, isLoading: marketLoading } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "getMarketSimple",
    args: [BigInt(marketId)],
  });

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "DistributionMarket",
  });

  const marketMu = marketData ? Number(marketData[0]) / SCALE : 3200;
  const marketSigma = marketData ? Number(marketData[1]) / SCALE : 400;
  const b = marketData ? Number(marketData[2]) / SCALE : 0.01;
  const k = marketData ? Number(marketData[3]) / SCALE : computeKFromGaussian(b, marketSigma);

  const sigmaMin = useMemo(() => {
    if (k <= 0 || b <= 0) return 0;
    return (k * k) / (b * b * Math.sqrt(Math.PI));
  }, [k, b]);

  const collateral = useMemo(() => {
    if (userSigma <= 0 || userMu <= 0) return 0;
    return computeCollateral(k, marketMu, marketSigma, userMu, userSigma);
  }, [k, marketMu, marketSigma, userMu, userSigma]);

  const { total: totalEthToSend } = useMemo(() => {
    if (collateral <= 0) return { total: 0, fees: 0 };
    return computeTotalToSend(collateral, userSigma);
  }, [collateral, userSigma]);

  const payoutPreview = useMemo(() => {
    if (resolutionValue <= 0 || collateral <= 0) return 0;
    const prevScaled = scaledPDF(resolutionValue, marketMu, marketSigma, k);
    const tradeScaled = scaledPDF(resolutionValue, userMu, userSigma, k);
    const pnl = tradeScaled - prevScaled;
    return Math.max(0, Math.min(collateral + pnl, collateral * 10));
  }, [resolutionValue, collateral, marketMu, marketSigma, userMu, userSigma, k]);

  const handleTrade = async () => {
    if (!address) {
      notification.error("Connect your wallet first");
      return;
    }
    if (userSigma < sigmaMin) {
      notification.error("Sigma below minimum");
      return;
    }
    try {
      await writeContractAsync({
        functionName: "trade",
        args: [BigInt(marketId), BigInt(Math.round(userMu * SCALE)), BigInt(Math.round(userSigma * SCALE))],
        value: parseEther(totalEthToSend.toFixed(18)),
      });
      notification.success("Trade executed!");
    } catch (e: any) {
      notification.error(e.message || "Trade failed");
    }
  };

  if (marketLoading) return <div className="text-center p-8">Loading market...</div>;

  return (
    <div className="space-y-6">
      <DistributionCurve marketMu={marketMu} marketSigma={marketSigma} height={300} />

      <div className="bg-base-200 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Trade</h3>

        <div className="stats shadow mb-4 w-full">
          <div className="stat">
            <div className="stat-title">Market μ</div>
            <div className="stat-value text-lg">${marketMu.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Market σ</div>
            <div className="stat-value text-lg">{marketSigma.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Min σ</div>
            <div className="stat-value text-lg text-warning">{sigmaMin.toFixed(2)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Backing (b)</div>
            <div className="stat-value text-lg">{b.toFixed(4)} ETH</div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="label">
              <span className="label-text font-medium">
                Your Predicted Mean (μ): <span className="text-primary">${userMu.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.round(marketMu * 0.5)}
              max={Math.round(marketMu * 1.5)}
              value={userMu}
              step={1}
              onChange={e => setUserMu(Number(e.target.value))}
              className="range range-primary w-full"
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-medium">
                Your Confidence (σ): <span className="text-secondary">{userSigma.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.max(Math.round(sigmaMin), 1)}
              max={Math.round(marketSigma * 3)}
              value={userSigma}
              step={1}
              onChange={e => setUserSigma(Number(e.target.value))}
              className="range range-secondary w-full"
            />
            {userSigma > 0 && userSigma < sigmaMin && (
              <p className="text-error text-sm mt-1">σ below minimum. Increase your confidence width.</p>
            )}
          </div>

          <div className="p-4 bg-base-100 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Collateral Required:</span>
              <span className="font-mono font-medium">{collateral.toFixed(6)} ETH</span>
            </div>
            <div className="flex justify-between">
              <span>Total to Send:</span>
              <span className="font-mono font-bold text-primary">{totalEthToSend.toFixed(6)} ETH</span>
            </div>
          </div>

          {resolutionValue > 0 && (
            <div className="p-4 bg-base-100 rounded-lg">
              <label className="label">
                <span className="label-text font-medium">Resolution Outcome Preview</span>
              </label>
              <input
                type="range"
                min={Math.round(marketMu * 0.5)}
                max={Math.round(marketMu * 1.5)}
                value={resolutionValue}
                step={1}
                onChange={e => setResolutionValue(Number(e.target.value))}
                className="range range-accent w-full"
              />
              <p className="text-sm mt-2">
                Hypothetical payout: <span className="font-bold font-mono">{payoutPreview.toFixed(6)} ETH</span>
              </p>
            </div>
          )}

          <button
            className="btn btn-primary w-full"
            onClick={handleTrade}
            disabled={isPending || userSigma <= 0 || userSigma < sigmaMin}
          >
            {isPending ? "Trading..." : "Execute Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
