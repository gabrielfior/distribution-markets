"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import TradingInterface from "../../components/TradingInterface";

const MOCK_MARKETS: Record<string, { id: string; question: string; marketMu: number; marketSigma: number }> = {
  "1": { id: "1", question: "ETH price on May 1, 2026", marketMu: 3200, marketSigma: 400 },
  "2": { id: "2", question: "BTC price on May 1, 2026", marketMu: 98000, marketSigma: 12000 },
  "3": { id: "3", question: "SOL price on June 1, 2026", marketMu: 145, marketSigma: 25 },
};

export default function TradePage() {
  const params = useParams();
  const market = MOCK_MARKETS[params.id as string];

  if (!market) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Market not found</h1>
        <Link href="/" className="btn btn-primary mt-4">
          Back to Markets
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/" className="text-sm text-base-content/60 hover:text-primary mb-4 inline-block">
        ← Back to markets
      </Link>
      <h1 className="text-3xl font-bold mb-2">{market.question}</h1>
      <p className="text-base-content/70 mb-8">
        Drag the sliders to set your prediction. The green dashed curve shows your belief vs. the market consensus.
      </p>
      <TradingInterface market={market} />
    </div>
  );
}
