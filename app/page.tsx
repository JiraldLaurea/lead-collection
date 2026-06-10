import { DashboardRecentLeadsTable } from "@/components/DashboardRecentLeadsTable";
import { DashboardMetricTabs } from "@/components/DashboardMetricTabs";
import { requirePageAdmin } from "@/lib/require-auth";
import { getDashboardMetrics } from "@/lib/leads";
import { formatCategoryLabel } from "@/lib/format";

export default async function DashboardPage() {
  await requirePageAdmin();
  const metrics = await getDashboardMetrics();
  const dailyCards = [
    {
      label: "Emails sent today",
      value: metrics.emailsSentToday,
      footer: `Total emails sent: ${metrics.emailsSent}`,
      iconPaths: ["M4 6h16v12H4Z", "M4 7l8 6 8-6"]
    },
    {
      label: "Leads today",
      value: metrics.leadsToday,
      footer: `Total leads: ${metrics.totalLeads}`,
      iconPaths: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6", "M8 13h8", "M8 17h5"]
    },
    {
      label: "Leads with email today",
      value: metrics.leadsWithEmailToday,
      footer: `Total leads with email: ${metrics.leadsWithEmail}`,
      iconPaths: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"]
    }
  ];
  const totalCards = [
    {
      label: "Emails sent total",
      value: metrics.emailsSent,
      footer: `Emails sent today: ${metrics.emailsSentToday}`,
      iconPaths: ["M4 6h16v12H4Z", "M4 7l8 6 8-6"]
    },
    {
      label: "Total leads",
      value: metrics.totalLeads,
      footer: `Leads today: ${metrics.leadsToday}`,
      iconPaths: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6", "M8 13h8", "M8 17h5"]
    },
    {
      label: "Total leads with email",
      value: metrics.leadsWithEmail,
      footer: `Leads with email today: ${metrics.leadsWithEmailToday}`,
      iconPaths: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"]
    }
  ];

  return (
    <section className="stack dashboard-page">
      <div className="page-title">
        <h1>Dashboard</h1>
        <p>Track lead collection, email discovery, and outreach activity.</p>
      </div>
      <DashboardMetricTabs dailyCards={dailyCards} totalCards={totalCards} />
      <section className="stack dashboard-recent-leads-section">
        <h2>Recent leads</h2>
        <DashboardRecentLeadsTable
          leads={metrics.recentLeads.map((lead) => ({
            id: lead.id,
            businessName: lead.businessName,
            category: formatCategoryLabel(lead.category),
            email: lead.email || "N/A",
            collectedAt: lead.collectedAt.toLocaleString()
          }))}
        />
      </section>
    </section>
  );
}
