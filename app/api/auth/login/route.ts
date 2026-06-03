import { NextRequest } from "next/server";
import { createAdminSession, verifyAdminPassword } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { safeRedirect } from "@/lib/redirect";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  const input = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());
  const username = String(input.username || "");
  const password = String(input.password || "");
  const valid = await verifyAdminPassword(username, password);
  if (!valid) {
    if (contentType.includes("application/json")) return fail("E-AUTH-02", "Invalid admin credentials", 401);
    return safeRedirect("/login");
  }
  await createAdminSession();
  if (contentType.includes("application/json")) return ok({ role: "ADMIN" });
  return safeRedirect("/");
}
