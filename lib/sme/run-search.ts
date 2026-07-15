import { normalizePhilippineMobileNumber } from "@/lib/export";
import { prisma } from "@/lib/prisma";
import { findSmeCategory } from "@/lib/sme/categories";
import { classifyCandidates, type Classification } from "@/lib/sme/classify";
import { loadFranchiseRules, loadPriorBranchCounts } from "@/lib/sme/classification-store";
import { dedupeCandidates, type ReviewMatch } from "@/lib/sme/dedupe";
import { placeDetails } from "@/lib/sme/google-places";
import { toLeadPlaceId } from "@/lib/sme/lead-link";
import { normalizeWebsiteHost } from "@/lib/sme/normalize-name";
import { scoreLead, type LeadScore } from "@/lib/sme/score";
import { runDiscovery } from "@/lib/sme/search";
import { getSmeSettings } from "@/lib/sme/settings";
import { persistSmeSearchResults } from "@/lib/sme/persist-results";
import type { BusinessCandidate, SearchFilters, SearchRequest, SearchRunSummary } from "@/lib/sme/types";

export type SmeSearchResult = {
  providerPlaceId: string;
  displayName: string;
  primaryType: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  phoneNumber: string | null;
  websiteUrl: string | null;
  websiteHost: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  googleMapsUri: string | null;
  /** Available only after this SME result has been explicitly saved as a Lead. */
  email?: string | null;
  classification: Classification;
  score: LeadScore;
  /** Set when this business is already saved as a lead. */
  savedLeadId: number | null;
  alreadyContacted: boolean;
  doNotContact: boolean;
};

export type SmeSearchRunResult = {
  searchRunId: number;
  summary: SearchRunSummary;
  results: SmeSearchResult[];
  needsReview: ReviewMatch[];
};

export async function runSmeSearch(
  request: SearchRequest,
  filters: SearchFilters = {},
  options: { signal?: AbortSignal } = {}
): Promise<SmeSearchRunResult> {
  const run = await prisma.smeSearchRun.create({
    data: {
      mode: request.mode,
      parameters: JSON.stringify({ ...request, filters }),
      status: "RUNNING",
      startedAt: new Date()
    }
  });

  try {
    const discovered = await runDiscovery(request, options);
    const { unique, needsReview } = dedupeCandidates(discovered);
    const rules = await loadFranchiseRules();
    const settings = await getSmeSettings();

    // Screen franchises on the discovery data alone. Google bills per request, so we must
    // not pay for the contact details of a McDonald's we are about to throw away.
    const screening = classifyCandidates(unique, rules, { thresholds: settings.thresholds });
    const survivors = unique.filter(
      (candidate) => screening.get(candidate.providerPlaceId)?.effectiveClass !== "FRANCHISE_EXCLUDED"
    );

    // Contact stage: only for businesses that survived screening.
    const detailed: BusinessCandidate[] = [];
    for (const candidate of survivors) {
      try {
        detailed.push(await placeDetails(candidate.providerPlaceId, options));
      } catch {
        // A single failed detail lookup must not lose the whole run: keep the base record.
        detailed.push(candidate);
      }
    }

    // Re-classify with the fuller picture: website domains and prior branch counts are only
    // available now, and both can change a verdict.
    const priorBranchCounts = await loadPriorBranchCounts(detailed);
    const classified = classifyCandidates(detailed, rules, {
      priorBranchCounts,
      thresholds: settings.thresholds
    });

    const excluded = unique.filter(
      (candidate) => screening.get(candidate.providerPlaceId)?.effectiveClass === "FRANCHISE_EXCLUDED"
    );

    const scoreContext = {
      weights: settings.weights,
      zonePriority: request.zonePriority ?? null,
      categoryPriority: findSmeCategory(request.category)?.priority ?? null
    };

    const all: SmeSearchResult[] = [
      ...(await toResults(detailed, classified, scoreContext)),
      ...(await toResults(excluded, screening, scoreContext))
    ];

    const filtered = all.filter((result) => matchesFilters(result, filters));

    const summary: SearchRunSummary = {
      total: all.length,
      qualified: filtered.filter((result) =>
        ["INDEPENDENT_SME", "LOCAL_SME_CHAIN", "MANUAL_INCLUDE"].includes(result.classification.effectiveClass)
      ).length,
      manualReview: filtered.filter((result) => result.classification.effectiveClass === "MANUAL_REVIEW").length,
      excluded: all.filter((result) =>
        ["FRANCHISE_EXCLUDED", "LARGE_CHAIN", "MANUAL_EXCLUDE"].includes(result.classification.effectiveClass)
      ).length,
      alreadySaved: filtered.filter((result) => result.savedLeadId !== null).length,
      errors: 0
    };

    // Capture every completed SME result in its own profile store. This is deliberately
    // separate from Lead creation: a result remains available after a refresh, but becomes a
    // Lead only when a user chooses Save selected.
    await persistSmeSearchResults(filtered, JSON.stringify(request));

    await prisma.smeSearchRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        totalCount: summary.total,
        qualifiedCount: summary.qualified,
        manualReviewCount: summary.manualReview,
        excludedCount: summary.excluded,
        completedAt: new Date()
      }
    });

    return { searchRunId: run.id, summary, results: filtered, needsReview };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "E-PLACES-02";
    await prisma.smeSearchRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorCode: code,
        errorMessage: error instanceof Error ? error.message : "SME search failed",
        completedAt: new Date()
      }
    });
    throw error;
  }
}

type ScoreContext = {
  weights: Parameters<typeof scoreLead>[1];
  zonePriority: string | null;
  categoryPriority: string | null;
};

async function toResults(
  candidates: BusinessCandidate[],
  classifications: Map<string, Classification>,
  scoreContext: ScoreContext
) {
  if (candidates.length === 0) return [];

  const leadPlaceIds = candidates.map((candidate) => toLeadPlaceId(candidate.providerPlaceId));
  const savedLeads = await prisma.lead.findMany({
    where: { placeId: { in: leadPlaceIds } },
    select: { id: true, placeId: true, email: true, smsLogs: { select: { id: true }, take: 1 }, emailLogs: { select: { id: true }, take: 1 } }
  });
  const savedByPlaceId = new Map(savedLeads.map((lead) => [lead.placeId, lead]));

  const phones = candidates
    .map((candidate) => normalizePhilippineMobileNumber(candidate.phoneNumber))
    .filter((phone): phone is string => Boolean(phone));
  const suppressed = phones.length
    ? await prisma.doNotContact.findMany({
        where: { normalizedContact: { in: phones }, active: true },
        select: { normalizedContact: true }
      })
    : [];
  const suppressedPhones = new Set(suppressed.map((entry) => entry.normalizedContact));

  return candidates.map((candidate) => {
    const lead = savedByPlaceId.get(toLeadPlaceId(candidate.providerPlaceId));
    const phone = normalizePhilippineMobileNumber(candidate.phoneNumber);
    const classification = classifications.get(candidate.providerPlaceId) as Classification;

    const score = scoreLead(
      {
        classification,
        phoneNumber: candidate.phoneNumber,
        websiteUrl: candidate.websiteUrl,
        rating: candidate.rating,
        reviewCount: candidate.userRatingCount,
        zonePriority: scoreContext.zonePriority,
        categoryPriority: scoreContext.categoryPriority
      },
      scoreContext.weights
    );

    return {
      providerPlaceId: candidate.providerPlaceId,
      displayName: candidate.displayName,
      primaryType: candidate.primaryType,
      formattedAddress: candidate.formattedAddress,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      phoneNumber: candidate.phoneNumber,
      websiteUrl: candidate.websiteUrl,
      websiteHost: normalizeWebsiteHost(candidate.websiteUrl),
      rating: candidate.rating,
      reviewCount: candidate.userRatingCount,
      businessStatus: candidate.businessStatus,
      googleMapsUri: candidate.googleMapsUri,
      email: lead?.email ?? null,
      classification,
      score,
      savedLeadId: lead?.id ?? null,
      alreadyContacted: Boolean(lead && (lead.smsLogs.length > 0 || lead.emailLogs.length > 0)),
      doNotContact: Boolean(phone && suppressedPhones.has(phone))
    } satisfies SmeSearchResult;
  });
}

export function matchesFilters(result: SmeSearchResult, filters: SearchFilters) {
  if (filters.minRating !== undefined && (result.rating ?? 0) < filters.minRating) return false;
  if (filters.minReviewCount !== undefined && (result.reviewCount ?? 0) < filters.minReviewCount) return false;
  if (filters.maxReviewCount !== undefined && (result.reviewCount ?? 0) > filters.maxReviewCount) return false;
  if (filters.hasPhone === true && !result.phoneNumber) return false;
  if (filters.hasPhone === false && result.phoneNumber) return false;
  if (filters.hasWebsite === true && !result.websiteUrl) return false;
  if (filters.hasWebsite === false && result.websiteUrl) return false;
  if (filters.businessStatus && result.businessStatus !== filters.businessStatus) return false;
  if (filters.classification && result.classification.effectiveClass !== filters.classification) return false;
  const franchiseExcluded = ["FRANCHISE_EXCLUDED", "LARGE_CHAIN", "MANUAL_EXCLUDE"].includes(result.classification.effectiveClass);
  if (filters.franchiseStatus === "INCLUDED" && franchiseExcluded) return false;
  if (filters.franchiseStatus === "EXCLUDED" && !franchiseExcluded) return false;
  if (filters.leadStatus === "CAPTURED" && result.savedLeadId !== null) return false;
  if (filters.leadStatus === "SAVED" && result.savedLeadId === null) return false;
  if (filters.leadStatus === "CONTACTED" && !result.alreadyContacted) return false;
  if (filters.leadStatus === "DO_NOT_CONTACT" && !result.doNotContact) return false;
  if (filters.excludeDoNotContact && result.doNotContact) return false;
  if (filters.excludePreviouslyContacted && result.alreadyContacted) return false;
  return true;
}
