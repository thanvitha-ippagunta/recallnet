import type { Document } from "mongodb";
import { apiError, internalApiError, parsePositiveSqlId } from "@/lib/api/http";
import { authorizePermission } from "@/lib/auth/session";
import { getMongoDb } from "@/lib/db/mongodb";

type RouteContext = { params: Promise<{ id: string }> };

interface AuditEvent extends Document {
  eventType: string;
  occurredAt: Date;
  actor: { userId: string; role: string };
  entity: { type: string; mysqlId: number };
  references?: Document;
  details?: Document;
  requestId?: string;
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const authorization = await authorizePermission(request, "audit:read");
  if (!authorization.authorized) return authorization.response;

  const { id: rawId } = await params;
  const id = parsePositiveSqlId(rawId);
  if (!id) return apiError(400, "INVALID_BATCH_ID", "Batch ID must be a positive integer.");

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (
    (rawLimit !== null && !/^\d+$/.test(rawLimit)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return apiError(400, "INVALID_LIMIT", "limit must be an integer between 1 and 100.");
  }

  const mongoId = Number(id);
  if (!Number.isSafeInteger(mongoId)) {
    return apiError(400, "UNSUPPORTED_BATCH_ID", "Batch ID cannot be represented by the audit-event identifier format.");
  }

  try {
    const db = await getMongoDb();
    const events = await db
      .collection<AuditEvent>("audit_events")
      .find({ "entity.type": "production_batch", "entity.mysqlId": mongoId })
      .sort({ occurredAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    const data = events.map((event) => ({
      id: event._id.toString(),
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      actor: event.actor,
      entity: event.entity,
      references: event.references ?? null,
      details: event.details ?? null,
      requestId: event.requestId ?? null,
    }));

    return Response.json({ data, pagination: { limit, returned: data.length } });
  } catch {
    return internalApiError();
  }
}
