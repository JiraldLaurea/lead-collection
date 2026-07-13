import { prisma } from "@/lib/prisma";
import { isContactableClass } from "@/lib/sme/classify";
import { toLeadPlaceId } from "@/lib/sme/lead-link";
import { normalizeWebsiteHost, splitBusinessName } from "@/lib/sme/normalize-name";
import type { SmeSearchResult } from "@/lib/sme/run-search";

export type SaveLeadsResult = {
  created: number;
  linked: number;
  skipped: { displayName: string; reason: string }[];
  leadIds: number[];
};

/**
 * Saves selected SME candidates as leads.
 *
 * The existing `leads` table stays the lead store: a saved SME becomes an ordinary Lead row,
 * so email, SMS, export and the logs all work on it with no change. The SmeBusinessProfile
 * carries the SME-specific state (classification, evidence, provenance) and links back via
 * lead_id.
 *
 * Idempotent: re-saving the same business links to the existing lead instead of duplicating,
 * keyed on the Google place ID.
 */
export async function saveSmeLeads(
  results: SmeSearchResult[],
  options: { searchRunId?: number } = {}
): Promise<SaveLeadsResult> {
  const created: number[] = [];
  const linked: number[] = [];
  const skipped: { displayName: string; reason: string }[] = [];

  for (const result of results) {
    // A franchise or an unreviewed chain must not silently enter the lead list.
    if (!isContactableClass(result.classification.effectiveClass)) {
      skipped.push({
        displayName: result.displayName,
        reason: `Classified ${result.classification.effectiveClass}; review it before saving.`
      });
      continue;
    }

    const placeId = toLeadPlaceId(result.providerPlaceId);
    const existingLead = await prisma.lead.findUnique({ where: { placeId } });

    const lead = existingLead
      ? await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            // Refresh what Google told us, but never clobber a value with an empty one.
            phoneNumber: result.phoneNumber ?? existingLead.phoneNumber,
            websiteUrl: result.websiteUrl ?? existingLead.websiteUrl,
            rating: result.rating ?? existingLead.rating,
            reviewCount: result.reviewCount ?? existingLead.reviewCount,
            businessStatus: result.businessStatus ?? existingLead.businessStatus,
            lastRefreshedAt: new Date()
          }
        })
      : await prisma.lead.create({
          data: {
            placeId,
            businessName: result.displayName,
            category: result.primaryType,
            formattedAddress: result.formattedAddress,
            phoneNumber: result.phoneNumber,
            websiteUrl: result.websiteUrl,
            googleMapsUrl: result.googleMapsUri,
            rating: result.rating,
            reviewCount: result.reviewCount,
            businessStatus: result.businessStatus,
            searchKeyword: "sme_search",
            searchLocation: result.formattedAddress ?? "Metro Manila",
            source: "google_places_api",
            collectedAt: new Date(),
            lastRefreshedAt: new Date()
          }
        });

    if (existingLead) linked.push(lead.id);
    else created.push(lead.id);

    const { normalizedName, brandCandidateName, branchLabel } = splitBusinessName(result.displayName);

    const profile = await prisma.smeBusinessProfile.upsert({
      where: { providerPlaceId: result.providerPlaceId },
      create: {
        providerPlaceId: result.providerPlaceId,
        leadId: lead.id,
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
        lastFetchedAt: new Date()
      },
      update: {
        leadId: lead.id,
        phoneNumber: result.phoneNumber,
        websiteUrl: result.websiteUrl,
        websiteHost: normalizeWebsiteHost(result.websiteUrl),
        rating: result.rating,
        reviewCount: result.reviewCount,
        businessStatus: result.businessStatus,
        lastFetchedAt: new Date()
      }
    });

    await prisma.smePlaceReference.upsert({
      where: { providerPlaceId: result.providerPlaceId },
      create: { providerPlaceId: result.providerPlaceId, lastFetchedAt: new Date() },
      update: { lastFetchedAt: new Date() }
    });

    const classification = result.classification;
    await prisma.smeClassification.upsert({
      where: { businessId: profile.id },
      create: {
        businessId: profile.id,
        autoClass: classification.autoClass,
        effectiveClass: classification.effectiveClass,
        confidence: classification.confidence,
        reasonCodes: JSON.stringify(classification.reasons),
        branchCount: classification.branchCount,
        matchedBrandId: classification.matchedBrandId
      },
      update: {
        autoClass: classification.autoClass,
        // A manual override is never overwritten by a later automatic pass.
        confidence: classification.confidence,
        reasonCodes: JSON.stringify(classification.reasons),
        branchCount: classification.branchCount,
        matchedBrandId: classification.matchedBrandId
      }
    });

    // Recalculation inserts a new score row rather than overwriting: a score is only
    // meaningful alongside the model version and inputs that produced it (work order 11.4).
    if (result.score) {
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

    await prisma.contactActivity.create({
      data: {
        leadId: lead.id,
        businessId: profile.id,
        type: existingLead ? "LEAD_LINKED" : "LEAD_SAVED",
        channel: "SME_SEARCH",
        status: classification.effectiveClass,
        note: `Saved from SME Search${options.searchRunId ? ` (run #${options.searchRunId})` : ""}`,
        metadata: JSON.stringify({ providerPlaceId: result.providerPlaceId })
      }
    });
  }

  return { created: created.length, linked: linked.length, skipped, leadIds: [...created, ...linked] };
}
