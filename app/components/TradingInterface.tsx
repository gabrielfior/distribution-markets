"use client";

import { useEffect, useDeferredValue, useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { computeCollateral, computeTotalToSend } from "~~/utils/distributionMath";
import DistributionCurve from "./DistributionCurve";
import PayoutChart from "./PayoutChart";

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

  const { data: marketData, isLoading } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "getMarketSimple",
    args: [BigInt(marketId)],
  });

  const { writeContractAsync, isPending } = useWriteContract();

  const initialMu = marketData ? Number(marketData[6]) / SCALE : 3200;
  const initialSigma = marketData ? Number(marketData[7]) / SCALE : 400;
  const currentMu = marketData ? Number(marketData[0]) / SCALE : 3200;
  const currentSigma = marketData ? Number(marketData[1]) / SCALE : 400;
  const b = marketData ? Number(marketData[2]) / SCALE : 0.01;
  const k = marketData ? Number(marketData[3]) / SCALE : 0.997;
  const resolved = marketData ? marketData[4] : false;
  const outcome = marketData ? Number(marketData[5]) / SCALE : 0;
  const sigmaMin = calcSigmaMin(k, b);

  useEffect(() => {
    if (!marketData) return;
    if (userMu === null) setUserMu(currentMu);
    if (userSigma === null) setUserSigma(currentSigma);
  }, [marketData, currentMu, currentSigma, userMu, userSigma]);

  const muRaw = userMu ?? currentMu;
  const sigmaRaw = userSigma ?? currentSigma;
  const mu = useDeferredValue(muRaw);
  const sigma = useDeferredValue(sigmaRaw);

  const collateral = useMemo(() => {
    if (sigmaRaw <= 0 || muRaw <= 0 || k <= 0) return 0;
    return computeCollateral(k, currentMu, currentSigma, muRaw, sigmaRaw);
  }, [k, currentMu, currentSigma, muRaw, sigmaRaw]);

  const { total: totalEthToSend } = useMemo(() => {
    if (collateral <= 0) return { total: 0, fees: 0 };
    return computeTotalToSend(collateral, sigmaRaw);
  }, [collateral, sigmaRaw]);

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
        address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as `0x${string}`,
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
      notification.success("Trade sent!");
    } catch (e: any) {
      notification.error(e?.shortMessage || e?.message || "Trade failed");
    }
  };

  if (isLoading) return <div className="text-center p-8">Loading market...</div>;

  const curveData = useMemo(() => ({
    initialMu,
    initialSigma,
    currentMu,
    currentSigma,
    userMu: mu !== currentMu ? mu : undefined,
    userSigma: sigma !== currentSigma ? sigma : undefined,
    k,
  }), [initialMu, initialSigma, currentMu, currentSigma, mu, sigma, k]);

  const previewTrades = useMemo(() => [{
    label: `Your trade (μ=${mu.toFixed(0)}, σ=${sigma.toFixed(0)})`,
    prevMu: currentMu,
    prevSigma: currentSigma,
    tradeMu: mu,
    tradeSigma: sigma,
    collateral: collateral,
    k: k,
  }], [mu, sigma, currentMu, currentSigma, collateral, k]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Market Visualization</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DistributionCurve data={curveData} height={400} />
        <PayoutChart trades={previewTrades} k={k} height={400} />
      </div>

      <div className="bg-base-200 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Trade</h3>

        <div className="stats shadow mb-4 w-full">
          <div className="stat">
            <div className="stat-title">Market μ</div>
            <div className="stat-value text-lg">${currentMu.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Market σ</div>
            <div className="stat-value text-lg">{currentSigma.toLocaleString()}</div>
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
                Expected Price (μ): <span className="text-primary">${muRaw.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.round(currentMu * 0.5)}
              max={Math.round(currentMu * 1.5)}
              value={muRaw}
              step={1}
              onChange={e => setUserMu(Number(e.target.value))}
              className="range range-primary w-full"
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-medium">
                Confidence (σ): <span className="text-secondary">{sigmaRaw.toLocaleString()}</span>
              </span>
            </label>
            <input
              type="range"
              min={Math.max(Math.round(sigmaMin), 1)}
              max={Math.round(currentSigma * 3)}
              value={sigmaRaw}
              step={1}
              onChange={e => setUserSigma(Number(e.target.value))}
              className="range range-secondary w-full"
            />
            {sigmaRaw < sigmaMin && (
              <p className="text-error text-sm mt-1">σ below minimum. Increase width.</p>
            )}
          </div>

          <div className="flex justify-between items-center p-4 bg-base-100 rounded-lg">
            <div>
              <div className="text-sm text-base-content/60">Collateral Required</div>
              <div className="font-mono font-bold text-lg">{collateral.toFixed(6)} ETH</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-base-content/60">Total to Send</div>
              <div className="font-mono font-bold text-lg text-primary">{totalEthToSend.toFixed(6)} ETH</div>
            </div>
          </div>

          <button
            className="btn btn-primary w-full"
            onClick={handleTrade}
            disabled={isPending || sigma <= 0 || sigma < sigmaMin || totalEthToSend <= 0}
          >
            {isPending ? "Confirm in wallet..." : "Execute Trade"}
          </button>
        </div>
      </div>

      {resolved && (
        <div className="alert alert-success">
          <span>Resolved at {outcome}</span>
        </div>
      )}
    </div>
  );
}
