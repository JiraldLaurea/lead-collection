import { NextRequest } from "next/server";
import { clearAdminSession } from "@/lib/auth";
import { ok } from "@/lib/http";
import { safeRedirect } from "@/lib/redirect";

export async function POST(request: NextRequest) {
  await clearAdminSession();
  if ((request.headers.get("content-type") || "").includes("application/json")) return ok({ loggedOut: true });
  return safeRedirect("/login");
}
