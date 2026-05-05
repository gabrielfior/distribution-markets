const SQRT_2PI = 2.5066282746310002;
const SQRT_PI = 1.772453850905516;
const ONE_18 = 10n ** 18n;

export function normalPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const coeff = 1 / (sigma * SQRT_2PI);
  const exponent = -0.5 * ((x - mu) / sigma) ** 2;
  return coeff * Math.exp(exponent);
}

export function l2Norm(sigma: number): number {
  if (sigma <= 0) return 0;
  return 1 / Math.sqrt(2 * sigma * SQRT_PI);
}

export function computeLambda(k: number, sigma: number): number {
  const l2 = l2Norm(sigma);
  if (l2 === 0) return 0;
  return k / l2;
}

export function scaledPDF(x: number, mu: number, sigma: number, k: number): number {
  const lam = computeLambda(k, sigma);
  const p = normalPDF(x, mu, sigma);
  return lam * p;
}

export function computeKFromGaussian(b: number, sigma: number): number {
  const lam = b * sigma * SQRT_2PI;
  const l2 = l2Norm(sigma);
  return lam * l2;
}

export function sigmaMin(k: number, b: number): number {
  if (b <= 0) return 0;
  return (k * k) / (b * b * SQRT_PI);
}

export function computeCollateral(
  k: number,
  prevMu: number,
  prevSigma: number,
  tradeMu: number,
  tradeSigma: number,
  numPoints = 2000,
): number {
  const halfRange = Math.max(8 * prevSigma, 8 * tradeSigma, 5);
  const xCenter = (prevMu + tradeMu) / 2;
  const xMin = xCenter - halfRange;
  const xMax = xCenter + halfRange;
  const dx = (xMax - xMin) / numPoints;

  let minDiff = Infinity;
  for (let i = 0; i < numPoints; i++) {
    const x = xMin + i * dx;
    const f = scaledPDF(x, prevMu, prevSigma, k);
    const g = scaledPDF(x, tradeMu, tradeSigma, k);
    const diff = g - f;
    if (diff < minDiff) minDiff = diff;
  }

  return -minDiff;
}

export function computeFee(totalValue: number, sigma: number): { baseFee: number; l2Fee: number; totalFee: number } {
  const l2 = l2Norm(sigma);
  const refL2 = l2Norm(400);
  const baseFee = (totalValue * 10) / 10000;
  const l2Fee = refL2 > 0 ? (totalValue * l2 * 100) / (refL2 * 10000) : (totalValue * 100) / 10000;
  return { baseFee, l2Fee, totalFee: baseFee + l2Fee };
}

export function computeTotalToSend(desiredCollateral: number, sigma: number): { total: number; fees: number } {
  const l2 = l2Norm(sigma);
  const refL2 = l2Norm(400);
  let feeRate = 10;
  if (refL2 > 0) {
    feeRate += (l2 * 100) / refL2;
  } else {
    feeRate += 100;
  }
  const total = (desiredCollateral * 10000) / (10000 - feeRate);
  return { total, fees: total - desiredCollateral };
}

export function computePayout(
  collateral: number,
  k: number,
  prevMu: number,
  prevSigma: number,
  tradeMu: number,
  tradeSigma: number,
  outcome: number,
): number {
  const prevScaled = scaledPDF(outcome, prevMu, prevSigma, k);
  const tradeScaled = scaledPDF(outcome, tradeMu, tradeSigma, k);
  const pnl = tradeScaled - prevScaled;
  const rawPayout = collateral + pnl;
  const maxPayout = collateral * 10;
  return Math.min(Math.max(0, rawPayout), maxPayout);
}
