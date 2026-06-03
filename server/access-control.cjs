const ipaddr = require("ipaddr.js");

function normalizeIp(rawIp) {
  if (!rawIp) return "0.0.0.0";
  const withoutPort = rawIp.includes("]:")
    ? rawIp.slice(1, rawIp.indexOf("]"))
    : rawIp.replace(/^::ffff:/, "").replace(/:\d+$/, "");
  try {
    const parsed = ipaddr.parse(withoutPort);
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().toString();
    }
    return parsed.toString();
  } catch {
    return withoutPort;
  }
}

function parseCidrs() {
  const value = process.env.OFFICE_ALLOWED_CIDRS || "";
  const fallback = ["127.0.0.1/32", "::1/128"];
  const cidrs = value.split(",").map((item) => item.trim()).filter(Boolean);
  const candidates = cidrs.length > 0 ? cidrs : fallback;
  try {
    return candidates.map((cidr) => ipaddr.parseCIDR(cidr));
  } catch {
    return fallback.map((cidr) => ipaddr.parseCIDR(cidr));
  }
}

function isPrivateOrLocal(ip) {
  try {
    const parsed = ipaddr.parse(ip);
    const range = parsed.range();
    return ["loopback", "private", "linkLocal", "uniqueLocal"].includes(range);
  } catch {
    return false;
  }
}

function isIpAllowed(ip) {
  const normalized = normalizeIp(ip);
  if (process.env.BLOCK_PUBLIC_ACCESS !== "false" && !isPrivateOrLocal(normalized)) {
    return { allowed: false, reason: "Public IP blocked" };
  }

  try {
    const parsed = ipaddr.parse(normalized);
    const ranges = parseCidrs();
    const allowed = ranges.some(([rangeIp, prefix]) => {
      if (rangeIp.kind() !== parsed.kind()) return false;
      return parsed.match(rangeIp, prefix);
    });
    return { allowed, reason: allowed ? "CIDR allowed" : "IP outside allowed CIDRs" };
  } catch {
    return { allowed: false, reason: "Invalid request IP" };
  }
}

function getClientIpFromNodeRequest(req) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return normalizeIp(forwarded.split(",")[0].trim());
    }
  }
  return normalizeIp(req.socket && req.socket.remoteAddress);
}

module.exports = { getClientIpFromNodeRequest, isIpAllowed, normalizeIp };
