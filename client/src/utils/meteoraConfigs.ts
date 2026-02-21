import { PublicKey } from "@solana/web3.js";

interface StaticConfig {
  index: number;
  baseFeeValue: number;
  collectFeeMode: number;
  dynamicFee: boolean;
  configAccount: string;
}

const STATIC_CONFIGS: StaticConfig[] = [
  { index: 0, baseFeeValue: 2500000, collectFeeMode: 0, dynamicFee: true, configAccount: "8CNy9goNQNLM4wtgRw528tUQGMKD3vSuFRZY2gLGLLvF" },
  { index: 1, baseFeeValue: 2500000, collectFeeMode: 1, dynamicFee: true, configAccount: "82p7sVzQWZfCrmStPhsG8BYKwheQkUiXSs2wiqdhwNxr" },
  { index: 2, baseFeeValue: 2500000, collectFeeMode: 0, dynamicFee: false, configAccount: "FzvMYBQ29z2J21QPsABpJYYxQBEKGsxA6w6J2HYceFj8" },
  { index: 3, baseFeeValue: 2500000, collectFeeMode: 1, dynamicFee: false, configAccount: "EQbqYxecZuJsVt6g5QbKTWpNWa3QyWQE5NWz5AZBAiNv" },
  { index: 4, baseFeeValue: 3000000, collectFeeMode: 0, dynamicFee: true, configAccount: "9RuAyDH81GB9dhks6MzHva2objQJxHvqRRfyKKdfmkxk" },
  { index: 5, baseFeeValue: 3000000, collectFeeMode: 1, dynamicFee: true, configAccount: "GqRo1PG5KZc4QqZn1RCcnEGC8E7yRscHaW1fQp9St9Lz" },
  { index: 6, baseFeeValue: 3000000, collectFeeMode: 0, dynamicFee: false, configAccount: "3KLdspUofc75aaEAJdBo1o6D6cyzXJVtGB8PgpWJEiaR" },
  { index: 7, baseFeeValue: 3000000, collectFeeMode: 1, dynamicFee: false, configAccount: "9xKsCsiv8eeBohobb8Z1snLZzVKKATGqmY69vJHyCzvu" },
  { index: 8, baseFeeValue: 10000000, collectFeeMode: 0, dynamicFee: true, configAccount: "EVRn9bAekgZsVVAHt25AUjA7qpKh4ac7uUMpoSGqgS5U" },
  { index: 9, baseFeeValue: 10000000, collectFeeMode: 1, dynamicFee: true, configAccount: "7BJfgt3ahTtCfXkPMRbS6YneR92JuwsU1dyayhmNBL11" },
  { index: 10, baseFeeValue: 10000000, collectFeeMode: 0, dynamicFee: false, configAccount: "GXZLjqmebpsy74vqTD6DqSTugTKVwoTi8fZwLAXBsMNN" },
  { index: 11, baseFeeValue: 10000000, collectFeeMode: 1, dynamicFee: false, configAccount: "AeLtDKgw3XnXbr3Kgfbcb7KiZULVCQ5mXaFDiG9n7EgW" },
  { index: 12, baseFeeValue: 20000000, collectFeeMode: 0, dynamicFee: true, configAccount: "G8pJy5Hsxeko5srUxDUF6cpuPJ3r53MbMucbpLhNC8NU" },
  { index: 13, baseFeeValue: 20000000, collectFeeMode: 1, dynamicFee: true, configAccount: "BcgnWGkrvEQm4hChY6R4wDuwshsvmnnh1Hmzvrm7M8FQ" },
  { index: 14, baseFeeValue: 20000000, collectFeeMode: 0, dynamicFee: false, configAccount: "HdqGCsprdhmgqaCXjJzGnKib2SGQvmT9XKYmR7ZjMqmi" },
  { index: 15, baseFeeValue: 20000000, collectFeeMode: 1, dynamicFee: false, configAccount: "HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU" },
  { index: 16, baseFeeValue: 40000000, collectFeeMode: 0, dynamicFee: true, configAccount: "Gjsr13rp68pMXrpwekfygphynT1hjRzbLLQLHTeQNfQq" },
  { index: 17, baseFeeValue: 40000000, collectFeeMode: 1, dynamicFee: true, configAccount: "BjJKkSVvDiMt6qM9vc5MAtFHTxpaYTbgrD6KuwUQhj7u" },
  { index: 18, baseFeeValue: 40000000, collectFeeMode: 0, dynamicFee: false, configAccount: "FivzJShpkDj7tdLv6hYSyLcZEAF2FsqNfw8W8mPc8op2" },
  { index: 19, baseFeeValue: 40000000, collectFeeMode: 1, dynamicFee: false, configAccount: "DT1PBa3RRvd2GDjKuMJHrcyrus7cM5oqL3eY6tR63uUk" },
  { index: 20, baseFeeValue: 60000000, collectFeeMode: 0, dynamicFee: true, configAccount: "5UMffQ4jEJgjS2rFoyTWNyh3Xf3ek3LFPyr89RfYQRbu" },
  { index: 21, baseFeeValue: 60000000, collectFeeMode: 1, dynamicFee: true, configAccount: "7y8Y3kuKphxBoyesTaKV2WQLtu884zhVCDtxqrCP4HWv" },
  { index: 22, baseFeeValue: 60000000, collectFeeMode: 0, dynamicFee: false, configAccount: "9YmoetVvZx1vrfJ9fD8X5YG3FQXREK6ZiPzRghP33Wbf" },
  { index: 23, baseFeeValue: 60000000, collectFeeMode: 1, dynamicFee: false, configAccount: "Ha2bAcxbLrFr5RiugBgeJVLx1JE7gq16rzAuqUED1v3f" },
];

const BPS_TO_BASE_FEE: Record<number, number> = {
  25: 2500000,
  30: 3000000,
  100: 10000000,
  200: 20000000,
  400: 40000000,
  600: 60000000,
};

const VALID_BASE_FEES = [2500000, 3000000, 10000000, 20000000, 40000000, 60000000];

function closestBaseFee(bps: number): number {
  const target = bps * 100000;
  let best = VALID_BASE_FEES[0];
  let bestDiff = Math.abs(target - best);
  for (const bf of VALID_BASE_FEES) {
    const diff = Math.abs(target - bf);
    if (diff < bestDiff) {
      best = bf;
      bestDiff = diff;
    }
  }
  return best;
}

function normalizeCollectFeeMode(mode: number): number {
  return mode === 0 ? 0 : 1;
}

export function selectStaticConfig(
  collectFeeMode: number,
  enableDynamicFee: boolean,
  startingFeeBps: number,
): PublicKey {
  const normalizedMode = normalizeCollectFeeMode(collectFeeMode);
  const baseFee = BPS_TO_BASE_FEE[startingFeeBps] || closestBaseFee(startingFeeBps);

  const match = STATIC_CONFIGS.find(
    (c) =>
      c.baseFeeValue === baseFee &&
      c.collectFeeMode === normalizedMode &&
      c.dynamicFee === enableDynamicFee
  );

  if (match) {
    return new PublicKey(match.configAccount);
  }

  const fallback = STATIC_CONFIGS.find(
    (c) =>
      c.collectFeeMode === normalizedMode &&
      c.dynamicFee === enableDynamicFee
  );

  return new PublicKey(fallback?.configAccount || STATIC_CONFIGS[0].configAccount);
}

export function getAllMatchingConfigs(
  collectFeeMode: number,
  enableDynamicFee: boolean,
): PublicKey[] {
  const normalizedMode = normalizeCollectFeeMode(collectFeeMode);
  return STATIC_CONFIGS
    .filter((c) => c.collectFeeMode === normalizedMode && c.dynamicFee === enableDynamicFee)
    .map((c) => new PublicKey(c.configAccount));
}
