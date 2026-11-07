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
  details?: Document;
  requestId?: string;
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const auth = await authorizePermission(request, "audit:read");
  if (!auth.authorized) return auth.response;
  const { id: rawId } = await params;
  const id = parsePositiveSqlId(rawId);
  if (!id || !Number.isSafeInteger(Number(id))) return apiError(400, "INVALID_SHIPMENT_ID", "Shipment ID must be a positive integer.");
  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if ((rawLimit !== null && !/^\d+$/.test(rawLimit)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return apiError(400, "INVALID_LIMIT", "limit must be an integer between 1 and 100.");
  }
  try {
    const events = await (await getMongoDb()).collection<AuditEvent>("audit_events")
      .find({ "entity.type": "shipment", "entity.mysqlId": Number(id) })
      .sort({ occurredAt: -1, _id: -1 }).limit(limit).toArray();
    return Response.json({ data: events.map(event => ({
      id: event._id.toString(), eventType: event.eventType, occurredAt: event.occurredAt,
      actor: event.actor, entity: event.entity, details: event.details ?? null,
      requestId: event.requestId ?? null,
    })), pagination: { limit, returned: events.length } });
  } catch {
    return internalApiError();
  }
}
