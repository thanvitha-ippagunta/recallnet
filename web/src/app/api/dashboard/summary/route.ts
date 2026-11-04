import type { RowDataPacket } from "mysql2";
import { internalApiError, normalizeCount } from "@/lib/api/http";
import { authorizePermission } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";

interface DashboardRow extends RowDataPacket {
  total_production_batches: string;
  completed_batches: string;
  recalled_batches: string;
  total_recalls: string;
  open_recalls: string;
  total_shipments: string;
  dispatched_shipments: string;
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await authorizePermission(request, "dashboard:read");
  if (!authorization.authorized) return authorization.response;

  try {
    const [rows] = await mysqlPool.execute<DashboardRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM production_batches) AS total_production_batches,
         (SELECT COUNT(*) FROM production_batches WHERE status = 'COMPLETED') AS completed_batches,
         (SELECT COUNT(*) FROM production_batches WHERE status = 'RECALLED') AS recalled_batches,
         (SELECT COUNT(*) FROM recalls) AS total_recalls,
         (SELECT COUNT(*) FROM recalls WHERE status IN ('OPEN','IN_PROGRESS')) AS open_recalls,
         (SELECT COUNT(*) FROM shipments) AS total_shipments,
         (SELECT COUNT(*) FROM shipments WHERE status = 'DISPATCHED') AS dispatched_shipments`,
    );
    const row = rows[0];
    if (!row) return internalApiError();

    return Response.json({
      data: {
        totalProductionBatches: normalizeCount(row.total_production_batches),
        completedBatches: normalizeCount(row.completed_batches),
        recalledBatches: normalizeCount(row.recalled_batches),
        totalRecalls: normalizeCount(row.total_recalls),
        openRecalls: normalizeCount(row.open_recalls),
        totalShipments: normalizeCount(row.total_shipments),
        dispatchedShipments: normalizeCount(row.dispatched_shipments),
      },
    });
  } catch {
    return internalApiError();
  }
}
