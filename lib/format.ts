export function formatCategoryLabel(category?: string | null) {
  if (!category) return "N/A";
  const normalized = category.replace(/_/g, " ").trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatEmailStatus(status?: string | null) {
  if (!status) return "Not checked";
  const normalized = status.replace(/_/g, " ").trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function emailStatusPillClassName(status?: string | null) {
  if (status === "FOUND") return "status-pill status-pill-success";
  if (status === "NOT_FOUND") return "status-pill status-pill-muted";
  return "status-pill status-pill-neutral";
}
