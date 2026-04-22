"use client";

import Link from "next/link";
import DistributionCurve from "./DistributionCurve";

interface Market {
  id: string;
  question: string;
  endDate: string;
  marketMu: number;
  marketSigma: number;
  currentPrice?: number;
}

export default function MarketCard({ market }: { market: Market }) {
  return (
    <div className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div className="card-body">
        <h2 className="card-title text-lg">{market.question}</h2>
        <p className="text-sm text-base-content/70">Resolves: {new Date(market.endDate).toLocaleDateString()}</p>
        <div className="my-2">
          <div className="flex justify-between text-xs text-base-content/60 mb-1">
            <span>Market consensus</span>
            <span>
              μ={market.marketMu.toLocaleString()}, σ={market.marketSigma.toLocaleString()}
            </span>
          </div>
          <DistributionCurve
            marketMu={market.marketMu}
            marketSigma={market.marketSigma}
            actualPrice={market.currentPrice}
            height={180}
          />
        </div>
        <div className="card-actions justify-end mt-2">
          <Link href={`/trade/${market.id}`} className="btn btn-primary btn-sm">
            Explore
          </Link>
        </div>
      </div>
    </div>
  );
}
