"use client";

import MarketCard from "./components/MarketCard";

const ETH_MARKET = {
  id: "1",
  question: "ETH price on May 1, 2026",
  endDate: "2026-05-01",
  marketMu: 3200,
  marketSigma: 400,
  currentPrice: 3150,
};

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold mb-4">Distribution Markets</h1>
        <p className="text-lg text-base-content/80 max-w-2xl mx-auto">
          Trade your beliefs as probability distributions, not discrete buckets. Express where you think the price will
          land <em>and</em> how confident you are.
        </p>
      </div>

      <div className="max-w-xl mx-auto">
        <MarketCard market={ETH_MARKET} />
      </div>

      <div className="mt-12 p-6 bg-base-200 rounded-lg max-w-3xl mx-auto">
        <h2 className="text-xl font-bold mb-4 text-center">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-center">
          <div>
            <div className="font-semibold mb-1">1. Set your prediction</div>
            <p className="text-base-content/70">Drag μ (expected price) and σ (confidence) to match your belief.</p>
          </div>
          <div>
            <div className="font-semibold mb-1">2. Stake ETH</div>
            <p className="text-base-content/70">Pay to express your distribution. Narrower confidence costs more.</p>
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
