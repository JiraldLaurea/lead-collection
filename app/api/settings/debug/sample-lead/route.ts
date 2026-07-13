import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

export async function POST() {
  const authError = await requireApiAdmin();
  if (authError) return authError;

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
      emailCheckedAt: new Date(),
      websiteUrl: "https://example.com",
      googleMapsUrl: "https://maps.google.com/?q=Jirald%20Sample%20Cafe",
      rating: 4.8,
      reviewCount: 128,
      businessStatus: "OPERATIONAL",
      openingHours: "Monday-Friday 9:00 AM-6:00 PM",
      searchKeyword: "sample debug lead",
      searchLocation: "Makati City, Philippines",
      source: "debug_sample",
      collectedAt: new Date(),
      lastRefreshedAt: new Date()
    },
    update: {
      businessName: "Jirald Sample Cafe",
      category: "sample_lead",
      formattedAddress: "Makati City, Metro Manila, Philippines",
      phoneNumber: "09614073159",
      email: "jiraldlaurea@gmail.com",
      emailSource: "debug_sample",
      emailStatus: "found",
      emailCheckedAt: new Date(),
      websiteUrl: "https://example.com",
      googleMapsUrl: "https://maps.google.com/?q=Jirald%20Sample%20Cafe",
      rating: 4.8,
      reviewCount: 128,
      businessStatus: "OPERATIONAL",
      openingHours: "Monday-Friday 9:00 AM-6:00 PM",
      searchKeyword: "sample debug lead",
      searchLocation: "Makati City, Philippines",
      source: "debug_sample",
      lastRefreshedAt: new Date()
    }
  });

  return ok({
    id: lead.id,
    businessName: lead.businessName,
    phoneNumber: lead.phoneNumber,
    email: lead.email
  });
}
