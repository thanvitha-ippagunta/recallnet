import { apiError, internalApiError } from "@/lib/api/http";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { loginWithPassword } from "@/lib/auth/login";
import { sessionCookie } from "@/lib/auth/session";

interface LoginPayload {
  email: string;
  password: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(value: unknown): LoginPayload | null {
  if (!isRecord(value) || typeof value.email !== "string" || typeof value.password !== "string") {
    return null;
  }
  const email = value.email.normalize("NFC").trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
    value.password.length === 0 ||
    Buffer.byteLength(value.password, "utf8") > 1024
  ) {
    return null;
  }
  return { email, password: value.password };
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON request body.");
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 4096) {
      return apiError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      return apiError(400, "INVALID_REQUEST", "Request body must be valid JSON.");
    }
    const payload = parsePayload(parsed);
    if (!payload) {
      return apiError(400, "INVALID_CREDENTIAL_FORMAT", "Provide a valid email and password.");
    }

    const result = await loginWithPassword(payload.email, payload.password, getClientIp(request));
    if (result.kind === "rate_limited") {
      return apiError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Try again later.");
    }
    if (result.kind === "invalid_credentials") {
      return apiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const response = Response.json(
      { data: { user: result.user } },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.headers.append("Set-Cookie", sessionCookie(result.token));
    return response;
  } catch {
    return internalApiError();
  }
}
