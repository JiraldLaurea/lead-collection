import { requirePageAdmin } from "@/lib/require-auth";
import { getDashboardMetrics } from "@/lib/leads";

export default async function DashboardPage() {
  await requirePageAdmin();
  const metrics = await getDashboardMetrics();
  return (
    <section className="stack">
      <div className="page-title">
        <h1>Overview</h1>
        <p>Monitor lead activity, recent collection results, and office access health.</p>
      </div>
      <div className="grid">
        <div className="card metric">Total saved leads<strong>{metrics.totalLeads}</strong></div>
        <div className="card metric">Leads collected today<strong>{metrics.leadsToday}</strong></div>
        <div className="card metric">Duplicates skipped in last search<strong>{metrics.duplicatesSkipped}</strong></div>
        <div className="card metric metric-compact">Last search time<strong>{metrics.lastSearchTime ? metrics.lastSearchTime.toLocaleString() : "None"}</strong></div>
      </div>
      <div className="panel dashboard-panel">
        <h2>Recent API Errors</h2>
        {metrics.recentErrors.length === 0 ? <p className="muted">No recent API errors.</p> : (
          <div className="table-frame dashboard-table-frame">
            <div className="table-scroll">
              <table className="dashboard-table">
                <thead><tr><th>Time</th><th>Code</th><th>Message</th></tr></thead>
                <tbody>{metrics.recentErrors.map((error) => (
                  <tr key={error.id}><td>{error.createdAt.toLocaleString()}</td><td>{error.errorCode}</td><td>{error.errorMessage}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="panel dashboard-panel">
        <h2>Office Network</h2>
        <p>Allowed CIDRs: <strong>{process.env.OFFICE_ALLOWED_CIDRS || "localhost only"}</strong></p>
        <p className="muted">Use the host PC private IP, for example <code>http://192.168.0.106:3000</code>.</p>
      </div>
    </section>
  );
}
