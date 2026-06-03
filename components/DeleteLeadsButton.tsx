"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";

type DeleteLeadsButtonProps = {
  leadCount: number;
};

export function DeleteLeadsButton({ leadCount }: DeleteLeadsButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);

  async function deleteLeads() {
    if (leadCount === 0 || loading) return;
    const confirmed = window.confirm(`Delete all ${leadCount} leads? This cannot be undone.`);
    if (!confirmed) return;

    setLoading(true);
    const response = await fetch("/api/leads", { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);

    if (response.ok) {
      setDeletedCount(payload.data?.deleted ?? leadCount);
      router.refresh();
    }
  }

  return (
    <div className="settings-action">
      {loading ? <LoadingModal label="Deleting leads" /> : null}
      <div>
        <h2>Lead Data</h2>
        <p className="muted">Delete all saved leads from the database.</p>
        {deletedCount !== null ? <p className="muted">{deletedCount} leads deleted.</p> : null}
      </div>
      <button className="danger delete-button" type="button" onClick={deleteLeads} disabled={leadCount === 0 || loading}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M6 6l1 16h10l1-16" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
        Delete Leads
      </button>
    </div>
  );
}
