// Run with mongosh after selecting the RecallNet database.
// Counts event types for one MySQL production batch over a time window.
db.audit_events.aggregate([
  {
    $match: {
      "entity.type": "production_batch",
      "entity.mysqlId": 1,
      occurredAt: {
        $gte: ISODate("2026-01-01T00:00:00Z"),
        $lt: ISODate("2027-01-01T00:00:00Z")
      }
    }
  },
  { $group: { _id: "$eventType", eventCount: { $sum: 1 }, latest: { $max: "$occurredAt" } } },
  { $sort: { eventCount: -1, _id: 1 } }
]);

// Retrieve a chronological batch timeline (latest first).
db.audit_events.find({ "entity.type": "production_batch", "entity.mysqlId": 1 })
  .sort({ occurredAt: -1 }).limit(100);
