import { prisma } from "@/lib/prisma";

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ignoredDomains = ["example.com", "domain.com", "email.com", "sentry.io", "wixpress.com"];

function normalizeWebsiteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function candidateUrls(websiteUrl: string) {
  const base = new URL(normalizeWebsiteUrl(websiteUrl));
  return [
    base.toString(),
    new URL("/contact", base).toString(),
    new URL("/contact-us", base).toString(),
    new URL("/about", base).toString(),
    new URL("/about-us", base).toString()
  ];
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

  for (const url of candidateUrls(lead.websiteUrl)) {
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
