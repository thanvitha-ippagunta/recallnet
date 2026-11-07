import type { RowDataPacket } from "mysql2";
import { apiError, countPages, internalApiError, normalizeCount, parsePagination, parsePositiveSqlId } from "@/lib/api/http";
import { authorizePermission } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";
import { getMongoDb } from "@/lib/db/mongodb";
import { requireSameOrigin } from "@/lib/auth/csrf";

const recallStatuses = ["OPEN", "IN_PROGRESS", "CLOSED", "CANCELLED"] as const;

interface CountRow extends RowDataPacket {
  total: string;
}

interface CreatedRecallRow extends RowDataPacket {
  recall_id: string;
  prod_batch_id: string;
  affected_quantity: string;
  recall_status: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const authorization = await authorizePermission(request, "recalls:manage");
  if (!authorization.authorized) return authorization.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON request body.");
  }
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4096) return apiError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
    let body: unknown;
    try { body = JSON.parse(raw) as unknown; } catch { return apiError(400, "INVALID_REQUEST", "Request body must be valid JSON."); }
    if (!isObject(body) || typeof body.recallNo !== "string" || typeof body.reason !== "string" || typeof body.batchId !== "string") {
      return apiError(400, "INVALID_REQUEST", "recallNo, reason and batchId are required.");
    }
    const recallNo = body.recallNo.trim();
    const reason = body.reason.trim();
    const batchId = parsePositiveSqlId(body.batchId);
    if (!recallNo || recallNo.length > 60 || !reason || reason.length > 4000 || !batchId) {
      return apiError(400, "INVALID_REQUEST", "Provide a recall number, reason and valid batch ID.");
    }
    const [resultSets] = await mysqlPool.query<CreatedRecallRow[][]>(
      "CALL sp_open_recall(?, ?, ?, ?)",
      [recallNo, reason, authorization.user.email, batchId],
    );
    const created = resultSets[0]?.[0];
    if (!created) return internalApiError();
    try {
      const db = await getMongoDb();
      await db.collection("audit_events").insertOne({
        eventType: "RECALL_OPENED", occurredAt: new Date(),
        actor: { userId: authorization.user.id, role: authorization.user.role },
        entity: { type: "production_batch", mysqlId: Number(batchId) },
        references: { recallId: Number(created.recall_id) },
        details: { recallNo, reason, affectedQuantity: created.affected_quantity },
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      });
    } catch {
      console.error("RecallNet audit event write failed after recall commit", { eventType: "RECALL_OPENED", recallId: created.recall_id });
    }
    return Response.json({ data: { id: created.recall_id, batchId: created.prod_batch_id, affectedQuantity: created.affected_quantity, status: created.recall_status } }, { status: 201 });
  } catch {
    return internalApiError();
  }
}

interface RecallRow extends RowDataPacket {
  recall_id: string;
  recall_no: string;
  reason: string;
  initiated_at: string;
  initiated_by: string;
  status: (typeof recallStatuses)[number];
  description: string | null;
  created_at: string;
}

interface AffectedBatchRow extends RowDataPacket {
  recall_id: string;
  prod_batch_id: string;
  batch_no: string;
  product_name: string;
  affected_quantity: string;
  recovered_quantity: string;
  status: string;
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await authorizePermission(request, "recalls:read");
  if (!authorization.authorized) return authorization.response;

  const url = new URL(request.url);
  const parsedPagination = parsePagination(url.searchParams);
  if ("error" in parsedPagination) {
    return apiError(400, "INVALID_PAGINATION", parsedPagination.error);
  }
  const { page, limit, offset } = parsedPagination.value;

  const rawStatus = url.searchParams.get("status");
  const status = rawStatus?.trim().toUpperCase();
  if (rawStatus !== null && (!status || !recallStatuses.includes(status as (typeof recallStatuses)[number]))) {
    return apiError(400, "INVALID_STATUS", "status is not a valid recall status.");
  }

  const whereClause = status ? "WHERE status = ?" : "";
  const parameters: (string | number)[] = status ? [status] : [];

  try {
    const [countRows] = await mysqlPool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM recalls ${whereClause}`,
      parameters,
    );
    const total = normalizeCount(countRows[0]?.total ?? "0");
    const [recalls] = await mysqlPool.execute<RecallRow[]>(
      `SELECT recall_id, recall_no, reason, initiated_at, initiated_by,
              status, description, created_at
       FROM recalls ${whereClause}
       ORDER BY initiated_at DESC, recall_id DESC
       LIMIT ? OFFSET ?`,
      [...parameters, limit, offset],
    );

    let affectedBatches: AffectedBatchRow[] = [];
    if (recalls.length > 0) {
      const placeholders = recalls.map(() => "?").join(", ");
      const recallIds = recalls.map((recall) => recall.recall_id);
      const [rows] = await mysqlPool.execute<AffectedBatchRow[]>(
        `SELECT rab.recall_id, pb.prod_batch_id, pb.batch_no, p.name AS product_name,
                rab.affected_quantity, rab.recovered_quantity, rab.status
         FROM recall_affected_batches rab
         JOIN production_batches pb ON pb.prod_batch_id = rab.prod_batch_id
         JOIN products p ON p.product_id = pb.product_id
         WHERE rab.recall_id IN (${placeholders})
         ORDER BY rab.recall_id, pb.batch_no`,
        recallIds,
      );
      affectedBatches = rows;
    }

    const batchesByRecall = new Map<string, AffectedBatchRow[]>();
    for (const batch of affectedBatches) {
      const entries = batchesByRecall.get(batch.recall_id) ?? [];
      entries.push(batch);
      batchesByRecall.set(batch.recall_id, entries);
    }

    const data = recalls.map((recall) => ({
      id: recall.recall_id,
      recallNo: recall.recall_no,
      reason: recall.reason,
      initiatedAt: recall.initiated_at,
      initiatedBy: recall.initiated_by,
      status: recall.status,
      description: recall.description,
      createdAt: recall.created_at,
      affectedBatches: (batchesByRecall.get(recall.recall_id) ?? []).map((batch) => ({
        id: batch.prod_batch_id,
        batchNo: batch.batch_no,
        productName: batch.product_name,
        affectedQuantity: batch.affected_quantity,
        recoveredQuantity: batch.recovered_quantity,
        status: batch.status,
      })),
    }));

    return Response.json({
      data,
      pagination: { page, limit, total, totalPages: countPages(total, limit) },
    });
  } catch {
    return internalApiError();
  }
}
