import { prisma } from "@/lib/prisma";

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ignoredDomains = ["example.com", "domain.com", "email.com", "sentry.io", "wixpress.com"];
const sharedPlatformHosts = ["facebook.com", "instagram.com", "tiktok.com", "linkedin.com", "linktr.ee"];

function normalizeWebsiteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function candidateUrls(websiteUrl: string) {
  try {
    const base = new URL(normalizeWebsiteUrl(websiteUrl));
    // A shared social profile has no predictable /contact or /about page. Requesting those
    // paths produces false misses (and unnecessary requests) on providers such as Facebook.
    if (isSharedPlatform(base.hostname)) return [base.toString()];
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

function isSharedPlatform(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return sharedPlatformHosts.some((platform) => host === platform || host.endsWith(`.${platform}`));
}

function isGenericSharedPlatformUrl(websiteUrl: string) {
  try {
    const url = new URL(normalizeWebsiteUrl(websiteUrl));
    return isSharedPlatform(url.hostname) && (url.pathname === "/" || url.pathname === "");
  } catch {
    return false;
  }
}

function isSharedPlatformUrl(websiteUrl: string) {
  try {
    return isSharedPlatform(new URL(normalizeWebsiteUrl(websiteUrl)).hostname);
  } catch {
    return false;
  }
}

function cleanEmail(value: string) {
  return value.toLowerCase().replace(/^mailto:/, "").replace(/[).,;:]+$/, "");
}

/**
 * Covers common static-site obfuscation without guessing at arbitrary text. Facebook and
 * other social platforms often render contact data after login/client-side JavaScript; that
 * is deliberately not treated as scrapeable website content.
 */
export function extractEmails(html: string) {
  const cloudflareDecoded = html.replace(/data-cfemail=["']([a-f0-9]+)["']/gi, (_match, encoded: string) => {
    if (encoded.length < 4 || encoded.length % 2 !== 0) return "";
    const key = Number.parseInt(encoded.slice(0, 2), 16);
    let value = "";
    for (let index = 2; index < encoded.length; index += 2) {
      value += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 2), 16) ^ key);
    }
    return ` ${value} `;
  });
  const deobfuscated = cloudflareDecoded
    .replace(/([A-Z0-9._%+-]+)\s*(?:\[|\()\s*at\s*(?:\]|\))\s*([A-Z0-9.-]+)\s*(?:\[|\()\s*dot\s*(?:\]|\))\s*([A-Z]{2,})/gi, "$1@$2.$3")
    .replace(/([A-Z0-9._%+-]+)\s+at\s+([A-Z0-9.-]+)\s+dot\s+([A-Z]{2,})/gi, "$1@$2.$3");
  const matches = deobfuscated.match(emailPattern) || [];
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
  if (isGenericSharedPlatformUrl(profile.websiteUrl)) {
    return { status: "SHARED_PLATFORM_HOME", email: null, source: profile.websiteUrl };
  }

  for (const url of candidateUrls(profile.websiteUrl)) {
    const [email] = extractEmails(await fetchPage(url));
    if (!email) continue;
    await prisma.smeBusinessProfile.update({ where: { id: profile.id }, data: { email } });
    return { status: "FOUND", email, source: url };
  }

  return {
    status: isSharedPlatformUrl(profile.websiteUrl)
      ? "SHARED_PLATFORM_UNAVAILABLE"
      : "NOT_FOUND",
    email: null,
    source: profile.websiteUrl
  };
}
