import { normalizePhilippineMobileNumber } from "@/lib/export";
import { prisma } from "@/lib/prisma";
import type { Classification, ClassificationReason, SmeClass } from "@/lib/sme/classify";
import { normalizeWebsiteHost, splitBusinessName } from "@/lib/sme/normalize-name";
import type { SmeSearchResult } from "@/lib/sme/run-search";
import type { LeadScore, ScoreBand, ScoreFactor } from "@/lib/sme/score";

/**
 * A search result is retained independently of the ordinary Lead list. This lets the SME
 * workspace survive refreshes while keeping lead creation an explicit outreach decision.
 */
export async function persistSmeSearchResults(results: SmeSearchResult[], sourceQuery: string) {
  for (const result of results) {
    const { normalizedName, brandCandidateName, branchLabel } = splitBusinessName(result.displayName);
    const profile = await prisma.smeBusinessProfile.upsert({
      where: { providerPlaceId: result.providerPlaceId },
      create: {
        providerPlaceId: result.providerPlaceId,
        displayName: result.displayName,
        normalizedName,
        brandCandidateName,
        branchLabel,
        primaryType: result.primaryType,
        formattedAddress: result.formattedAddress,
        latitude: result.latitude,
        longitude: result.longitude,
        phoneNumber: result.phoneNumber,
        websiteUrl: result.websiteUrl,
        websiteHost: normalizeWebsiteHost(result.websiteUrl),
        rating: result.rating,
        reviewCount: result.reviewCount,
        businessStatus: result.businessStatus,
        googleMapsUrl: result.googleMapsUri,
        detailsFetched: true,
        sourceQuery,
        collectedAt: new Date(),
        lastFetchedAt: new Date()
      },
      update: {
        displayName: result.displayName,
        normalizedName,
        brandCandidateName,
        branchLabel,
        primaryType: result.primaryType,
        formattedAddress: result.formattedAddress,
        latitude: result.latitude,
        longitude: result.longitude,
        phoneNumber: result.phoneNumber,
        websiteUrl: result.websiteUrl,
        websiteHost: normalizeWebsiteHost(result.websiteUrl),
        rating: result.rating,
        reviewCount: result.reviewCount,
        businessStatus: result.businessStatus,
        googleMapsUrl: result.googleMapsUri,
        detailsFetched: true,
        sourceQuery,
        collectedAt: new Date(),
        lastFetchedAt: new Date()
      }
    });

    await prisma.smePlaceReference.upsert({
      where: { providerPlaceId: result.providerPlaceId },
      create: { providerPlaceId: result.providerPlaceId, sourceQuery, lastFetchedAt: new Date() },
      update: { sourceQuery, lastFetchedAt: new Date() }
    });

    await prisma.smeClassification.upsert({
      where: { businessId: profile.id },
      create: {
        businessId: profile.id,
        autoClass: result.classification.autoClass,
        effectiveClass: result.classification.effectiveClass,
        confidence: result.classification.confidence,
        reasonCodes: JSON.stringify(result.classification.reasons),
        branchCount: result.classification.branchCount,
        matchedBrandId: result.classification.matchedBrandId
      },
      update: {
        // Preserve a human override while refreshing the automatic assessment and evidence.
        autoClass: result.classification.autoClass,
        confidence: result.classification.confidence,
        reasonCodes: JSON.stringify(result.classification.reasons),
        branchCount: result.classification.branchCount,
        matchedBrandId: result.classification.matchedBrandId
      }
    });

    await prisma.smeLeadScore.create({
      data: {
        businessId: profile.id,
        version: result.score.version,
        total: result.score.total,
        band: result.score.band,
        factors: JSON.stringify(result.score.factors)
      }
    });
  }
}

/** The latest captured SME results shown when the workspace is reopened. */
export async function getRecentPersistedSmeResults(limit = 100): Promise<SmeSearchResult[]> {
  const profiles = await prisma.smeBusinessProfile.findMany({
    orderBy: { collectedAt: "desc" },
    take: limit,
    include: {
      lead: { select: { id: true, email: true, smsLogs: { select: { id: true }, take: 1 }, emailLogs: { select: { id: true }, take: 1 } } },
      classification: true,
      scores: { orderBy: { calculatedAt: "desc" }, take: 1 }
    }
  });
  const suppressed = await prisma.doNotContact.findMany({
    where: { channel: "sms", active: true },
    select: { normalizedContact: true }
  });
  const suppressedPhones = new Set(suppressed.map((item) => item.normalizedContact));

  return profiles.flatMap((profile) => {
    const classification = profile.classification;
    const score = profile.scores[0];
    if (!classification || !score) return [];

    const phone = normalizePhilippineMobileNumber(profile.phoneNumber);
    return [{
      providerPlaceId: profile.providerPlaceId,
      displayName: profile.displayName,
      primaryType: profile.primaryType,
      formattedAddress: profile.formattedAddress,
      latitude: profile.latitude,
      longitude: profile.longitude,
      phoneNumber: profile.phoneNumber,
      websiteUrl: profile.websiteUrl,
      websiteHost: profile.websiteHost,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
      businessStatus: profile.businessStatus,
      googleMapsUri: profile.googleMapsUrl,
      email: profile.email ?? profile.lead?.email ?? null,
      classification: {
        autoClass: classification.autoClass as SmeClass,
        effectiveClass: classification.effectiveClass as SmeClass,
        confidence: classification.confidence,
        reasons: parseJson<ClassificationReason[]>(classification.reasonCodes, []),
        branchCount: classification.branchCount ?? 1,
        matchedBrandId: classification.matchedBrandId,
        matchedBrandName: null
      } satisfies Classification,
      score: {
        version: score.version,
        total: score.total,
        band: parseScoreBand(score.band),
        factors: parseJson<ScoreFactor[]>(score.factors, [])
      } satisfies LeadScore,
      savedLeadId: profile.leadId,
      alreadyContacted: Boolean(profile.lead && (profile.lead.smsLogs.length > 0 || profile.lead.emailLogs.length > 0)),
      doNotContact: Boolean(phone && suppressedPhones.has(phone))
    } satisfies SmeSearchResult];
  });
}

function parseJson<T>(value: string, fallback: T) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseScoreBand(value: string): ScoreBand {
  return ["S", "A", "B", "C", "LOW"].includes(value) ? value as ScoreBand : "LOW";
}
