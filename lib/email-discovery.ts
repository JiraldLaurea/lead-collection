import { prisma } from "@/lib/prisma";

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ignoredDomains = ["example.com", "domain.com", "email.com", "sentry.io", "wixpress.com"];

function normalizeWebsiteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function candidateUrls(websiteUrl: string) {
  try {
    const base = new URL(normalizeWebsiteUrl(websiteUrl));
    const profileBase = new URL(base);
    if (!profileBase.pathname.endsWith("/")) profileBase.pathname = `${profileBase.pathname}/`;
    return [
      base.toString(),
      new URL("contact", profileBase).toString(),
      new URL("contact-us", profileBase).toString(),
      new URL("about", profileBase).toString(),
      new URL("about-us", profileBase).toString()
    ];
  } catch {
    return [];
  }
}

function cleanEmail(value: string) {
  return value.toLowerCase().replace(/^mailto:/, "").replace(/[).,;:]+$/, "");
}

function extractEmails(html: string) {
  const matches = html.match(emailPattern) || [];
  return Array.from(new Set(matches.map(cleanEmail))).filter((email) => {
    const domain = email.split("@")[1] || "";
    return !ignoredDomains.some((ignored) => domain.endsWith(ignored));
  });
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LeadCollectionMVP/1.0 (+internal email discovery)"
      },
      signal: controller.signal
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return "";
    return response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverLeadEmail(leadId: number) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return { status: "NOT_FOUND", email: null, source: null };
  }
  if (lead.email) {
    return { status: "FOUND", email: lead.email, source: lead.emailSource };
  }
  if (!lead.websiteUrl) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { emailStatus: "NO_WEBSITE", emailCheckedAt: new Date() }
    });
    return { status: "NO_WEBSITE", email: null, source: null };
  }

  const urls = candidateUrls(lead.websiteUrl);
  if (urls.length === 0) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { email: null, emailSource: null, emailStatus: "INVALID_WEBSITE", emailCheckedAt: new Date() }
    });
    return { status: "INVALID_WEBSITE", email: null, source: null };
  }

  for (const url of urls) {
    const html = await fetchPage(url);
    const [email] = extractEmails(html);
    if (email) {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          email,
          emailSource: url,
          emailStatus: "FOUND",
          emailCheckedAt: new Date()
        }
      });
      return { status: "FOUND", email, source: url };
    }
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { email: null, emailSource: null, emailStatus: "NOT_FOUND", emailCheckedAt: new Date() }
  });
  return { status: "NOT_FOUND", email: null, source: null };
}

/** Discovers and persists an email on a captured SME profile without creating a Lead. */
export async function discoverSmeProfileEmail(providerPlaceId: string) {
  const profile = await prisma.smeBusinessProfile.findUnique({ where: { providerPlaceId } });
  if (!profile) return { status: "NOT_FOUND", email: null, source: null };
  if (profile.email) return { status: "FOUND", email: profile.email, source: profile.websiteUrl };
  if (!profile.websiteUrl) return { status: "NO_WEBSITE", email: null, source: null };

  for (const url of candidateUrls(profile.websiteUrl)) {
    const [email] = extractEmails(await fetchPage(url));
    if (!email) continue;
    await prisma.smeBusinessProfile.update({ where: { id: profile.id }, data: { email } });
    return { status: "FOUND", email, source: url };
  }

  return { status: "NOT_FOUND", email: null, source: null };
}
