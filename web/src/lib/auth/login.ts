import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { RowDataPacket } from "mysql2";
import { hashSessionToken, type AuthenticatedUser } from "@/lib/auth/session";
import { isRole } from "@/lib/auth/roles";
import { mysqlPool } from "@/lib/db/mysql";

const RATE_WINDOW_MINUTES = 15;
const RATE_LIMIT_ATTEMPTS = 5;
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

interface RateLimitRow extends RowDataPacket {
  failed_attempts: number;
  is_blocked: number | boolean;
}

interface LoginUserRow extends RowDataPacket {
  user_id: string;
  email: string;
  password_hash: string;
  role: string;
  distributor_id: string | null;
  is_active: number | boolean;
}

export type LoginResult =
  | { kind: "success"; token: string; user: AuthenticatedUser }
  | { kind: "invalid_credentials" }
  | { kind: "rate_limited" };

let dummyHashPromise: Promise<string> | undefined;

function getRateLimitKey(email: string, clientIp: string): Buffer {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 bytes");
  }
  return createHmac("sha256", secret)
    .update(`${email}\n${clientIp}`, "utf8")
    .digest();
}

function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash(randomBytes(32), ARGON2_OPTIONS);
  return dummyHashPromise;
}

export async function loginWithPassword(
  email: string,
  password: string,
  clientIp: string,
): Promise<LoginResult> {
  const limiterKey = getRateLimitKey(email, clientIp);
  const connection = await mysqlPool.getConnection();
  let transactionOpen = false;

  try {
    await connection.beginTransaction();
    transactionOpen = true;

    await connection.execute(
      `INSERT IGNORE INTO auth_login_rate_limits
         (limiter_key, failed_attempts, window_started_at)
       VALUES (?, 0, UTC_TIMESTAMP())`,
      [limiterKey],
    );
    await connection.execute(
      `UPDATE auth_login_rate_limits
       SET failed_attempts = 0, window_started_at = UTC_TIMESTAMP(), blocked_until = NULL
       WHERE limiter_key = ?
         AND window_started_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RATE_WINDOW_MINUTES} MINUTE)`,
      [limiterKey],
    );
    const [limitRows] = await connection.execute<RateLimitRow[]>(
      `SELECT failed_attempts,
              (blocked_until IS NOT NULL AND blocked_until > UTC_TIMESTAMP()) AS is_blocked
       FROM auth_login_rate_limits
       WHERE limiter_key = ?
       FOR UPDATE`,
      [limiterKey],
    );
    if (Number(limitRows[0]?.is_blocked) === 1) {
      await connection.rollback();
      transactionOpen = false;
      return { kind: "rate_limited" };
    }

    const [userRows] = await connection.execute<LoginUserRow[]>(
      `SELECT user_id, email, password_hash, role, distributor_id, is_active
       FROM app_users
       WHERE email = ?
       LIMIT 1`,
      [email],
    );
    const user = userRows[0];
    const hashToVerify = user?.password_hash ?? (await getDummyPasswordHash());
    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(hashToVerify, password);
    } catch {
      passwordMatches = false;
    }

    if (!user || !passwordMatches || !Boolean(user.is_active) || !isRole(user.role)) {
      const [currentRows] = await connection.execute<RateLimitRow[]>(
        `SELECT failed_attempts, 0 AS is_blocked
         FROM auth_login_rate_limits
         WHERE limiter_key = ?
         FOR UPDATE`,
        [limiterKey],
      );
      const nextAttempts = Number(currentRows[0]?.failed_attempts ?? 0) + 1;
      await connection.execute(
        `UPDATE auth_login_rate_limits
         SET failed_attempts = ?,
             blocked_until = IF(?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${RATE_WINDOW_MINUTES} MINUTE), NULL)
         WHERE limiter_key = ?`,
        [Math.min(nextAttempts, RATE_LIMIT_ATTEMPTS), nextAttempts >= RATE_LIMIT_ATTEMPTS, limiterKey],
      );
      await connection.commit();
      transactionOpen = false;
      return { kind: "invalid_credentials" };
    }

    const token = randomBytes(32).toString("hex");
    await connection.execute(
      `UPDATE auth_login_rate_limits
       SET failed_attempts = 0, window_started_at = UTC_TIMESTAMP(), blocked_until = NULL
       WHERE limiter_key = ?`,
      [limiterKey],
    );
    await connection.execute(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))`,
      [user.user_id, hashSessionToken(token)],
    );
    await connection.commit();
    transactionOpen = false;

    return {
      kind: "success",
      token,
      user: {
        id: user.user_id,
        email: user.email,
        role: user.role,
        distributorId: user.distributor_id,
      },
    };
  } catch (error) {
    if (transactionOpen) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
