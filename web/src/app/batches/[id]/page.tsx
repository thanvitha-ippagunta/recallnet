import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import AppShell from "@/components/app-shell";
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { loadBatchComposition, loadBatchCore } from "@/lib/api/batch-data";
import { parsePositiveSqlId } from "@/lib/api/http";
import { mysqlPool } from "@/lib/db/mysql";

export const instant = false;

interface Movement extends RowDataPacket {
  shipment_id: string;
  parent_shipment_id: string | null;
  status: string;
  dispatched_at: string;
  quantity: string;
  source_warehouse: string | null;
  source_distributor: string | null;
  destination_distributor: string | null;
  destination_retailer: string | null;
}

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parsePositiveSqlId(rawId);
  if (!id) notFound();

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await authorizePermission(
    new Request("http://recallnet.local/", {
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    }),
    "traceability:read",
  );
  if (!auth.authorized) {
    if (auth.response.status === 401) redirect("/login");
    if (auth.response.status >= 500) throw new Error("Traceability access could not be checked.");
    redirect("/");
  }

  const batch = await loadBatchCore(id);
  if (!batch) notFound();
  const [composition, movementResult] = await Promise.all([
    loadBatchComposition(id),
    mysqlPool.execute<Movement[]>(
      `SELECT sh.shipment_id, sh.parent_shipment_id, sh.status, sh.dispatched_at,
              si.quantity, sw.name AS source_warehouse, sd.name AS source_distributor,
              dd.name AS destination_distributor, rt.name AS destination_retailer
       FROM shipment_items si
       JOIN shipments sh ON sh.shipment_id = si.shipment_id
       LEFT JOIN warehouses sw ON sw.warehouse_id = sh.source_warehouse_id
       LEFT JOIN distributors sd ON sd.distributor_id = sh.source_distributor_id
       LEFT JOIN distributors dd ON dd.distributor_id = sh.destination_distributor_id
       LEFT JOIN retailers rt ON rt.retailer_id = sh.destination_retailer_id
       WHERE si.prod_batch_id = ? AND sh.status IN ('DISPATCHED', 'DELIVERED')
       ORDER BY sh.dispatched_at, sh.shipment_id`,
      [id],
    ),
  ]);
  const movements = movementResult[0];

  return (
    <AppShell active="batches" user={auth.user}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">BATCH TRACEABILITY</p>
          <h1>{batch.batchNo}</h1>
          <p className="subhead">{batch.product.name} · {batch.product.category}</p>
        </div>
        <Link className="text-link" href="/batches">← All batches</Link>
      </div>
      <div className="detail-grid">
        <div className="detail-cell"><small>Production quantity</small><b>{batch.quantity} {batch.product.unit}</b></div>
        <div className="detail-cell"><small>Current status</small><b>{batch.status.replaceAll("_", " ")}</b></div>
        <div className="detail-cell"><small>Initial warehouse</small><b>{batch.initialWarehouse.name}</b></div>
        <div className="detail-cell"><small>Manufactured</small><b>{batch.manufacturedOn}</b></div>
        <div className="detail-cell"><small>Expiration</small><b>{batch.expiresOn}</b></div>
        <div className="detail-cell"><small>Batch ID</small><b>#{batch.id}</b></div>
      </div>
      {batch.product.description && <p className="notice">{batch.product.description}</p>}
      <div className="section-heading">
        <div><p className="eyebrow">UPSTREAM</p><h2>Raw materials and suppliers</h2></div>
      </div>
      <div className="table-card table-wrap">
        <table>
          <thead><tr><th>Material batch</th><th>Material</th><th>Supplier</th><th>Quantity used</th><th>Expires</th></tr></thead>
          <tbody>
            {composition.map((item) => (
              <tr key={item.rawMaterialBatch.id}>
                <td>{item.rawMaterialBatch.batchNo}</td>
                <td>{item.rawMaterialBatch.materialName}</td>
                <td>{item.supplier.name}</td>
                <td>{item.quantityUsed} {item.quantityUnit}</td>
                <td>{item.rawMaterialBatch.expiresOn}</td>
              </tr>
            ))}
            {composition.length === 0 && <tr><td colSpan={5} className="empty">No composition rows recorded.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="section-heading downstream-heading">
        <div><p className="eyebrow">DOWNSTREAM</p><h2>Distribution movements</h2></div>
      </div>
      <div className="table-card table-wrap">
        <table>
          <thead><tr><th>Movement</th><th>Route</th><th>Quantity</th><th>Dispatched</th><th>Status</th></tr></thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.shipment_id}>
                <td>#{movement.shipment_id}{movement.parent_shipment_id ? ` · follows #${movement.parent_shipment_id}` : ""}</td>
                <td>{movement.source_warehouse ?? movement.source_distributor ?? "Unknown"} → {movement.destination_distributor ?? movement.destination_retailer ?? "Direct"}</td>
                <td>{movement.quantity}</td>
                <td>{String(movement.dispatched_at).slice(0, 16)}</td>
                <td>{movement.status}</td>
              </tr>
            ))}
            {movements.length === 0 && <tr><td colSpan={5} className="empty">No dispatched movements recorded for this batch.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
