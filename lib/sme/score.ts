import type { Classification } from "@/lib/sme/classify";
import { brandDomain } from "@/lib/sme/shared-domains";

/** Bumped whenever the model changes, so an old score is never confused with a new one. */
export const scoreModelVersion = "v1";

export type ScoreWeights = {
  smeConfidence: number;
  marketingNeed: number;
  businessPotential: number;
  contactAvailability: number;
  areaValue: number;
};

export const defaultScoreWeights: ScoreWeights = {
  smeConfidence: 25,
  marketingNeed: 25,
  businessPotential: 20,
  contactAvailability: 20,
  areaValue: 10
};

export type ScoreBand = "S" | "A" | "B" | "C" | "LOW";

export type ScoreFactor = {
  key: keyof ScoreWeights;
  label: string;
  points: number;
  max: number;
  /**
   * True when we have no evidence either way. The work order is explicit: missing evidence
   * must remain unknown, not negative. We never claim a business has a weak social presence
   * when the truth is that we never looked.
   */
  unknown: boolean;
  evidence: string[];
};

export type LeadScore = {
  version: string;
  total: number;
  band: ScoreBand;
  factors: ScoreFactor[];
};

export type ScoreInput = {
  classification: Classification;
  phoneNumber: string | null;
  websiteUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** Priority of the commercial zone this came from, when the search was zone-driven. */
  zonePriority?: string | null;
  /** Priority of the internal category (A/B/C). */
  categoryPriority?: string | null;
};

export function scoreBand(total: number): ScoreBand {
  if (total >= 80) return "S";
  if (total >= 65) return "A";
  if (total >= 50) return "B";
  if (total >= 35) return "C";
  return "LOW";
}

/** Classes that are not prospects at all, so a lead score would be misleading. */
const unscorableClasses = new Set(["FRANCHISE_EXCLUDED", "LARGE_CHAIN", "MANUAL_EXCLUDE"]);

export function scoreLead(input: ScoreInput, weights: ScoreWeights = defaultScoreWeights): LeadScore {
  const factors: ScoreFactor[] = [
    scoreSmeConfidence(input, weights.smeConfidence),
    scoreMarketingNeed(input, weights.marketingNeed),
    scoreBusinessPotential(input, weights.businessPotential),
    scoreContactAvailability(input, weights.contactAvailability),
    scoreAreaValue(input, weights.areaValue)
  ];

  // An excluded franchise still has a phone, a good rating and an A-priority category, so the
  // remaining factors would happily add up to a respectable score — and a Starbucks branch
  // would sit in the table wearing a "B" badge as if it were a prospect worth calling. It is
  // not a lead, so it does not get a lead score.
  const excluded = unscorableClasses.has(input.classification.effectiveClass);
  if (excluded) {
    return {
      version: scoreModelVersion,
      total: 0,
      band: "LOW",
      factors: factors.map((factor) => ({
        ...factor,
        points: 0,
        evidence:
          factor.key === "smeConfidence"
            ? [
                ...factor.evidence,
                "Not a prospect, so no lead score is calculated. Override the classification if this is wrong."
              ]
            : factor.evidence
      }))
    };
  }

  const total = Math.round(factors.reduce((sum, factor) => sum + factor.points, 0));

  return { version: scoreModelVersion, total, band: scoreBand(total), factors };
}

function scoreSmeConfidence(input: ScoreInput, max: number): ScoreFactor {
  const { effectiveClass, confidence } = input.classification;
  const evidence: string[] = [];

  // A franchise is not a prospect at all; a chain under review is not yet one.
  const classMultiplier =
    effectiveClass === "INDEPENDENT_SME" || effectiveClass === "MANUAL_INCLUDE"
      ? 1
      : effectiveClass === "LOCAL_SME_CHAIN"
        ? 0.95 // a local chain has budget and repeat needs: nearly as attractive
        : effectiveClass === "MANUAL_REVIEW"
          ? 0.4
          : 0;

  evidence.push(`Classified ${effectiveClass} with ${confidence}% confidence.`);
  if (effectiveClass === "LOCAL_SME_CHAIN") {
    evidence.push("A locally controlled multi-branch business is a high-value prospect.");
  }

  const points = max * classMultiplier * (confidence / 100);
  return { key: "smeConfidence", label: "SME confidence", points, max, unknown: false, evidence };
}

/**
 * Marketing need, scored ONLY from what we independently observed.
 *
 * We do not have social-media data, so we never assert "Instagram inactive" or "posts
 * rarely". The one thing Google does tell us is whether a business publishes a real website
 * — and in Metro Manila, a business whose only web presence is a Facebook page is a genuine
 * digital-marketing prospect, not a weak lead.
 */
function scoreMarketingNeed(input: ScoreInput, max: number): ScoreFactor {
  const evidence: string[] = [];
  const host = hostOf(input.websiteUrl);
  const owned = brandDomain(host);

  if (!input.websiteUrl) {
    evidence.push("No website of any kind is listed. Strong need for a web presence.");
    return { key: "marketingNeed", label: "Marketing need", points: max, max, unknown: false, evidence };
  }

  if (!owned) {
    evidence.push(
      `Only a social or platform page (${host}) is listed, not an owned website. Clear need for a site and conversion tools.`
    );
    return { key: "marketingNeed", label: "Marketing need", points: max * 0.8, max, unknown: false, evidence };
  }

  evidence.push(`Publishes an owned website (${owned}).`);
  evidence.push(
    "Social activity, content quality and booking flow have NOT been assessed — that requires evidence we do not collect, so this factor is capped rather than assumed strong."
  );
  // Not zero: an owned site does not mean the marketing is good. It means we cannot tell.
  return { key: "marketingNeed", label: "Marketing need", points: max * 0.35, max, unknown: true, evidence };
}

function scoreBusinessPotential(input: ScoreInput, max: number): ScoreFactor {
  const evidence: string[] = [];
  let score = 0;
  let weighted = 0;

  const categoryPriority = input.categoryPriority?.toUpperCase();
  if (categoryPriority) {
    const categoryScore = categoryPriority === "A" ? 1 : categoryPriority === "B" ? 0.6 : 0.3;
    score += categoryScore * 0.4;
    weighted += 0.4;
    evidence.push(`Category is priority ${categoryPriority}.`);
  }

  // Review count is the only activity signal Google gives us cheaply. Treat it as a proxy
  // for footfall, not for revenue.
  if (input.reviewCount !== null) {
    const reviews = input.reviewCount;
    const activity = reviews >= 200 ? 1 : reviews >= 50 ? 0.75 : reviews >= 10 ? 0.5 : 0.25;
    score += activity * 0.4;
    weighted += 0.4;
    evidence.push(`${reviews} Google reviews suggests ${reviews >= 50 ? "steady" : "modest"} customer activity.`);
  }

  if (input.rating !== null) {
    const rating = Math.max(0, Math.min(5, input.rating));
    score += (rating / 5) * 0.2;
    weighted += 0.2;
    evidence.push(`Rated ${rating} on Google.`);
  }

  const branchCount = input.classification.branchCount;
  if (branchCount > 1) {
    evidence.push(`${branchCount} observed locations: more budget and repeatable marketing needs.`);
  }

  if (weighted === 0) {
    evidence.push("No activity signals available.");
    return { key: "businessPotential", label: "Business potential", points: 0, max, unknown: true, evidence };
  }

  const normalized = score / weighted;
  const branchBonus = branchCount >= 2 && branchCount <= 5 ? 1.1 : 1;
  const points = Math.min(max, max * normalized * branchBonus);

  return { key: "businessPotential", label: "Business potential", points, max, unknown: false, evidence };
}

function scoreContactAvailability(input: ScoreInput, max: number): ScoreFactor {
  const evidence: string[] = [];
  let points = 0;

  if (input.phoneNumber) {
    // A phone number is what makes a lead actionable for this app: it is the SMS channel.
    points += max * 0.7;
    evidence.push("A public phone number is available.");
  } else {
    evidence.push("No phone number published — cannot be contacted by SMS.");
  }

  if (input.websiteUrl) {
    points += max * 0.3;
    evidence.push("A website or social page provides a second contact channel.");
  }

  return {
    key: "contactAvailability",
    label: "Contact availability",
    points,
    max,
    unknown: false,
    evidence
  };
}

function scoreAreaValue(input: ScoreInput, max: number): ScoreFactor {
  const priority = input.zonePriority?.toUpperCase();
  if (!priority) {
    return {
      key: "areaValue",
      label: "Commercial area value",
      points: 0,
      max,
      unknown: true,
      evidence: ["Not searched from a configured commercial zone, so area value is unknown."]
    };
  }

  const values: Record<string, number> = { "A+": 1, A: 0.85, "B+": 0.7, B: 0.55, C: 0.35 };
  const value = values[priority] ?? 0.5;

  return {
    key: "areaValue",
    label: "Commercial area value",
    points: max * value,
    max,
    unknown: false,
    evidence: [`Commercial zone priority ${priority}.`]
  };
}

function hostOf(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
