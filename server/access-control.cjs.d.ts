export function normalizeIp(rawIp: string): string;
export function isIpAllowed(ip: string): { allowed: boolean; reason: string };
export function getClientIpFromNodeRequest(req: unknown): string;
