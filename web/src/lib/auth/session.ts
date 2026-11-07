import "server-only";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { apiError, internalApiError } from "@/lib/api/http";
import { mysqlPool } from "@/lib/db/mysql";
import { hasPermission, isRole, type Permission, type Role } from "@/lib/auth/roles";

export const SESSION_COOKIE_NAME = "recallnet_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  distributorId: string | null;
}

interface SessionUserRow extends RowDataPacket {
  user_id: string;
  email: string;
  role: string;
  distributor_id: string | null;
}

export function readSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const token = part.slice(separator + 1).trim();
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
  }
  return null;
}

export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token, "ascii").digest();
}

export async function getSessionUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;

  const [rows] = await mysqlPool.execute<SessionUserRow[]>(
    `SELECT u.user_id, u.email, u.role, u.distributor_id
     FROM auth_sessions s
     JOIN app_users u ON u.user_id = s.user_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > UTC_TIMESTAMP()
       AND u.is_active = TRUE
     LIMIT 1`,
    [hashSessionToken(token)],
  );
  const row = rows[0];
  if (!row || !isRole(row.role)) return null;

  return {
    id: row.user_id,
    email: row.email,
    role: row.role,
    distributorId: row.distributor_id,
  };
}

export type AuthorizationResult =
  | { authorized: true; user: AuthenticatedUser }
  | { authorized: false; response: Response };

export async function authorizePermission(
  request: Request,
  permission: Permission,
): Promise<AuthorizationResult> {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return {
        authorized: false,
        response: apiError(401, "UNAUTHENTICATED", "Authentication is required."),
      };
    }
    if (!hasPermission(user.role, permission)) {
      return {
        authorized: false,
        response: apiError(403, "FORBIDDEN", "You do not have permission to access this resource."),
      };
    }
    return { authorized: true, user };
  } catch {
    return { authorized: false, response: internalApiError() };
  }
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}
