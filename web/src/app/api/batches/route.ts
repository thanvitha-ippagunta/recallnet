import type { RowDataPacket } from "mysql2";
import { apiError, countPages, internalApiError, normalizeCount, parsePagination } from "@/lib/api/http";
import { authorizePermission } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";

const batchStatuses = [
  "PLANNED",
  "IN_PRODUCTION",
  "COMPLETED",
  "QUARANTINED",
  "RECALLED",
  "EXPIRED",
] as const;

interface CountRow extends RowDataPacket {
  total: string;
}

interface BatchListRow extends RowDataPacket {
  prod_batch_id: string;
  batch_no: string;
  mfg_date: string;
  exp_date: string;
  quantity: string;
  status: (typeof batchStatuses)[number];
  created_at: string;
  product_id: string;
  product_name: string;
  product_category: string;
  product_unit: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_location: string;
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await authorizePermission(request, "batches:read");
  if (!authorization.authorized) return authorization.response;

  const url = new URL(request.url);
  const parsedPagination = parsePagination(url.searchParams);
  if ("error" in parsedPagination) {
    return apiError(400, "INVALID_PAGINATION", parsedPagination.error);
  }
  const { page, limit, offset } = parsedPagination.value;

  const rawSearch = url.searchParams.get("search");
  const search = rawSearch?.trim();
  if (search && search.length > 120) {
    return apiError(400, "INVALID_SEARCH", "search must be 120 characters or fewer.");
  }

  const rawStatus = url.searchParams.get("status");
  const status = rawStatus?.trim().toUpperCase();
  if (rawStatus !== null && (!status || !batchStatuses.includes(status as (typeof batchStatuses)[number]))) {
    return apiError(400, "INVALID_STATUS", "status is not a valid production batch status.");
  }

  const conditions: string[] = [];
  const parameters: (string | number)[] = [];
  if (search) {
    conditions.push("(pb.batch_no LIKE ? OR p.name LIKE ?)");
    const pattern = `%${search}%`;
    parameters.push(pattern, pattern);
  }
  if (status) {
    conditions.push("pb.status = ?");
    parameters.push(status);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [countRows] = await mysqlPool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM production_batches pb
       JOIN products p ON p.product_id = pb.product_id
       ${whereClause}`,
      parameters,
    );
    const total = normalizeCount(countRows[0]?.total ?? "0");

    const [rows] = await mysqlPool.execute<BatchListRow[]>(
      `SELECT pb.prod_batch_id, pb.batch_no, pb.mfg_date, pb.exp_date,
              pb.quantity, pb.status, pb.created_at,
              p.product_id, p.name AS product_name, p.category AS product_category,
              p.unit AS product_unit,
              w.warehouse_id, w.name AS warehouse_name, w.location AS warehouse_location
       FROM production_batches pb
       JOIN products p ON p.product_id = pb.product_id
       JOIN warehouses w ON w.warehouse_id = pb.warehouse_id
       ${whereClause}
       ORDER BY pb.created_at DESC, pb.prod_batch_id DESC
       LIMIT ? OFFSET ?`,
      [...parameters, limit, offset],
    );

    const data = rows.map((row) => ({
      id: row.prod_batch_id,
      batchNo: row.batch_no,
      manufacturedOn: row.mfg_date,
      expiresOn: row.exp_date,
      quantity: row.quantity,
      status: row.status,
      createdAt: row.created_at,
      product: {
        id: row.product_id,
        name: row.product_name,
        category: row.product_category,
        unit: row.product_unit,
      },
      initialWarehouse: {
        id: row.warehouse_id,
        name: row.warehouse_name,
        location: row.warehouse_location,
      },
    }));

    return Response.json({
      data,
      pagination: { page, limit, total, totalPages: countPages(total, limit) },
    });
  } catch {
    return internalApiError();
  }
}
