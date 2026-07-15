import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

export async function POST() {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const now = new Date();
  // Keep the contact details in the established Lead record. The SME profile owns the
  // search/classification data and is linked to this record for email/SMS outreach.
  // This remains compatible with databases that have not yet received the optional
  // SmeBusinessProfile.email column upgrade.
  const lead = await prisma.lead.upsert({
    where: { placeId: "debug-sample-lead-jirald-laurea" },
    create: {
      placeId: "debug-sample-lead-jirald-laurea",
      businessName: "Jirald Sample Cafe",
      category: "sample_lead",
      formattedAddress: "Makati City, Metro Manila, Philippines",
      phoneNumber: "09614073159",
      email: "jiraldlaurea@gmail.com",
      emailSource: "debug_sample",
      emailStatus: "found",
      emailCheckedAt: now,
      websiteUrl: "https://example.com",
      googleMapsUrl: "https://maps.google.com/?q=Jirald%20Sample%20Cafe",
      rating: 4.8,
      reviewCount: 128,
      businessStatus: "OPERATIONAL",
      searchKeyword: "sample debug SME",
      searchLocation: "Makati City, Philippines",
      source: "debug_sample",
      collectedAt: now,
      lastRefreshedAt: now
    },
    update: {
      phoneNumber: "09614073159",
      email: "jiraldlaurea@gmail.com",
      emailSource: "debug_sample",
      emailStatus: "found",
      emailCheckedAt: now,
      lastRefreshedAt: now
    }
  });

  const profile = await prisma.smeBusinessProfile.upsert({
    where: { providerPlaceId: "debug-sme-sample-jirald-laurea" },
    create: {
      providerPlaceId: "debug-sme-sample-jirald-laurea",
      displayName: "Jirald Sample Cafe",
      normalizedName: "jirald sample cafe",
      brandCandidateName: "jirald sample cafe",
      internalCategory: "cafe_resto",
      primaryType: "cafe",
      city: "Makati City",
      commercialArea: "Makati City",
      formattedAddress: "Makati City, Metro Manila, Philippines",
      latitude: 14.5547,
      longitude: 121.0244,
      phoneNumber: "09614073159",
      email: "jiraldlaurea@gmail.com",
      leadId: lead.id,
      websiteUrl: "https://example.com",
      websiteHost: "example.com",
      googleMapsUrl: "https://maps.google.com/?q=Jirald%20Sample%20Cafe",
      rating: 4.8,
      reviewCount: 128,
      businessStatus: "OPERATIONAL",
      detailsFetched: true,
      leadStatus: "QUALIFIED",
      dataSource: "debug_sample",
      sourceQuery: "debug sample SME",
      collectedAt: now,
      lastFetchedAt: now
    },
    update: {
      displayName: "Jirald Sample Cafe",
      normalizedName: "jirald sample cafe",
      brandCandidateName: "jirald sample cafe",
      internalCategory: "cafe_resto",
      primaryType: "cafe",
      city: "Makati City",
      commercialArea: "Makati City",
      formattedAddress: "Makati City, Metro Manila, Philippines",
      latitude: 14.5547,
      longitude: 121.0244,
      phoneNumber: "09614073159",
      email: "jiraldlaurea@gmail.com",
      leadId: lead.id,
      websiteUrl: "https://example.com",
      websiteHost: "example.com",
      googleMapsUrl: "https://maps.google.com/?q=Jirald%20Sample%20Cafe",
      rating: 4.8,
      reviewCount: 128,
      businessStatus: "OPERATIONAL",
      detailsFetched: true,
      leadStatus: "QUALIFIED",
      dataSource: "debug_sample",
      sourceQuery: "debug sample SME",
      collectedAt: now,
      lastFetchedAt: now
    }
  });

  await prisma.smeClassification.upsert({
    where: { businessId: profile.id },
    create: {
      businessId: profile.id,
      autoClass: "INDEPENDENT_SME",
      effectiveClass: "INDEPENDENT_SME",
      confidence: 100,
      reasonCodes: JSON.stringify([{ code: "DEBUG_SAMPLE", detail: "Debug SME profile for outreach testing." }]),
      branchCount: 1
    },
    update: {
      autoClass: "INDEPENDENT_SME",
      effectiveClass: "INDEPENDENT_SME",
      confidence: 100,
      reasonCodes: JSON.stringify([{ code: "DEBUG_SAMPLE", detail: "Debug SME profile for outreach testing." }]),
      branchCount: 1
    }
  });

  const score = await prisma.smeLeadScore.findFirst({
    where: { businessId: profile.id },
    orderBy: { calculatedAt: "desc" }
  });
  const scoreData = {
    version: "debug_sample_v1",
    total: 76,
    band: "A",
    factors: JSON.stringify([
      { key: "smeConfidence", label: "SME confidence", points: 25, max: 25, unknown: false, evidence: ["Debug sample classified as an independent SME."] },
      { key: "marketingNeed", label: "Marketing need", points: 18, max: 25, unknown: false, evidence: ["Sample profile is available for outreach testing."] },
      { key: "businessPotential", label: "Business potential", points: 15, max: 20, unknown: false, evidence: ["Uses representative rating and review data."] },
      { key: "contactAvailability", label: "Contact availability", points: 18, max: 20, unknown: false, evidence: ["Test phone number and email address are available."] },
      { key: "areaValue", label: "Area value", points: 0, max: 10, unknown: true, evidence: ["No commercial-zone priority is configured for the debug sample."] }
    ])
  };
  if (score) {
    await prisma.smeLeadScore.update({ where: { id: score.id }, data: scoreData });
  } else {
    await prisma.smeLeadScore.create({ data: { businessId: profile.id, ...scoreData } });
  }

  return ok({
    id: profile.id,
    providerPlaceId: profile.providerPlaceId,
    businessName: profile.displayName,
    phoneNumber: profile.phoneNumber,
    email: lead.email
  });
}
