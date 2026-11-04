import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import argon2 from "argon2";
import mysql from "mysql2/promise";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal.");
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

const emailPrompt = createInterface({ input: stdin, output: stdout });
let email;
try {
  email = (await emailPrompt.question("Initial ADMIN email: "))
    .normalize("NFC")
    .trim()
    .toLowerCase();
} finally {
  emailPrompt.close();
}

if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  throw new Error("A valid email address is required.");
}

const password = await readHidden("ADMIN password (12-128 characters): ");
const confirmation = await readHidden("Confirm password: ");
if (password !== confirmation) throw new Error("Passwords did not match.");
if (password.length < 12 || password.length > 128 || Buffer.byteLength(password, "utf8") > 1024) {
  throw new Error("Password must be 12-128 characters.");
}

const port = Number(requiredEnv("DB_PORT"));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT must be a valid TCP port.");
}

const connection = await mysql.createConnection({
  host: requiredEnv("DB_HOST"),
  port,
  user: requiredEnv("DB_USER"),
  password: requiredEnv("DB_PASSWORD"),
  database: requiredEnv("DB_NAME"),
});

try {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('recallnet:first-admin-bootstrap', 10) AS lock_acquired",
  );
  if (Number(lockRows[0]?.lock_acquired) !== 1) {
    throw new Error("Could not acquire the ADMIN bootstrap lock; try again.");
  }

  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS admin_count FROM app_users WHERE role = 'ADMIN'",
  );
  if (Number(rows[0]?.admin_count ?? 0) > 0) {
    throw new Error("An ADMIN account already exists; refusing to create another bootstrap account.");
  }

  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  await connection.execute(
    `INSERT INTO app_users (email, password_hash, role, distributor_id, is_active)
     VALUES (?, ?, 'ADMIN', NULL, TRUE)`,
    [email, passwordHash],
  );
  stdout.write("Initial ADMIN account created.\n");
} finally {
  await connection.execute("SELECT RELEASE_LOCK('recallnet:first-admin-bootstrap')").catch(() => undefined);
  await connection.end();
}
