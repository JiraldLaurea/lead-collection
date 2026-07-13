/**
 * Hosts that many unrelated businesses share, and which therefore can never be used as
 * evidence of a shared brand (work order 6.4).
 *
 * This is not a theoretical safeguard. In a live search of Aguirre Avenue, BF Homes, three
 * of six independent cafes listed a facebook.com or instagram.com page as their "website".
 * Because the host of every Facebook page is just `facebook.com`, a naive domain-cluster
 * rule would conclude they are all branches of one 3-location chain — and with enough
 * results, a 10+ location "LARGE_CHAIN" that gets auto-excluded from outreach. These are
 * exactly the SMEs we most want to reach: a business with no real website is a prospect,
 * not a franchise.
 */

/** Exact hosts that collide across businesses: every page lives under the same hostname. */
const sharedHosts = new Set([
  // Social
  "facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "pinterest.com",
  "linkedin.com",
  // Messaging
  "m.me",
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "t.me",
  "viber.com",
  // Link-in-bio
  "linktr.ee",
  "beacons.ai",
  "taplink.cc",
  "carrd.co",
  "linkin.bio",
  "msha.ke",
  "bio.link",
  // Marketplaces, delivery and directories
  "shopee.ph",
  "lazada.com.ph",
  "foodpanda.ph",
  "grab.com",
  "zomato.com",
  "booky.ph",
  "yelp.com",
  "tripadvisor.com",
  "tripadvisor.com.ph",
  "klook.com",
  "agoda.com",
  "booking.com",
  "airbnb.com",
  "etsy.com",
  "amazon.com",
  // Generic / URL shorteners / platform landing pages
  "google.com",
  "sites.google.com",
  "docs.google.com",
  "forms.gle",
  "goo.gl",
  "bit.ly",
  "tinyurl.com",
  "canva.site",
  // Philippine malls: tenants share the mall's site
  "smsupermalls.com",
  "ayalamalls.com",
  "ayalalandmalls.com",
  "robinsonsmalls.com",
  "megaworld-lifestyle.com"
]);

/**
 * Suffixes where each business gets its own subdomain (abc.wixsite.com), so hosts do not
 * literally collide — but the domain is still a rented platform page, not an owned brand
 * domain, and must not be treated as corporate-domain evidence.
 */
const sharedHostSuffixes = [
  ".wixsite.com",
  ".weebly.com",
  ".wordpress.com",
  ".blogspot.com",
  ".business.site",
  ".godaddysites.com",
  ".squarespace.com",
  ".myshopify.com",
  ".webflow.io",
  ".framer.website",
  ".netlify.app",
  ".vercel.app",
  ".github.io"
];

/** True when a host says nothing about who owns the brand. */
export function isSharedDomain(host?: string | null) {
  if (!host) return false;
  const normalized = host.toLowerCase().replace(/^www\./, "");
  if (sharedHosts.has(normalized)) return true;
  return sharedHostSuffixes.some((suffix) => normalized.endsWith(suffix));
}

/** The host only if it can be trusted as a brand's own domain. */
export function brandDomain(host?: string | null) {
  if (!host || isSharedDomain(host)) return null;
  return host.toLowerCase().replace(/^www\./, "");
}
