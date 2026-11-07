-- Safe DDL demonstrations. Execute only in the recallnet schema.
USE recallnet;

-- CREATE: isolated disposable table.
CREATE TEMPORARY TABLE ddl_demo_contact (
  demo_id INT NOT NULL PRIMARY KEY,
  label VARCHAR(40) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ALTER: add and then remove a demonstration-only column.
ALTER TABLE ddl_demo_contact ADD COLUMN note VARCHAR(80) NULL;
ALTER TABLE ddl_demo_contact DROP COLUMN note;

-- DROP: only a TEMPORARY TABLE created for this demonstration.
CREATE TEMPORARY TABLE ddl_demo_drop_me (demo_id INT PRIMARY KEY);
DROP TEMPORARY TABLE ddl_demo_drop_me;

-- DML: use a temporary table so the INSERT, UPDATE, DELETE and SELECT examples
-- cannot alter project records. Run this section in the same client session.
CREATE TEMPORARY TABLE dml_demo_rows (demo_id INT PRIMARY KEY, label VARCHAR(40) NOT NULL);
INSERT INTO dml_demo_rows VALUES (1,'before update');
UPDATE dml_demo_rows SET label='after update' WHERE demo_id=1;
SELECT demo_id,label FROM dml_demo_rows ORDER BY demo_id;
DELETE FROM dml_demo_rows WHERE demo_id=1;
SELECT COUNT(*) AS remaining_demo_rows FROM dml_demo_rows;
