"use client";

import { useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

export default function Home() {
  const { address, chainId } = useAccount();
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState("");
  const [mu, setMu] = useState(3200);
  const [sigma, setSigma] = useState(400);
  const [backing, setBacking] = useState(0.01);

  const { data: marketCount } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "marketCount",
    watch: true,
  });

  const { writeContractAsync, isPending } = useWriteContract();

  const count = marketCount ? Number(marketCount) : 0;

  const handleCreate = async () => {
    if (!address || !chainId) {
      notification.error("Connect your wallet first");
      return;
    }
    if (!question) {
      notification.error("Enter a question");
      return;
    }
    try {
      const endTime = BigInt(Math.floor(Date.now() / 1000) + 14 * 24 * 3600);
      await writeContractAsync({
        address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as `0x${string}`,
        abi: [
          {
            type: "function",
            name: "createMarket",
            inputs: [
              { name: "question", type: "string", internalType: "string" },
              { name: "endTime", type: "uint256", internalType: "uint256" },
              { name: "mu", type: "int256", internalType: "int256" },
              { name: "sigma", type: "uint256", internalType: "uint256" },
            ],
            outputs: [{ name: "marketId", type: "uint256", internalType: "uint256" }],
            stateMutability: "payable",
          },
        ],
        functionName: "createMarket",
        args: [question, endTime, BigInt(mu) * BigInt(1e18), BigInt(sigma) * BigInt(1e18)],
        value: parseEther(backing.toString()),
      });
      notification.success("Market created!");
      setShowCreate(false);
    } catch (e: any) {
      notification.error(e?.shortMessage || e?.message || "Creation failed");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold mb-4">Distribution Markets</h1>
        <p className="text-lg text-base-content/80 max-w-2xl mx-auto">
          Trade your beliefs as probability distributions, not discrete buckets.
        </p>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Markets ({count})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Create Market"}
        </button>
      </div>

      {showCreate && (
        <div className="card bg-base-200 shadow-xl mb-8">
          <div className="card-body">
            <h3 className="card-title">New Market</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Question (e.g. ETH price on June 1)"
                className="input input-bordered w-full"
                value={question}
                onChange={e => setQuestion(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label"><span className="label-text">Mean (μ)</span></label>
                  <input type="number" className="input input-bordered w-full" value={mu} onChange={e => setMu(Number(e.target.value))} />
                </div>
                <div>
                  <label className="label"><span className="label-text">Std (σ)</span></label>
                  <input type="number" className="input input-bordered w-full" value={sigma} onChange={e => setSigma(Number(e.target.value))} />
                </div>
                <div>
                  <label className="label"><span className="label-text">Backing (ETH)</span></label>
                  <input type="number" step="0.001" className="input input-bordered w-full" value={backing} onChange={e => setBacking(Number(e.target.value))} />
                </div>
              </div>
              <button className="btn btn-primary w-full" onClick={handleCreate} disabled={isPending}>
                {isPending ? "Creating..." : "Create & Fund Market"}
              </button>
            </div>
          </div>
        </div>
      )}

      {count === 0 ? (
        <div className="text-center p-12 bg-base-200 rounded-lg">
          <p className="text-base-content/60">No markets yet. Create one to start trading.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {Array.from({ length: count }, (_, i) => i + 1).map(id => (
            <MarketListItem key={id} marketId={id} />
          ))}
        </div>
      )}

      <div className="mt-12 p-6 bg-base-200 rounded-lg max-w-3xl mx-auto">
        <h2 className="text-xl font-bold mb-4 text-center">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-center">
          <div>
            <div className="font-semibold mb-1">1. Set your prediction</div>
            <p className="text-base-content/70">Drag μ (expected price) and σ (confidence) to match your belief.</p>
          </div>
          <div>
            <div className="font-semibold mb-1">2. Stake ETH</div>
            <p className="text-base-content/70">Pay collateral + fee to express your distribution.</p>
          </div>
          <div>
            <div className="font-semibold mb-1">3. Profit if right</div>
            <p className="text-base-content/70">
              Payout depends on how well your predicted shape matches the actual outcome.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketListItem({ marketId }: { marketId: number }) {
  const { data: marketData } = useScaffoldReadContract({
    contractName: "DistributionMarket",
    functionName: "getMarketSimple",
    args: [BigInt(marketId)],
  });

  if (!marketData) return null;

  const mu = Number(marketData[0]) / 1e18;
  const sigma = Number(marketData[1]) / 1e18;
  const b = Number(marketData[2]) / 1e18;
  const resolved = marketData[4];
  const resolvedOutcome = Number(marketData[5]) / 1e18;

  return (
    <Link href={`/trade/${marketId}`} className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="card-title text-lg">Market #{marketId}</h3>
            <p className="text-sm text-base-content/70">
              μ={mu.toLocaleString()}, σ={sigma.toLocaleString()}, b={b.toFixed(4)} ETH
            </p>
          </div>
          {resolved ? (
            <span className="badge badge-success">Resolved</span>
          ) : (
            <span className="badge badge-info">Active</span>
          )}
        </div>
        <div className="card-actions justify-end mt-2">
          <span className="btn btn-primary btn-sm">Trade</span>
        </div>
      </div>
    </Link>
  );
}
