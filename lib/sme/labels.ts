/** Presentation labels for SME classes. Client-safe: no Prisma, no server-only imports. */
const classLabels: Record<string, string> = {
  INDEPENDENT_SME: "Independent",
  LOCAL_SME_CHAIN: "Local chain",
  MANUAL_REVIEW: "Needs review",
  LARGE_CHAIN: "Large chain",
  FRANCHISE_EXCLUDED: "Franchise",
  MANUAL_INCLUDE: "Included",
  MANUAL_EXCLUDE: "Excluded"
};

export function smeClassLabel(value: string) {
  return classLabels[value] ?? value;
}

/** Maps a class onto the existing status-pill styles. */
export function smeClassPillClassName(value: string) {
  if (value === "INDEPENDENT_SME" || value === "LOCAL_SME_CHAIN" || value === "MANUAL_INCLUDE") {
    return "status-pill status-pill-success";
  }
  if (value === "MANUAL_REVIEW") return "status-pill status-pill-warning";
  return "status-pill status-pill-muted";
}
