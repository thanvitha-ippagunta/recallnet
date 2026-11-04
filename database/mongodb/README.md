# RecallNet MongoDB audit events

MongoDB stores append-only audit events in `audit_events`. MySQL remains the source of truth for products, batches, movements, recalls, quantities and current statuses. MongoDB references MySQL primary keys; it must not become a second mutable copy of those records.

## Document contract

Each document has `eventType`, `occurredAt` (UTC BSON Date), `actor` (`userId` and `role`), `entity` (`type` and numeric `mysqlId`), optional `references` (related MySQL IDs), `details` (event-specific snapshot of the action), and `requestId` for correlating one API request. The details are an immutable audit description, not current business state.

Supported event types: `RECALL_OPENED`, `RECALL_STATUS_CHANGED`, `SHIPMENT_CREATED`, `SHIPMENT_DISPATCHED`, `SHIPMENT_BLOCKED`, `BATCH_STATUS_CHANGED`, and `RECOVERY_RECORDED`.

## Example insert and read (Node.js driver)

```js
const audit = db.collection("audit_events");
await audit.insertOne(eventDocument); // append; do not update/delete this event

const batchHistory = await audit.find({
  "entity.type": "production_batch",
  "entity.mysqlId": 1
}).sort({ occurredAt: -1 }).toArray();

const recentRecallEvents = await audit.find({ eventType: "RECALL_OPENED" })
  .sort({ occurredAt: -1 }).limit(50).toArray();
```

Use a UTC BSON Date for `occurredAt`. The web application appends the event after the corresponding MySQL transaction commits. If audit insertion fails, it logs a sanitized event identifier; a production deployment should forward this failure to durable monitoring/retry infrastructure. Never pretend the MySQL transaction rolled back after it already committed.

Run `indexes.js` once per database to create query indexes. `aggregation_examples.js` provides a pipeline that counts audit event types for one MySQL production batch. No database connection or MongoDB operation was performed while preparing these files.
