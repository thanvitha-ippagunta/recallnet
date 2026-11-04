import "server-only";
import { apiError } from "@/lib/api/http";

/** Require a browser-supplied same-origin Origin for cookie-authenticated POSTs. */
export function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return apiError(403, "CSRF_REJECTED", "A same-origin request is required.");
  }

  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return apiError(403, "CSRF_REJECTED", "A same-origin request is required.");
    }
  } catch {
    return apiError(403, "CSRF_REJECTED", "A same-origin request is required.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return apiError(403, "CSRF_REJECTED", "A same-origin request is required.");
  }
  return null;
}
