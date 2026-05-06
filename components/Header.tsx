"use client";

import Link from "next/link";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth/RainbowKitCustomConnectButton";

export const Header = () => {
  return (
    <div className="sticky top-0 navbar bg-base-100 min-h-0 flex-shrink-0 justify-between z-20 shadow-md shadow-secondary px-4">
      <div className="navbar-start w-auto">
        <Link href="/" className="flex items-center gap-2 ml-2">
          <span className="font-bold text-lg">Distribution Markets</span>
        </Link>
      </div>
      <div className="navbar-end flex-grow">
        <RainbowKitCustomConnectButton />
      </div>
    </div>
  );
};
