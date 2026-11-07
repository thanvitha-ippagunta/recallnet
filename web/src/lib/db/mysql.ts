import "server-only";
import { createPool, type Pool } from "mysql2/promise";

type MysqlGlobal = typeof globalThis & {
  __recallNetMysqlPool?: Pool;
};

const globalForMysql = globalThis as MysqlGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createMysqlPool(): Pool {
  const port = Number(requiredEnv("DB_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port");
  }

  return createPool({
    host: requiredEnv("DB_HOST"),
    port,
    user: requiredEnv("DB_USER"),
    password: requiredEnv("DB_PASSWORD"),
    database: requiredEnv("DB_NAME"),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    connectTimeout: 10_000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
  });
}

function getPool(): Pool {
  if (!globalForMysql.__recallNetMysqlPool) {
    globalForMysql.__recallNetMysqlPool = createMysqlPool();
  }
  return globalForMysql.__recallNetMysqlPool;
}

/** A lazy, process-reused MySQL pool. Configuration is checked on first use. */
export const mysqlPool = new Proxy({} as Pool, {
  get(_target, property) {
    const pool = getPool();
    const value = Reflect.get(pool, property, pool) as unknown;
    return typeof value === "function" ? value.bind(pool) : value;
  },
});
