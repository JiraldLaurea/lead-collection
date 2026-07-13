import { prisma } from "@/lib/prisma";
import { defaultChainThresholds, type ChainThresholds } from "@/lib/sme/classify";
import { defaultScoreWeights, type ScoreWeights } from "@/lib/sme/score";

export const scoreWeightsSettingKey = "sme_score_weights";
export const chainThresholdsSettingKey = "sme_chain_thresholds";

export type SmeSettings = {
  weights: ScoreWeights;
  thresholds: ChainThresholds;
};

/**
 * Scoring weights and chain thresholds live in the database, not in code: the work order
 * requires an administrator to change them without a deployment.
 */
export async function getSmeSettings(): Promise<SmeSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [scoreWeightsSettingKey, chainThresholdsSettingKey] } }
  });
  const valueOf = (key: string) => rows.find((row) => row.key === key)?.value;

  return {
    weights: parseWeights(valueOf(scoreWeightsSettingKey)),
    thresholds: parseThresholds(valueOf(chainThresholdsSettingKey))
  };
}

export async function saveSmeSettings(input: SmeSettings) {
  const weights = normalizeWeights(input.weights);
  const thresholds = normalizeThresholds(input.thresholds);

  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: scoreWeightsSettingKey },
      create: { key: scoreWeightsSettingKey, value: JSON.stringify(weights) },
      update: { value: JSON.stringify(weights) }
    }),
    prisma.appSetting.upsert({
      where: { key: chainThresholdsSettingKey },
      create: { key: chainThresholdsSettingKey, value: JSON.stringify(thresholds) },
      update: { value: JSON.stringify(thresholds) }
    })
  ]);

  return { weights, thresholds };
}

export function parseWeights(value?: string | null): ScoreWeights {
  if (!value) return defaultScoreWeights;
  try {
    return normalizeWeights({ ...defaultScoreWeights, ...(JSON.parse(value) as Partial<ScoreWeights>) });
  } catch {
    return defaultScoreWeights;
  }
}

export function parseThresholds(value?: string | null): ChainThresholds {
  if (!value) return defaultChainThresholds;
  try {
    return normalizeThresholds({ ...defaultChainThresholds, ...(JSON.parse(value) as Partial<ChainThresholds>) });
  } catch {
    return defaultChainThresholds;
  }
}

/** Clamped so a bad value cannot produce a score above 100 or a negative factor. */
export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return {
    smeConfidence: clamp(weights.smeConfidence),
    marketingNeed: clamp(weights.marketingNeed),
    businessPotential: clamp(weights.businessPotential),
    contactAvailability: clamp(weights.contactAvailability),
    areaValue: clamp(weights.areaValue)
  };
}

export function weightsTotal(weights: ScoreWeights) {
  return (
    weights.smeConfidence +
    weights.marketingNeed +
    weights.businessPotential +
    weights.contactAvailability +
    weights.areaValue
  );
}

export function normalizeThresholds(thresholds: ChainThresholds): ChainThresholds {
  const localChainMax = Math.max(1, Math.min(50, Math.round(Number(thresholds.localChainMax) || 5)));
  const manualReviewMax = Math.max(
    // Manual review must start above the local-chain ceiling, or the band vanishes.
    localChainMax,
    Math.min(100, Math.round(Number(thresholds.manualReviewMax) || 9))
  );
  return { localChainMax, manualReviewMax };
}
