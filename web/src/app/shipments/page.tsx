import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import AppShell from "@/components/app-shell";
import { hasPermission } from "@/lib/auth/roles";
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
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

interface BatchOption extends RowDataPacket {
  prod_batch_id: string;
  batch_no: string;
  available_quantity: string;
}

interface RouteOption extends RowDataPacket {
  id: string;
  name: string;
}

export default async function ShipmentsPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const request = new Request("http://recallnet.local/", {
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
  const warehouseAuth = await authorizePermission(request, "warehouse-shipments:read");
  const downstreamAuth = warehouseAuth.authorized
    ? null
    : await authorizePermission(request, "assigned-shipments:read");
  const user = warehouseAuth.authorized
    ? warehouseAuth.user
    : downstreamAuth?.authorized
      ? downstreamAuth.user
      : null;
  if (!user) {
    const failureStatus = downstreamAuth && !downstreamAuth.authorized
      ? downstreamAuth.response.status
      : !warehouseAuth.authorized
        ? warehouseAuth.response.status
        : 500;
    if (failureStatus === 401) redirect("/login");
    if (failureStatus >= 500) throw new Error("Shipment access could not be checked.");
    redirect("/");
  }

  const isDistributor = user.role === "DISTRIBUTOR";
  const isWarehouseManager = user.role === "WAREHOUSE_MANAGER";
  let shipments: ShipmentRow[] = [];
  let batches: BatchOption[] = [];
  let warehouses: RouteOption[] = [];
  let distributors: RouteOption[] = [];
  let retailers: RouteOption[] = [];
  let loadFailed = false;

  try {
    const shipmentConditions: string[] = [];
    const shipmentValues: string[] = [];
    if (isDistributor) {
      if (!user.distributorId) {
        return (
          <AppShell active="shipments" user={user}>
            <div className="section-heading">
              <div><p className="eyebrow">DISTRIBUTION</p><h1>Shipments</h1></div>
              <Link className="text-link" href="/">← Operations overview</Link>
            </div>
            <p className="notice warning" role="alert">This distributor account is not linked to a distributor record.</p>
          </AppShell>
        );
      }
      shipmentConditions.push("(sh.source_distributor_id = ? OR sh.destination_distributor_id = ?)");
      shipmentValues.push(user.distributorId, user.distributorId);
    } else if (isWarehouseManager) {
      shipmentConditions.push("sh.source_warehouse_id IS NOT NULL");
    }
    const shipmentWhere = shipmentConditions.length ? `WHERE ${shipmentConditions.join(" AND ")}` : "";

    const shipmentQuery = mysqlPool.execute<ShipmentRow[]>(
      `SELECT sh.shipment_id, sh.status, sh.created_at, sh.dispatched_at,
              sh.source_warehouse_id, sh.source_distributor_id,
              sh.destination_distributor_id, sh.destination_retailer_id,
              sh.lr_number, COUNT(si.shipment_item_id) AS item_count,
              COALESCE(SUM(si.quantity), 0) AS total_quantity,
              GROUP_CONCAT(pb.batch_no ORDER BY pb.batch_no SEPARATOR ', ') AS batch_numbers
       FROM shipments sh
       LEFT JOIN shipment_items si ON si.shipment_id = sh.shipment_id
       LEFT JOIN production_batches pb ON pb.prod_batch_id = si.prod_batch_id
       ${shipmentWhere}
       GROUP BY sh.shipment_id
       ORDER BY sh.created_at DESC, sh.shipment_id DESC
       LIMIT 100`,
      shipmentValues,
    );

    const [shipmentRows] = await shipmentQuery;
    shipments = shipmentRows;

    if (user.role === "ADMIN" || isDistributor) {
      const batchQuery = mysqlPool.execute<BatchOption[]>(
        `SELECT pb.prod_batch_id, pb.batch_no,
                GREATEST(pb.quantity - COALESCE((
                  SELECT SUM(si.quantity) FROM shipment_items si
                  JOIN shipments sh ON sh.shipment_id = si.shipment_id
                  WHERE si.prod_batch_id = pb.prod_batch_id AND sh.status = 'DISPATCHED'
                ), 0), 0) AS available_quantity
         FROM production_batches pb
         WHERE pb.status = 'COMPLETED'
         ORDER BY pb.batch_no`,
      );
      const retailerQuery = mysqlPool.execute<RouteOption[]>(
        "SELECT retailer_id AS id, name FROM retailers ORDER BY name",
      );

      if (user.role === "ADMIN") {
        const [batchRows, warehouseRows, distributorRows, retailerRows] = await Promise.all([
          batchQuery,
          mysqlPool.execute<RouteOption[]>("SELECT warehouse_id AS id, name FROM warehouses ORDER BY name"),
          mysqlPool.execute<RouteOption[]>("SELECT distributor_id AS id, name FROM distributors ORDER BY name"),
          retailerQuery,
        ]);
        batches = batchRows[0];
        warehouses = warehouseRows[0];
        distributors = distributorRows[0];
        retailers = retailerRows[0];
      } else {
        const [batchRows, retailerRows] = await Promise.all([batchQuery, retailerQuery]);
        batches = batchRows[0];
        retailers = retailerRows[0];
      }
    }
  } catch {
    loadFailed = true;
  }

  const canCreate = user.role === "ADMIN" || user.role === "DISTRIBUTOR";
  const canDispatch = canCreate;
  const workspaceKey = shipments
    .map((shipment) => `${shipment.shipment_id}:${shipment.status}:${shipment.created_at}`)
    .join("|");

  return (
    <AppShell active="shipments" user={user}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">DISTRIBUTION</p>
          <h1>Shipments</h1>
          <p className="subhead">Create draft movements, review distribution activity, and dispatch validated shipments.</p>
        </div>
        <Link className="text-link" href="/">← Operations overview</Link>
      </div>
      {loadFailed && (
        <p className="notice warning" role="alert">
          Shipment data could not be loaded. Check the database connection and try again.
        </p>
      )}
      {!loadFailed && (
        <ShipmentWorkspace
          key={workspaceKey}
          shipments={shipments.map((row) => ({
            id: row.shipment_id,
            status: row.status,
            createdAt: row.created_at,
            dispatchedAt: row.dispatched_at,
            sourceWarehouseId: row.source_warehouse_id,
            sourceDistributorId: row.source_distributor_id,
            destinationDistributorId: row.destination_distributor_id,
            destinationRetailerId: row.destination_retailer_id,
            trackingNumber: row.lr_number,
            itemCount: row.item_count,
            quantity: row.total_quantity,
            batches: row.batch_numbers,
          }))}
          batches={batches.map((row) => ({ id: row.prod_batch_id, batchNo: row.batch_no, availableQuantity: row.available_quantity }))}
          warehouses={warehouses}
          distributors={distributors}
          retailers={retailers}
          role={user.role}
          canCreate={canCreate}
          canDispatch={canDispatch}
          canAudit={hasPermission(user.role, "audit:read")}
        />
      )}
    </AppShell>
  );
}
