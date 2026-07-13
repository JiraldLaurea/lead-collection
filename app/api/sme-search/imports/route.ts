export const runtime = "nodejs";

import { fail, ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";
import { importFranchiseBrands } from "@/lib/sme/franchise-import";
import { importSearchZones } from "@/lib/sme/zone-import";

const maxFileSize = 2 * 1024 * 1024;

/**
 * Admin CSV import for search zones and the franchise blacklist.
 *
 * Both support dryRun, so an administrator can see exactly what a file would do — including
 * its row-level errors — before committing it. Per work order 6.2 no blacklist is ever
 * seeded silently; it arrives through here, reviewed.
 */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const formData = await request.formData().catch(() => null);
  if (!formData) return fail("E-SME-05", "Expected a CSV upload", 400);

  const kind = String(formData.get("kind") ?? "");
  const dryRun = formData.get("dryRun") === "true";
  const file = formData.get("file");

  if (kind !== "zones" && kind !== "franchise") {
    return fail("E-SME-05", "Unknown import type", 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail("E-SME-05", "Choose a CSV file to import", 400);
  }
  if (file.size > maxFileSize) {
    return fail("E-SME-05", "The CSV is larger than 2MB", 400);
  }

  const text = await file.text();

  try {
    const result =
      kind === "zones" ? await importSearchZones(text, { dryRun }) : await importFranchiseBrands(text, { dryRun });

    return ok({
      kind,
      dryRun,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      errors: result.errors
    });
  } catch (error) {
    return fail("E-SME-06", error instanceof Error ? error.message : "The CSV could not be imported.", 400);
  }
}
