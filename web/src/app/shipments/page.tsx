import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { mysqlPool } from "@/lib/db/mysql";
import ShipmentWorkspace from "./shipment-workspace";

export const instant = false;

interface ShipmentRow extends RowDataPacket {
  shipment_id: string;
  status: string;
  created_at: string;
  dispatched_at: string | null;
  source_warehouse_id: string | null;
  source_distributor_id: string | null;
  destination_distributor_id: string | null;
  destination_retailer_id: string | null;
  lr_number: string | null;
  item_count: string;
  total_quantity: string;
  batch_numbers: string;
}
interface BatchOption extends RowDataPacket { prod_batch_id: string; batch_no: string; status: string; available_quantity: string }
interface RouteOption extends RowDataPacket { id: string; name: string }

export default async function ShipmentsPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const request = new Request("http://recallnet.local/", { headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {} });
  const auth = await authorizePermission(request, "warehouse-shipments:read");
  const downstreamAuth = auth.authorized ? null : await authorizePermission(request, "assigned-shipments:read");
  const user = auth.authorized ? auth.user : downstreamAuth?.authorized ? downstreamAuth.user : null;
  if (!user) redirect("/login");

  const isDistributor = user.role === "DISTRIBUTOR";
  const [shipmentRows, batches, warehouses, distributors, retailers] = await Promise.all([
    mysqlPool.execute<ShipmentRow[]>(
      `SELECT sh.shipment_id,sh.status,sh.created_at,sh.dispatched_at,sh.source_warehouse_id,
       sh.source_distributor_id,sh.destination_distributor_id,sh.destination_retailer_id,sh.lr_number,
       COUNT(si.shipment_item_id) AS item_count,COALESCE(SUM(si.quantity),0) AS total_quantity,
       GROUP_CONCAT(pb.batch_no ORDER BY pb.batch_no SEPARATOR ', ') AS batch_numbers
       FROM shipments sh LEFT JOIN shipment_items si ON si.shipment_id=sh.shipment_id
       LEFT JOIN production_batches pb ON pb.prod_batch_id=si.prod_batch_id
       WHERE (? = 0 OR sh.source_distributor_id=? OR sh.destination_distributor_id=?)
       GROUP BY sh.shipment_id ORDER BY sh.created_at DESC,sh.shipment_id DESC LIMIT 100`,
      [isDistributor ? 1 : 0, user.distributorId ?? "", user.distributorId ?? ""],
    ),
    mysqlPool.execute<BatchOption[]>(
      `SELECT pb.prod_batch_id,pb.batch_no,pb.status,
       GREATEST(pb.quantity-COALESCE((SELECT SUM(si.quantity) FROM shipment_items si JOIN shipments sh ON sh.shipment_id=si.shipment_id WHERE si.prod_batch_id=pb.prod_batch_id AND sh.status='DISPATCHED'),0),0) AS available_quantity
       FROM production_batches pb WHERE pb.status='COMPLETED' ORDER BY pb.batch_no`,
    ),
    mysqlPool.execute<RouteOption[]>("SELECT warehouse_id AS id,name FROM warehouses ORDER BY name"),
    mysqlPool.execute<RouteOption[]>("SELECT distributor_id AS id,name FROM distributors ORDER BY name"),
    mysqlPool.execute<RouteOption[]>("SELECT retailer_id AS id,name FROM retailers ORDER BY name"),
  ]);
  const canCreate = user.role === "ADMIN" || user.role === "DISTRIBUTOR";
  const canDispatch = user.role === "ADMIN" || user.role === "DISTRIBUTOR";
  return <main className="content">
    <div className="section-heading"><div><p className="eyebrow">DISTRIBUTION</p><h1>Shipments</h1><p className="subhead">Create draft movements, review distribution activity, and dispatch validated shipments.</p></div><Link className="text-link" href="/">← Operations overview</Link></div>
    <ShipmentWorkspace shipments={shipmentRows[0].map(row => ({ id: row.shipment_id, status: row.status, createdAt: row.created_at, dispatchedAt: row.dispatched_at, sourceWarehouseId: row.source_warehouse_id, sourceDistributorId: row.source_distributor_id, destinationDistributorId: row.destination_distributor_id, destinationRetailerId: row.destination_retailer_id, trackingNumber: row.lr_number, itemCount: row.item_count, quantity: row.total_quantity, batches: row.batch_numbers }))} batches={batches[0].map(row => ({ id: row.prod_batch_id, batchNo: row.batch_no, availableQuantity: row.available_quantity }))} warehouses={warehouses[0]} distributors={distributors[0]} retailers={retailers[0]} role={user.role} canCreate={canCreate} canDispatch={canDispatch} canAudit={hasPermission(user.role,"audit:read")} />
  </main>;
}
