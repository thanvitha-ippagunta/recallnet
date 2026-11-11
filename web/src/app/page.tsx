import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { mysqlPool } from "@/lib/db/mysql";
import { SESSION_COOKIE_NAME, getSessionUser } from "@/lib/auth/session";
import AppShell from "@/components/app-shell";

export const instant = false;

interface SummaryRow extends RowDataPacket {
  total_batches: string;
  completed_batches: string;
  recalled_batches: string;
  open_recalls: string;
  dispatched_shipments: string;
}

interface BatchRow extends RowDataPacket {
  prod_batch_id: string;
  batch_no: string;
  quantity: string;
  status: string;
  product_name: string;
  warehouse_name: string;
  mfg_date: string;
}

interface RecallRow extends RowDataPacket {
  recall_id: string;
  recall_no: string;
  reason: string;
  initiated_at: string;
  status: string;
  batch_count: string;
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: string }) {
  return <article className={`metric metric-${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function StateBadge({ value }: { value: string }) {
  return <span className={`state state-${value.toLowerCase().replaceAll("_", "-")}`}>{value.replaceAll("_", " ")}</span>;
}

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const request = new Request("http://recallnet.local/", {
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
  const user = await getSessionUser(request).catch(() => null);
  if (!user) redirect("/login");

  const [summaryResult, batchResult, recallResult] = await Promise.allSettled([
    mysqlPool.execute<SummaryRow[]>(
      `SELECT COUNT(*) AS total_batches,
       SUM(status='COMPLETED') AS completed_batches,
       SUM(status='RECALLED') AS recalled_batches,
       (SELECT COUNT(*) FROM recalls WHERE status IN ('OPEN','IN_PROGRESS')) AS open_recalls,
       (SELECT COUNT(*) FROM shipments WHERE status='DISPATCHED') AS dispatched_shipments
       FROM production_batches`,
    ),
    mysqlPool.execute<BatchRow[]>(
      `SELECT pb.prod_batch_id,pb.batch_no,pb.quantity,pb.status,pb.mfg_date,
              p.name AS product_name,w.name AS warehouse_name
       FROM production_batches pb JOIN products p ON p.product_id=pb.product_id
       JOIN warehouses w ON w.warehouse_id=pb.warehouse_id
       ORDER BY pb.created_at DESC,pb.prod_batch_id DESC LIMIT 8`,
    ),
    mysqlPool.execute<RecallRow[]>(
      `SELECT r.recall_id,r.recall_no,r.reason,r.initiated_at,r.status,
              COUNT(rab.rab_id) AS batch_count
       FROM recalls r LEFT JOIN recall_affected_batches rab ON rab.recall_id=r.recall_id
       GROUP BY r.recall_id ORDER BY r.initiated_at DESC,r.recall_id DESC LIMIT 5`,
    ),
  ]);
  const stats = summaryResult.status === "fulfilled" ? summaryResult.value[0][0] : null;
  const batches = batchResult.status === "fulfilled" ? batchResult.value[0] : [];
  const recalls = recallResult.status === "fulfilled" ? recallResult.value[0] : [];
  const dbReady = Boolean(stats);

  return (
    <AppShell active="overview" user={user}>
      <div className="welcome-row">
        <div>
          <p className="eyebrow">SUPPLY CHAIN CONTROL</p>
          <h1>Operations overview</h1>
          <p className="subhead">Monitor batches, follow product movement and respond to quality events.</p>
        </div>
        <div className={`connection-pill ${dbReady ? "online" : "offline"}`}>
          <span /> {dbReady ? "Database connected" : "Database unavailable"}
        </div>
      </div>
      {!dbReady && (
        <div className="notice warning" role="status">
          The dashboard could not load database metrics. Check the MySQL service and local environment configuration.
        </div>
      )}
      <div className="metrics-grid">
        <Metric label="Production batches" value={stats?.total_batches ?? "—"} />
        <Metric label="Completed batches" value={stats?.completed_batches ?? "—"} tone="green" />
        <Metric label="Active recalls" value={stats?.open_recalls ?? "—"} tone="amber" />
        <Metric label="Dispatched shipments" value={stats?.dispatched_shipments ?? "—"} tone="blue" />
      </div>
      <div className="section-heading" id="batches">
        <div><p className="eyebrow">INVENTORY</p><h2>Recent production batches</h2></div>
        <Link className="text-link" href="/batches">View all batches <span>→</span></Link>
      </div>
      <div className="table-card table-wrap">
        <table>
          <thead><tr><th>Batch</th><th>Product</th><th>Manufactured</th><th>Quantity</th><th>Warehouse</th><th>Status</th></tr></thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.prod_batch_id}>
                <td><Link className="batch-link" href={`/batches/${batch.prod_batch_id}`}>{batch.batch_no}</Link></td>
                <td>{batch.product_name}</td>
                <td>{String(batch.mfg_date).slice(0, 10)}</td>
                <td>{batch.quantity}</td>
                <td>{batch.warehouse_name}</td>
                <td><StateBadge value={batch.status} /></td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={6} className="empty">No batch records available.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="lower-grid">
        <section id="recalls">
          <div className="section-heading compact">
            <div><p className="eyebrow">QUALITY</p><h2>Recent recalls</h2></div>
            <Link className="text-link" href="/recalls">Recall center <span>→</span></Link>
          </div>
          <div className="recall-card">
            {recalls.map((recall) => (
              <Link className="recall-row" href={`/recalls/${recall.recall_id}`} key={recall.recall_id}>
                <span aria-hidden="true" className="recall-icon">!</span>
                <span className="recall-info"><b>{recall.recall_no}</b><small>{recall.reason}</small></span>
                <StateBadge value={recall.status} />
              </Link>
            ))}
            {recalls.length === 0 && <div className="empty">No recalls recorded.</div>}
          </div>
        </section>
        <section id="traceability">
          <div className="section-heading compact"><div><p className="eyebrow">QUICK ACCESS</p><h2>Trace a product batch</h2></div></div>
          <form action="/batches" className="trace-form">
            <label htmlFor="batch-search">Batch number or product name</label>
            <div><input id="batch-search" name="search" placeholder="e.g. CB-2603-A"/><button type="submit">Find batch <span>→</span></button></div>
            <p>Trace raw materials, suppliers and each distribution movement.</p>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
