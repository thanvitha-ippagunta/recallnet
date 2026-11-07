import { getMongoDb } from "@/lib/db/mongodb";
import { mysqlPool } from "@/lib/db/mysql";

type ConnectionStatus = "connected" | "unavailable";

async function checkMysql(): Promise<ConnectionStatus> {
  try {
    await mysqlPool.query("SELECT 1");
    return "connected";
  } catch {
    return "unavailable";
  }
}

async function checkMongo(): Promise<ConnectionStatus> {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return "connected";
  } catch {
    return "unavailable";
  }
}

export async function GET(): Promise<Response> {
  const [mysql, mongodb] = await Promise.all([checkMysql(), checkMongo()]);
  const healthy = mysql === "connected" && mongodb === "connected";

  return Response.json(
    { mysql: { status: mysql }, mongodb: { status: mongodb } },
    { status: healthy ? 200 : 503 },
  );
}
