import { apiError, internalApiError, parsePositiveSqlId } from "@/lib/api/http";
import { authorizePermission } from "@/lib/auth/session";
import { loadBatchComposition, loadBatchCore } from "@/lib/api/batch-data";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const authorization = await authorizePermission(_request, "batches:read");
  if (!authorization.authorized) return authorization.response;

  const { id: rawId } = await params;
  const id = parsePositiveSqlId(rawId);
  if (!id) return apiError(400, "INVALID_BATCH_ID", "Batch ID must be a positive integer.");

  try {
    const batch = await loadBatchCore(id);
    if (!batch) return apiError(404, "BATCH_NOT_FOUND", "Production batch was not found.");
    const composition = await loadBatchComposition(id);
    return Response.json({ data: { ...batch, composition } });
  } catch {
    return internalApiError();
  }
}
