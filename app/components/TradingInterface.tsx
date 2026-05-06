"use client";

import { useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import DistributionCurve from "./DistributionCurve";
import { computeCollateral, computeTotalToSend, scaledPDF, computeKFromGaussian } from "~~/utils/distributionMath";

interface TradingInterfaceProps {
  marketId: string;
}

const SCALE = 1e18;

function calcSigmaMin(k: number, b: number): number {
  if (k <= 0 || b <= 0) return 0;
  return (k * k) / (b * b * Math.sqrt(Math.PI));
}

export default function TradingInterface({ marketId }: TradingInterfaceProps) {
  const { address, chainId } = useAccount();
  const [resolutionValue, setResolutionValue] = useState(0);
  const [userMu, setUserMu] = useState<number | null>(null);
  const [userSigma, setUserSigma] = useState<number | null>(null);

  const { data: marketData, isLoading: marketLoading } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "getMarketSimple",
    args: [BigInt(marketId)],
  });

  const { writeContractAsync, isPending } = useWriteContract();

  const marketMu = marketData ? Number(marketData[0]) / SCALE : 3200;
  const marketSigma = marketData ? Number(marketData[1]) / SCALE : 400;
  const b = marketData ? Number(marketData[2]) / SCALE : 0.01;
  const k = marketData ? Number(marketData[3]) / SCALE : computeKFromGaussian(b, marketSigma);
  const sigmaMin = calcSigmaMin(k, b);

  useEffect(() => {
    if (userMu === null) setUserMu(marketMu);
    if (userSigma === null && sigmaMin > 0) setUserSigma(Math.ceil(sigmaMin) + 1);
  }, [marketMu, sigmaMin, userMu, userSigma]);

  const mu = userMu ?? marketMu;
  const sigma = userSigma ?? Math.ceil(sigmaMin) + 1;

  const collateral = useMemo(() => {
    if (sigma <= 0 || mu <= 0) return 0;
    return computeCollateral(k, marketMu, marketSigma, mu, sigma);
  }, [k, marketMu, marketSigma, mu, sigma]);

  const { total: totalEthToSend } = useMemo(() => {
    if (collateral <= 0) return { total: 0, fees: 0 };
    return computeTotalToSend(collateral, sigma);
  }, [collateral, sigma]);

  const payoutPreview = useMemo(() => {
    if (resolutionValue <= 0 || collateral <= 0) return 0;
    const prevScaled = scaledPDF(resolutionValue, marketMu, marketSigma, k);
    const tradeScaled = scaledPDF(resolutionValue, mu, sigma, k);
    const pnl = tradeScaled - prevScaled;
    return Math.max(0, Math.min(collateral + pnl, collateral * 10));
  }, [resolutionValue, collateral, marketMu, marketSigma, mu, sigma, k]);

  const handleTrade = async () => {
    if (!address || !chainId) {
      notification.error("Connect your wallet first");
      return;
    }
    if (sigma < sigmaMin) {
      notification.error("Sigma below minimum");
      return;
    }
    if (totalEthToSend <= 0) {
      notification.error("Invalid collateral amount");
      return;
    }

    try {
      const hash = await writeContractAsync({
        address: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`,
        abi: [
          {
            type: "function",
            name: "trade",
            inputs: [
              { name: "marketId", type: "uint256", internalType: "uint256" },
              { name: "mu", type: "int256", internalType: "int256" },
              { name: "sigma", type: "uint256", internalType: "uint256" },
            ],
            outputs: [],
            stateMutability: "payable",
          },
        ],
        functionName: "trade",
        args: [BigInt(marketId), BigInt(Math.round(mu * SCALE)), BigInt(Math.round(sigma * SCALE))],
        value: parseEther(totalEthToSend.toFixed(18)),
      });
      notification.success("Trade sent! Hash: " + hash.slice(0, 10) + "...");
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Trade failed";
      notification.error(msg);
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
                Your Predicted Mean (μ): <span className="text-primary">${mu.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.round(marketMu * 0.5)}
              max={Math.round(marketMu * 1.5)}
              value={mu}
              step={1}
              onChange={e => setUserMu(Number(e.target.value))}
              className="range range-primary w-full"
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-medium">
                Your Confidence (σ): <span className="text-secondary">{sigma.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.max(Math.round(sigmaMin), 1)}
              max={Math.round(marketSigma * 3)}
              value={sigma}
              step={1}
              onChange={e => setUserSigma(Number(e.target.value))}
              className="range range-secondary w-full"
            />
            {sigma < sigmaMin && (
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
            disabled={isPending || sigma <= 0 || sigma < sigmaMin || totalEthToSend <= 0}
          >
            {isPending ? "Confirm in wallet..." : "Execute Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}


