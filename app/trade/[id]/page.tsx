"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import TradingInterface from "../../components/TradingInterface";

export default function TradePage() {
  const params = useParams();
  const marketId = params.id as string;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/" className="text-sm text-base-content/60 hover:text-primary mb-4 inline-block">
        ← Back to markets
      </Link>
      <h1 className="text-3xl font-bold mb-2">Market #{marketId}</h1>
      <p className="text-base-content/70 mb-8">
        Set your prediction and trade against the current market distribution.
      </p>
      <TradingInterface marketId={marketId} />
    </div>
  );
}
