import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LeadFilters = {
  keyword?: string;
  area?: string;
  category?: string;
  minRating?: number;
  hasWebsite?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
};

export function parseLeadFilters(searchParams: URLSearchParams): LeadFilters {
  const minRatingRaw = searchParams.get("minRating");
  const hasWebsiteRaw = searchParams.get("hasWebsite");
  const hasPhoneRaw = searchParams.get("hasPhone");
  const hasEmailRaw = searchParams.get("hasEmail");
  return {
    keyword: searchParams.get("keyword") || undefined,
    area: searchParams.get("area") || undefined,
    category: searchParams.get("category") || undefined,
    minRating: minRatingRaw ? Number(minRatingRaw) : undefined,
    hasWebsite: hasWebsiteRaw === "true" ? true : hasWebsiteRaw === "false" ? false : undefined,
    hasPhone: hasPhoneRaw === "true" ? true : hasPhoneRaw === "false" ? false : undefined,
    hasEmail: hasEmailRaw === "true" ? true : hasEmailRaw === "false" ? false : undefined
  };
}

export function buildLeadWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  return {
    searchKeyword: filters.keyword ? { contains: filters.keyword } : undefined,
    searchLocation: filters.area ? { contains: filters.area } : undefined,
    category: filters.category ? { contains: filters.category } : undefined,
    rating: filters.minRating ? { gte: filters.minRating } : undefined,
    websiteUrl: filters.hasWebsite === true ? { not: null } : undefined,
    phoneNumber: filters.hasPhone === true ? { not: null } : undefined,
    AND: [
      filters.hasWebsite === false ? { OR: [{ websiteUrl: null }, { websiteUrl: "" }] } : undefined,
      filters.hasPhone === false ? { OR: [{ phoneNumber: null }, { phoneNumber: "" }] } : undefined,
      filters.hasEmail === true ? { email: { not: null } } : undefined,
      filters.hasEmail === true ? { email: { not: "" } } : undefined,
      filters.hasEmail === false ? { OR: [{ email: null }, { email: "" }] } : undefined
    ].filter(Boolean) as Prisma.LeadWhereInput[]
  };
}

export async function getDashboardMetrics() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leadWithEmailWhere: Prisma.LeadWhereInput = {
    email: { not: null },
    NOT: { email: "" }
  };
  const [totalLeads, leadsToday, leadsWithEmail, leadsWithEmailToday, emailsSent, emailsSentToday, recentLeads, lastJob, recentErrors] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { collectedAt: { gte: today } } }),
    prisma.lead.count({ where: leadWithEmailWhere }),
    prisma.lead.count({
      where: {
        ...leadWithEmailWhere,
        collectedAt: { gte: today }
      }
    }),
    prisma.emailLog.count({ where: { status: "sent" } }),
    prisma.emailLog.count({ where: { status: "sent", sentAt: { gte: today } } }),
    prisma.lead.findMany({
      orderBy: { collectedAt: "desc" },
      take: 5,
      select: {
        id: true,
        businessName: true,
        category: true,
        email: true,
        collectedAt: true
      }
    }),
    prisma.searchJob.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.apiErrorLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
  ]);
  return {
    totalLeads,
    leadsToday,
    leadsWithEmail,
    leadsWithEmailToday,
    emailsSent,
    emailsSentToday,
    recentLeads,
    duplicatesSkipped: lastJob?.totalDuplicates ?? 0,
    lastSearchTime: lastJob?.startedAt ?? null,
    recentErrors
  };
}
