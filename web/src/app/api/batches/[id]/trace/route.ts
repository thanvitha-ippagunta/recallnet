import type { RowDataPacket } from "mysql2";
import { apiError, internalApiError, parsePositiveSqlId } from "@/lib/api/http";
import { authorizePermission } from "@/lib/auth/session";
import { loadBatchComposition, loadBatchCore } from "@/lib/api/batch-data";
import { mysqlPool } from "@/lib/db/mysql";

type RouteContext = { params: Promise<{ id: string }> };

interface MovementRow extends RowDataPacket {
  shipment_id: string;
  parent_shipment_id: string | null;
  status: "DISPATCHED" | "DELIVERED";
  dispatched_at: string;
  delivered_at: string | null;
  lr_number: string | null;
  quantity: string;
  source_warehouse_id: string | null;
  source_warehouse: string | null;
  source_distributor_id: string | null;
  source_distributor: string | null;
  destination_distributor_id: string | null;
  destination_distributor: string | null;
  destination_retailer_id: string | null;
  destination_retailer: string | null;
}

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const authorization = await authorizePermission(_request, "traceability:read");
  if (!authorization.authorized) return authorization.response;

  const { id: rawId } = await params;
  const id = parsePositiveSqlId(rawId);
  if (!id) return apiError(400, "INVALID_BATCH_ID", "Batch ID must be a positive integer.");

  try {
    const batch = await loadBatchCore(id);
    if (!batch) return apiError(404, "BATCH_NOT_FOUND", "Production batch was not found.");

    const [composition, movementRowsResult] = await Promise.all([
      loadBatchComposition(id),
      mysqlPool.execute<MovementRow[]>(
        `SELECT sh.shipment_id, sh.parent_shipment_id, sh.status,
                sh.dispatched_at, sh.delivered_at, sh.lr_number, si.quantity,
                sh.source_warehouse_id, sw.name AS source_warehouse,
                sh.source_distributor_id, sd.name AS source_distributor,
                sh.destination_distributor_id, dd.name AS destination_distributor,
                sh.destination_retailer_id, rt.name AS destination_retailer
         FROM shipment_items si
         JOIN shipments sh ON sh.shipment_id = si.shipment_id
         LEFT JOIN warehouses sw ON sw.warehouse_id = sh.source_warehouse_id
         LEFT JOIN distributors sd ON sd.distributor_id = sh.source_distributor_id
         LEFT JOIN distributors dd ON dd.distributor_id = sh.destination_distributor_id
         LEFT JOIN retailers rt ON rt.retailer_id = sh.destination_retailer_id
         WHERE si.prod_batch_id = ? AND sh.status IN ('DISPATCHED','DELIVERED')
         ORDER BY sh.dispatched_at, sh.shipment_id`,
        [id],
      ),
    ]);
    const movementRows = movementRowsResult[0];

    const movements = movementRows.map((row) => ({
      shipmentId: row.shipment_id,
      parentShipmentId: row.parent_shipment_id,
      status: row.status,
      dispatchedAt: row.dispatched_at,
      deliveredAt: row.delivered_at,
      trackingNumber: row.lr_number,
      quantityMoved: row.quantity,
      source: row.source_warehouse_id
        ? { type: "WAREHOUSE", id: row.source_warehouse_id, name: row.source_warehouse }
        : { type: "DISTRIBUTOR", id: row.source_distributor_id, name: row.source_distributor },
      destination: row.destination_distributor_id
        ? { type: "DISTRIBUTOR", id: row.destination_distributor_id, name: row.destination_distributor }
        : { type: "RETAILER", id: row.destination_retailer_id, name: row.destination_retailer },
    }));

    return Response.json({ data: { batch, composition, movements } });
  } catch {
    return internalApiError();
  }
}
