import { internalApiError } from "@/lib/api/http";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { clearSessionCookie, hashSessionToken, readSessionToken } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";

export async function POST(request: Request): Promise<Response> {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const token = readSessionToken(request);
  try {
    if (token) {
      await mysqlPool.execute(
        `UPDATE auth_sessions
         SET revoked_at = UTC_TIMESTAMP()
         WHERE token_hash = ? AND revoked_at IS NULL`,
        [hashSessionToken(token)],
      );
    }
    const response = Response.json(
      { data: { loggedOut: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  } catch {
    const response = internalApiError();
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  }
}
