"use client";

import MarketCard from "./components/MarketCard";

const MOCK_MARKETS = [
  {
    id: "1",
    question: "ETH price on May 1, 2026",
    endDate: "2026-05-01",
    marketMu: 3200,
    marketSigma: 400,
    currentPrice: 3150,
  },
  {
    id: "2",
    question: "BTC price on May 1, 2026",
    endDate: "2026-05-01",
    marketMu: 98000,
    marketSigma: 12000,
    currentPrice: 96500,
  },
  {
    id: "3",
    question: "SOL price on June 1, 2026",
    endDate: "2026-06-01",
    marketMu: 145,
    marketSigma: 25,
    currentPrice: 142,
  },
];

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-10">
        <h1 className="text-4xl font-bold mb-4">Distribution Markets</h1>
        <p className="text-lg text-base-content/80 max-w-2xl">
          Trade your beliefs as probability distributions, not discrete buckets. Express where you think the price will
          land <em>and</em> how confident you are.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_MARKETS.map(market => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>

      <div className="mt-12 p-6 bg-base-200 rounded-lg">
        <h2 className="text-xl font-bold mb-3">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-semibold mb-1">1. Pick a market</div>
            <p className="text-base-content/70">Choose a prediction market for a future price or event.</p>
          </div>
          <div>
            <div className="font-semibold mb-1">2. Set your distribution</div>
            <p className="text-base-content/70">Drag μ (expected value) and σ (confidence) to match your belief.</p>
          </div>
          <div>
            <div className="font-semibold mb-1">3. Trade</div>
            <p className="text-base-content/70">
              Pay to move the market consensus toward your prediction. Profit if you&apos;re right.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
