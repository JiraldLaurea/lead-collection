import { redirect } from "next/navigation";
import { fail } from "@/lib/http";
import { isAdminAuthenticated } from "@/lib/auth";

export async function requirePageAdmin() {
  const allowed = await isAdminAuthenticated();
  if (!allowed) redirect("/login");
}

export async function requireApiAdmin() {
  const allowed = await isAdminAuthenticated();
  if (!allowed) return fail("E-AUTH-01", "Admin session required", 401);
  return null;
}
