# RecallNet MySQL files

Use a fresh MySQL 8.0.16+ development schema. The approved implementation is split across the five SQL files below. `RecallNet_DDL_MySQL8.sql` is retained as a legacy reference only.

## Execution workflow

1. `01_schema.sql`
2. `02_ddl_demo.sql`
3. `03_seed_data.sql`
4. `05_advanced_features.sql`
5. `CALL sp_dispatch_shipment(1);`
6. `CALL sp_dispatch_shipment(2);`
7. `04_required_queries.sql`

Shipment 1 must dispatch successfully before shipment 2. Shipment 2 is the distributor-to-retailer handoff and depends on shipment 1 delivering stock to that distributor. The procedure locks each production batch, validates source availability and recall state in a transaction, and the triggers enforce dispatch rules and generate `dispatched_at` from database time.

Load the seed data into a fresh schema. Do not rerun `03_seed_data.sql` after dispatch or recall testing; it resets the sample movement rows to draft and is intended only for initial data setup.

Perform the recall test only after both sample shipments have dispatched and the traceability queries have demonstrated the complete path. Prefer the second production batch (`CB-2603-B`) so the initial sample route for `CB-2603-A` remains available. For a shipment-blocking test, create a draft test movement for `CB-2603-B`, open a recall for that batch with `CALL sp_open_recall(recall_no, reason, initiated_by, prod_batch_id);`, then attempt to dispatch the draft and confirm it is rejected. Do not rerun the seed script to reset the workflow.

`02_ddl_demo.sql` uses temporary tables for the DROP and DML demonstrations. Its temporary tables are scoped to the client session. The five SQL files have not been executed as part of their preparation.

`sp_open_recall` affects the full production batch, transactionally inserts the recall and affected-batch rows, and changes batch status. It rejects another OPEN or IN_PROGRESS recall for that batch. Recovered quantity represents units physically recovered and cannot exceed affected quantity.

Dispatched and delivered shipments and their lines are retained. Record corrections as new movements rather than deleting or rewriting history. Give the application account only the privileges it needs; dispatch and recall should use the stored procedures rather than direct status updates. SQL uses MySQL-specific features, including enforced CHECK constraints in MySQL 8.0.16+.
