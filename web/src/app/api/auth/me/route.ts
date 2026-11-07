import { apiError, internalApiError } from "@/lib/api/http";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getSessionUser(request);
    if (!user) return apiError(401, "UNAUTHENTICATED", "Authentication is required.");
    return Response.json(
      { data: { user } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return internalApiError();
  }
}
