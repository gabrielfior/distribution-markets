"use client";

import { useEffect, useDeferredValue, useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { computeCollateral, computeTotalToSend } from "~~/utils/distributionMath";
import DistributionCurve from "./DistributionCurve";
import PayoutChart from "./PayoutChart";

interface TradingInterfaceProps {
  marketId: string;
}

const SCALE = 1e18;
const TRADE_COLORS = ["#e74c3c", "#2ecc71", "#3498db", "#9b59b6", "#f39c12", "#1abc9c", "#e67e22", "#34495e"];

function calcSigmaMin(k: number, b: number): number {
  if (k <= 0 || b <= 0) return 0;
  return (k * k) / (b * b * Math.sqrt(Math.PI));
}

export default function TradingInterface({ marketId }: TradingInterfaceProps) {
  const { address, chainId } = useAccount();
  const [userMu, setUserMu] = useState<number | null>(null);
  const [userSigma, setUserSigma] = useState<number | null>(null);

  const { data: contractInfo } = useDeployedContractInfo({ contractName: "DistributionMarket" });
  const contractAddress = contractInfo?.address;

  const { data: marketData, isLoading } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "getMarketSimple",
    args: [BigInt(marketId)],
  });

  const { data: tradeCountData } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "getTradeCount",
    args: [BigInt(marketId)],
  });

  const tradeCount = tradeCountData ? Number(tradeCountData) : 0;
  const tradeIndices = useMemo(() => Array.from({ length: tradeCount }, (_, i) => i), [tradeCount]);

  const { data: tradesBatch } = useReadContracts({
    contracts: tradeIndices.map(idx => ({
      address: contractAddress!,
      abi: [{
        type: "function" as const,
        name: "getTrade",
        inputs: [
          { name: "marketId", type: "uint256", internalType: "uint256" },
          { name: "tradeIndex", type: "uint256", internalType: "uint256" },
        ],
        outputs: [
          { name: "trader", type: "address", internalType: "address" },
          { name: "prevMu", type: "int256", internalType: "int256" },
          { name: "prevSigma", type: "uint256", internalType: "uint256" },
          { name: "tradeMu", type: "int256", internalType: "int256" },
          { name: "tradeSigma", type: "uint256", internalType: "uint256" },
          { name: "collateral", type: "uint256", internalType: "uint256" },
          { name: "feePaid", type: "uint256", internalType: "uint256" },
          { name: "claimed", type: "bool", internalType: "bool" },
        ],
        stateMutability: "view",
      }],
      functionName: "getTrade",
      args: [BigInt(marketId), BigInt(idx)],
    })),
    query: { enabled: tradeCount > 0 && !!contractAddress },
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

  const pastTrades = useMemo(() => {
    if (!tradesBatch || tradesBatch.length === 0) return [];
    return tradesBatch.map((r, i) => {
      if (!r.result) return null;
      const d = r.result as readonly [string, bigint, bigint, bigint, bigint, bigint, bigint, boolean];
      return {
        index: i,
        trader: d[0],
        prevMu: Number(d[1]) / SCALE,
        prevSigma: Number(d[2]) / SCALE,
        tradeMu: Number(d[3]) / SCALE,
        tradeSigma: Number(d[4]) / SCALE,
        collateral: Number(d[5]) / SCALE,
        feePaid: Number(d[6]) / SCALE,
        claimed: d[7],
      };
    }).filter(Boolean) as {
      index: number; trader: string; prevMu: number; prevSigma: number;
      tradeMu: number; tradeSigma: number; collateral: number; feePaid: number; claimed: boolean;
    }[];
  }, [tradesBatch]);

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

  const userChangedMu = mu !== currentMu;
  const userChangedSigma = sigma !== currentSigma;
  const showUserPreview = userChangedMu || userChangedSigma;

  const curveData = useMemo(() => ({
    initialMu,
    initialSigma,
    currentMu,
    currentSigma,
    userMu: showUserPreview ? mu : undefined,
    userSigma: showUserPreview ? sigma : undefined,
    k,
    pastTrades: pastTrades.map(t => ({
      mu: t.tradeMu,
      sigma: t.tradeSigma,
      label: `Trade #${t.index + 1}`,
      color: TRADE_COLORS[(t.index + 1) % TRADE_COLORS.length],
    })),
  }), [initialMu, initialSigma, currentMu, currentSigma, mu, sigma, k, showUserPreview, pastTrades]);

  const previewTrades = useMemo(() => {
    const result: {
      label: string; prevMu: number; prevSigma: number;
      tradeMu: number; tradeSigma: number; collateral: number; k: number;
    }[] = [];

    if (showUserPreview) {
      result.push({
        label: `Your trade (μ=${mu.toFixed(0)}, σ=${sigma.toFixed(0)})`,
        prevMu: currentMu, prevSigma: currentSigma,
        tradeMu: mu, tradeSigma: sigma, collateral, k,
      });
    }

    pastTrades.forEach(t => {
      result.push({
        label: `Trade #${t.index + 1} (μ=${t.tradeMu.toFixed(0)}, σ=${t.tradeSigma.toFixed(0)})`,
        prevMu: t.prevMu, prevSigma: t.prevSigma,
        tradeMu: t.tradeMu, tradeSigma: t.tradeSigma,
        collateral: t.collateral, k,
      });
    });

    return result;
  }, [pastTrades, showUserPreview, mu, sigma, currentMu, currentSigma, collateral, k]);

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
      await writeContractAsync({
        address: contractAddress!,
        abi: [{
          type: "function" as const, name: "trade",
          inputs: [
            { name: "marketId", type: "uint256", internalType: "uint256" },
            { name: "mu", type: "int256", internalType: "int256" },
            { name: "sigma", type: "uint256", internalType: "uint256" },
          ],
          outputs: [], stateMutability: "payable",
        }],
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Market Visualization</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DistributionCurve data={curveData} height={400} />
        <PayoutChart trades={previewTrades} k={k} height={400} />
      </div>

      {pastTrades.length > 0 && (
        <div className="bg-base-200 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4">Trade History ({pastTrades.length})</h3>
          <div className="overflow-x-auto">
            <table className="table table-zebra text-sm w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Prev μ</th>
                  <th>Prev σ</th>
                  <th>Trade μ</th>
                  <th>Trade σ</th>
                  <th>Collateral</th>
                  <th>Fee</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pastTrades.map(t => (
                  <tr key={t.index}>
                    <td>{t.index + 1}</td>
                    <td>{t.prevMu.toFixed(0)}</td>
                    <td>{t.prevSigma.toFixed(1)}</td>
                    <td className="font-medium">{t.tradeMu.toFixed(0)}</td>
                    <td>{t.tradeSigma.toFixed(1)}</td>
                    <td>{t.collateral.toFixed(6)} ETH</td>
                    <td>{t.feePaid.toFixed(6)} ETH</td>
                    <td>{t.claimed ? <span className="badge badge-success badge-sm">Claimed</span> :
                      <span className="badge badge-ghost badge-sm">Open</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
