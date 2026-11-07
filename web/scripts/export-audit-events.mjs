import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongodb from "mongodb";
import { EJSON } from "bson";

const { MongoClient } = mongodb;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../../handover/audit_events.json");
const client = new MongoClient("mongodb://127.0.0.1:27017");

try {
  await client.connect();

  const documents = await client
    .db("recallnet")
    .collection("audit_events")
    .find({})
    .toArray();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${EJSON.stringify(documents, { relaxed: false, indent: 2 })}\n`,
    "utf8",
  );

  console.log(`Exported ${documents.length} audit_events documents.`);
} finally {
  await client.close();
}
