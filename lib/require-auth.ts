import { notFound, redirect } from "next/navigation";
import { fail } from "@/lib/http";
import { isAdminAuthenticated } from "@/lib/auth";
import { isSmeSearchEnabled } from "@/lib/feature-flags";

export async function requirePageAdmin() {
  const allowed = await isAdminAuthenticated();
  if (!allowed) redirect("/login");
}

export async function requireApiAdmin() {
  const allowed = await isAdminAuthenticated();
  if (!allowed) return fail("E-AUTH-01", "Admin session required", 401);
  return null;
}

export async function requireSmeSearchPage() {
  if (!(await isSmeSearchEnabled())) notFound();
}

export async function requireSmeSearchApi() {
  if (!(await isSmeSearchEnabled())) return fail("E-FLAG-01", "SME Search is not enabled", 404);
  return null;
}
