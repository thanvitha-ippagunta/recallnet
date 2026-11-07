import "server-only";
import { MongoClient, type Db } from "mongodb";

type MongoGlobal = typeof globalThis & {
  __recallNetMongoUri?: string;
  __recallNetMongoClientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as MongoGlobal;
let productionClientPromise: Promise<MongoClient> | undefined;

function createClientPromise(uri: string): Promise<MongoClient> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
  const promise = client.connect().catch((error: unknown) => {
    if (globalForMongo.__recallNetMongoClientPromise === promise) {
      delete globalForMongo.__recallNetMongoClientPromise;
      delete globalForMongo.__recallNetMongoUri;
    }
    if (productionClientPromise === promise) {
      productionClientPromise = undefined;
    }
    throw error;
  });
  return promise;
}

function getClientPromise(uri: string): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    if (
      globalForMongo.__recallNetMongoClientPromise &&
      globalForMongo.__recallNetMongoUri === uri
    ) {
      return globalForMongo.__recallNetMongoClientPromise;
    }

    const promise = createClientPromise(uri);
    globalForMongo.__recallNetMongoUri = uri;
    globalForMongo.__recallNetMongoClientPromise = promise;
    return promise;
  }

  productionClientPromise ??= createClientPromise(uri);
  return productionClientPromise;
}

/** Returns the cached connection to the configured RecallNet MongoDB database. */
export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing required environment variable: MONGODB_URI");
  }

  const databaseName = process.env.MONGODB_DB || "recallnet";
  const client = await getClientPromise(uri);
  const db = client.db(databaseName);
  await db.collection("audit_events").createIndexes([
    { key: { "entity.type": 1, "entity.mysqlId": 1, occurredAt: -1 }, name: "ix_audit_entity_time" },
    { key: { eventType: 1, occurredAt: -1 }, name: "ix_audit_type_time" },
    { key: { requestId: 1 }, name: "ix_audit_request", sparse: true },
  ]);
  return db;
}
