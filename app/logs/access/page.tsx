import { prisma } from "@/lib/prisma";
import { requirePageAdmin } from "@/lib/require-auth";

export default async function AccessLogsPage() {
  await requirePageAdmin();
  const logs = await prisma.accessLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <section className="stack">
      <div className="page-title">
        <h1>Access Logs</h1>
        <p>Review recent office network requests and access decisions.</p>
      </div>
      <div className="table-frame">
        <div className="table-scroll logs-table-frame">
          <table className="logs-table">
            <thead><tr><th>Time</th><th>IP</th><th>Method</th><th>Path</th><th>Decision</th><th>Reason</th></tr></thead>
            <tbody>{logs.map((log) => (
              <tr key={log.id}>
                <td>{log.createdAt.toLocaleString()}</td>
                <td>{log.ipAddress}</td>
                <td>{log.method}</td>
                <td>{log.path}</td>
                <td className={log.decision === "ALLOWED" ? "status-ok" : "status-warn"}>{log.decision}</td>
                <td>{log.reason || "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
