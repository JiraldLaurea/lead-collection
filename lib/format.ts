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

export function formatCity(searchLocation?: string | null) {
  if (!searchLocation) return "N/A";
  const city = searchLocation.split(",")[0]?.trim();
  return city || "N/A";
}

export function formatDateTime(value?: Date | string | null) {
  if (!value) return "N/A";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila"
  }).format(date);
}

export function emailStatusPillClassName(status?: string | null) {
  if (status === "FOUND") return "status-pill status-pill-success";
  if (status === "NOT_FOUND") return "status-pill status-pill-muted";
  return "status-pill status-pill-neutral";
}
