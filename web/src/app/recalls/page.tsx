import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import AppShell from "@/components/app-shell";
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";
import RecallForm from "./recall-form";

export const instant = false;

interface RecallRow extends RowDataPacket {
  recall_id: string;
  recall_no: string;
  reason: string;
  initiated_at: string;
  initiated_by: string;
  status: string;
  batch_count: string;
}

interface BatchOption extends RowDataPacket {
  id: string;
  batchNo: string;
  status: string;
}

export default async function RecallsPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await authorizePermission(
    new Request("http://recallnet.local/", {
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    }),
    "recalls:read",
  );
  if (!auth.authorized) redirect("/login");

  let recalls: RecallRow[] = [];
  let batches: BatchOption[] = [];
  let loadFailed = false;
  try {
    const [recallRows, batchRows] = await Promise.all([
      mysqlPool.execute<RecallRow[]>(
        `SELECT r.recall_id, r.recall_no, r.reason, r.initiated_at, r.initiated_by,
                r.status, COUNT(rab.rab_id) AS batch_count
         FROM recalls r
         LEFT JOIN recall_affected_batches rab ON rab.recall_id = r.recall_id
         GROUP BY r.recall_id
         ORDER BY r.initiated_at DESC, r.recall_id DESC
         LIMIT 100`,
      ),
      mysqlPool.execute<BatchOption[]>(
        `SELECT prod_batch_id AS id, batch_no AS batchNo, status
         FROM production_batches ORDER BY batch_no`,
      ),
    ]);
    recalls = recallRows[0];
    batches = batchRows[0];
  } catch {
    loadFailed = true;
  }

  const canOpenRecall = auth.user.role === "ADMIN" || auth.user.role === "QUALITY_MANAGER";

  return (
    <AppShell active="recalls" user={auth.user}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">QUALITY MANAGEMENT</p>
          <h1>Recall center</h1>
          <p className="subhead">Review affected production batches and follow their distribution trail.</p>
        </div>
        <Link className="text-link" href="/">← Operations overview</Link>
      </div>
      {canOpenRecall && !loadFailed && (
        <div className="recall-form-wrap"><RecallForm batches={batches} /></div>
      )}
      {!canOpenRecall && <p className="notice">Your role can review recalls but cannot open one.</p>}
      {loadFailed && (
        <p className="notice warning" role="alert">
          Recall records could not be loaded. Check the database connection and try again.
        </p>
      )}
      <div className="section-heading compact">
        <div><p className="eyebrow">RECALL HISTORY</p><h2>Recent recalls</h2></div>
        {!loadFailed && <span className="subhead">Showing {recalls.length} {recalls.length === 1 ? "recall" : "recalls"}</span>}
      </div>
      <div className="table-card table-wrap">
        <table>
          <thead><tr><th>Recall</th><th>Reason</th><th>Started</th><th>Initiated by</th><th>Affected batches</th><th>Status</th></tr></thead>
          <tbody>
            {!loadFailed && recalls.map((recall) => (
              <tr key={recall.recall_id}>
                <td><Link className="batch-link" href={`/recalls/${recall.recall_id}`}>{recall.recall_no}</Link></td>
                <td>{recall.reason}</td>
                <td>{String(recall.initiated_at).slice(0, 16)}</td>
                <td>{recall.initiated_by}</td>
                <td>{recall.batch_count}</td>
                <td><span className={`state state-${recall.status.toLowerCase().replaceAll("_", "-")}`}>{recall.status.replaceAll("_", " ")}</span></td>
              </tr>
            ))}
            {!loadFailed && recalls.length === 0 && <tr><td colSpan={6} className="empty">No recall records available.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
