"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import TradingInterface from "../../components/TradingInterface";

const ETH_MARKET = { id: "1", question: "ETH price on May 1, 2026", marketMu: 3200, marketSigma: 400 };

export default function TradePage() {
  const params = useParams();
  const marketId = params.id as string;

  if (marketId !== "1") {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Market not found</h1>
        <Link href="/" className="btn btn-primary mt-4">
          Back to Market
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/" className="text-sm text-base-content/60 hover:text-primary mb-4 inline-block">
        ← Back to market
      </Link>
      <h1 className="text-3xl font-bold mb-2">{ETH_MARKET.question}</h1>
      <p className="text-base-content/70 mb-8">
        Drag the sliders to set your prediction. The green dashed curve shows your belief vs. the market consensus.
      </p>
      <TradingInterface market={ETH_MARKET} />
    </div>
  );
}
