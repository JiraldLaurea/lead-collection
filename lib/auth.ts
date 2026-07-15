import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "office_admin_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value === "replace_with_long_random_secret") {
    return "development-only-change-me";
  }
  return value;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function verifyAdminPassword(username: string, password: string) {
  if (username !== (process.env.ADMIN_USERNAME || "admin")) return false;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || hash === "replace_with_bcrypt_hash") {
    return password === "admin";
  }
  return bcrypt.compare(password, hash);
}

export async function createAdminSession() {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 8;
  const payload = JSON.stringify({ role: "ADMIN", expiresAt });
  const token = `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true" || process.env.VERCEL === "1",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isAdminAuthenticated() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [encoded, tokenSignature] = token.split(".");
  if (!encoded || !tokenSignature) return false;
  try {
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    if (sign(payload) !== tokenSignature) return false;
    const parsed = JSON.parse(payload) as { role?: string; expiresAt?: number };
    return parsed.role === "ADMIN" && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}
