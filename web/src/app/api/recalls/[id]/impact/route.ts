import type { RowDataPacket } from "mysql2";
import { apiError, internalApiError, parsePositiveSqlId } from "@/lib/api/http";
import { authorizePermission } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";

type RouteContext = { params: Promise<{ id: string }> };

interface RecallRow extends RowDataPacket {
  recall_id: string;
  recall_no: string;
  reason: string;
  initiated_at: string;
  initiated_by: string;
  status: string;
  description: string | null;
  created_at: string;
}

interface AffectedBatchRow extends RowDataPacket {
  prod_batch_id: string;
  batch_no: string;
  mfg_date: string;
  exp_date: string;
  production_quantity: string;
  production_status: string;
  product_id: string;
  product_name: string;
  affected_quantity: string;
  recovered_quantity: string;
  affected_status: string;
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

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const authorization = await authorizePermission(_request, "recalls:read");
  if (!authorization.authorized) return authorization.response;

  const { id: rawId } = await params;
  const id = parsePositiveSqlId(rawId);
  if (!id) return apiError(400, "INVALID_RECALL_ID", "Recall ID must be a positive integer.");

  try {
    const [recallRows] = await mysqlPool.execute<RecallRow[]>(
      `SELECT recall_id, recall_no, reason, initiated_at, initiated_by,
              status, description, created_at
       FROM recalls WHERE recall_id = ? LIMIT 1`,
      [id],
    );
    const recall = recallRows[0];
    if (!recall) return apiError(404, "RECALL_NOT_FOUND", "Recall was not found.");

    const [batchRows] = await mysqlPool.execute<AffectedBatchRow[]>(
      `SELECT pb.prod_batch_id, pb.batch_no, pb.mfg_date, pb.exp_date,
              pb.quantity AS production_quantity, pb.status AS production_status,
              p.product_id, p.name AS product_name,
              rab.affected_quantity, rab.recovered_quantity, rab.status AS affected_status
       FROM recall_affected_batches rab
       JOIN production_batches pb ON pb.prod_batch_id = rab.prod_batch_id
       JOIN products p ON p.product_id = pb.product_id
       WHERE rab.recall_id = ?
       ORDER BY pb.batch_no`,
      [id],
    );
    const distributionRows: DistributionRow[] = [];
    if (batchRows.length > 0) {
      const placeholders = batchRows.map(() => "?").join(", ");
      const batchIds = batchRows.map((batch) => batch.prod_batch_id);
      const [rows] = await mysqlPool.execute<DistributionRow[]>(
        `SELECT prod_batch_id, shipment_id, status, dispatched_at,
                source_warehouse, source_distributor, destination_distributor,
                destination_retailer, quantity
         FROM v_batch_distribution
         WHERE prod_batch_id IN (${placeholders})
         ORDER BY prod_batch_id, dispatched_at, shipment_id`,
        batchIds,
      );
      distributionRows.push(...rows);
    }

    const movementsByBatch = new Map<string, DistributionRow[]>();
    for (const movement of distributionRows) {
      const entries = movementsByBatch.get(movement.prod_batch_id) ?? [];
      entries.push(movement);
      movementsByBatch.set(movement.prod_batch_id, entries);
    }

    return Response.json({
      data: {
        recall: {
          id: recall.recall_id,
          recallNo: recall.recall_no,
          reason: recall.reason,
          initiatedAt: recall.initiated_at,
          initiatedBy: recall.initiated_by,
          status: recall.status,
          description: recall.description,
          createdAt: recall.created_at,
        },
        affectedBatches: batchRows.map((batch) => ({
          id: batch.prod_batch_id,
          batchNo: batch.batch_no,
          manufacturedOn: batch.mfg_date,
          expiresOn: batch.exp_date,
          productionQuantity: batch.production_quantity,
          productionStatus: batch.production_status,
          product: { id: batch.product_id, name: batch.product_name },
          affectedQuantity: batch.affected_quantity,
          recoveredQuantity: batch.recovered_quantity,
          status: batch.affected_status,
          distribution: (movementsByBatch.get(batch.prod_batch_id) ?? []).map((movement) => ({
            shipmentId: movement.shipment_id,
            status: movement.status,
            dispatchedAt: movement.dispatched_at,
            quantityMoved: movement.quantity,
            sourceWarehouse: movement.source_warehouse,
            sourceDistributor: movement.source_distributor,
            destinationDistributor: movement.destination_distributor,
            destinationRetailer: movement.destination_retailer,
          })),
        })),
      },
    });
  } catch {
    return internalApiError();
  }
}
