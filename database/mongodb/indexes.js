// Run with mongosh after selecting the RecallNet database.
db.audit_events.createIndex(
  { "entity.type": 1, "entity.mysqlId": 1, occurredAt: -1 },
  { name: "ix_audit_entity_time" }
);
db.audit_events.createIndex(
  { eventType: 1, occurredAt: -1 },
  { name: "ix_audit_type_time" }
);
db.audit_events.createIndex(
  { requestId: 1 },
  { name: "ix_audit_request", sparse: true }
);
