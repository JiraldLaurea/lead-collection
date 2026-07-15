"use client";

import { useRouter } from "next/navigation";

export type DashboardRecentLead = {
  id: number;
  businessName: string;
  category: string;
  email: string;
  collectedAt: string;
  href: string;
};

export function DashboardRecentLeadsTable({ leads }: { leads: DashboardRecentLead[] }) {
  const router = useRouter();

  if (leads.length === 0) {
    return <p className="muted">No leads found.</p>;
  }

  return (
    <div className="table-frame dashboard-table-frame">
      <div className="table-scroll">
        <table className="dashboard-table dashboard-recent-leads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Email</th>
              <th>Collected</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                className="clickable-row"
                key={lead.id}
                tabIndex={0}
                onClick={() => router.push(lead.href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(lead.href);
                  }
                }}
              >
                <td>{lead.businessName}</td>
                <td>{lead.category}</td>
                <td>{lead.email}</td>
                <td>{lead.collectedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
