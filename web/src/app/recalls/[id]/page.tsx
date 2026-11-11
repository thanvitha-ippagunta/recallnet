import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import AppShell from "@/components/app-shell";
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { parsePositiveSqlId } from "@/lib/api/http";
import { mysqlPool } from "@/lib/db/mysql";

export const instant = false;

interface RecallRow extends RowDataPacket {
  recall_id: string;
  recall_no: string;
  reason: string;
  initiated_at: string;
  initiated_by: string;
  status: string;
  description: string | null;
}

interface AffectedBatchRow extends RowDataPacket {
  prod_batch_id: string;
  batch_no: string;
  product_name: string;
  production_quantity: string;
  affected_quantity: string;
  recovered_quantity: string;
  status: string;
}

interface DistributionRow extends RowDataPacket {
  prod_batch_id: string;
  shipment_id: string;
  status: string;
  dispatched_at: string;
  source_warehouse: string | null;
  source_distributor: string | null;
  destination_distributor: string | null;
  destination_retailer: string | null;
  quantity: string;
}

export default async function RecallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parsePositiveSqlId(rawId);
  if (!id) notFound();

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await authorizePermission(
    new Request("http://recallnet.local/", {
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    }),
    "recalls:read",
  );
  if (!auth.authorized) redirect("/login");

  const [recallRows] = await mysqlPool.execute<RecallRow[]>(
    `SELECT recall_id, recall_no, reason, initiated_at, initiated_by, status, description
     FROM recalls WHERE recall_id = ? LIMIT 1`,
    [id],
  );
  const recall = recallRows[0];
  if (!recall) notFound();

  const [batchRows] = await mysqlPool.execute<AffectedBatchRow[]>(
    `SELECT pb.prod_batch_id, pb.batch_no, p.name AS product_name,
            pb.quantity AS production_quantity, rab.affected_quantity,
            rab.recovered_quantity, rab.status
     FROM recall_affected_batches rab
     JOIN production_batches pb ON pb.prod_batch_id = rab.prod_batch_id
     JOIN products p ON p.product_id = pb.product_id
     WHERE rab.recall_id = ?
     ORDER BY pb.batch_no`,
    [id],
  );

  let routes: DistributionRow[] = [];
  if (batchRows.length > 0) {
    const placeholders = batchRows.map(() => "?").join(", ");
    const [routeRows] = await mysqlPool.execute<DistributionRow[]>(
      `SELECT prod_batch_id, shipment_id, status, dispatched_at,
              source_warehouse, source_distributor, destination_distributor,
              destination_retailer, quantity
       FROM v_batch_distribution
       WHERE prod_batch_id IN (${placeholders})
       ORDER BY dispatched_at, shipment_id`,
      batchRows.map((batch) => batch.prod_batch_id),
    );
    routes = routeRows;
  }

  const routesByBatch = new Map<string, DistributionRow[]>();
  for (const route of routes) {
    const entries = routesByBatch.get(route.prod_batch_id) ?? [];
    entries.push(route);
    routesByBatch.set(route.prod_batch_id, entries);
  }

  return (
    <AppShell active="recalls" user={auth.user}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">RECALL INVESTIGATION</p>
          <h1>{recall.recall_no}</h1>
          <p className="subhead">Initiated {String(recall.initiated_at).slice(0, 16)} by {recall.initiated_by}</p>
        </div>
        <Link className="text-link" href="/recalls">← Recall center</Link>
      </div>
      <div className="detail-grid">
        <div className="detail-cell"><small>Status</small><b>{recall.status.replaceAll("_", " ")}</b></div>
        <div className="detail-cell"><small>Reason</small><b>{recall.reason}</b></div>
        <div className="detail-cell"><small>Affected batches</small><b>{batchRows.length}</b></div>
      </div>
      {recall.description && <div className="notice warning">{recall.description}</div>}
      {batchRows.map((batch) => (
        <section className="recall-batch" key={batch.prod_batch_id}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">AFFECTED BATCH</p>
              <h2><Link className="batch-link" href={`/batches/${batch.prod_batch_id}`}>{batch.batch_no}</Link> · {batch.product_name}</h2>
            </div>
          </div>
          <div className="detail-grid">
            <div className="detail-cell"><small>Production quantity</small><b>{batch.production_quantity}</b></div>
            <div className="detail-cell"><small>Affected quantity</small><b>{batch.affected_quantity}</b></div>
            <div className="detail-cell"><small>Recovered quantity</small><b>{batch.recovered_quantity}</b></div>
          </div>
          <div className="table-card table-wrap">
            <table>
              <thead><tr><th>Movement</th><th>Route</th><th>Quantity moved</th><th>Dispatched</th><th>Status</th></tr></thead>
              <tbody>
                {(routesByBatch.get(batch.prod_batch_id) ?? []).map((route) => (
                  <tr key={route.shipment_id}>
                    <td>#{route.shipment_id}</td>
                    <td>{route.source_warehouse ?? route.source_distributor ?? "Unknown"} → {route.destination_distributor ?? route.destination_retailer ?? "Direct"}</td>
                    <td>{route.quantity}</td>
                    <td>{String(route.dispatched_at).slice(0, 16)}</td>
                    <td>{route.status.replaceAll("_", " ")}</td>
                  </tr>
                ))}
                {!routesByBatch.has(batch.prod_batch_id) && (
                  <tr><td colSpan={5} className="empty">No distribution movements recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {batchRows.length === 0 && <p className="empty-panel">No affected batch records are linked to this recall.</p>}
    </AppShell>
  );
}
