-- RecallNet: Multi-Database Product Batch Traceability and Recall Management
-- Database: MySQL 8.0.16+
-- Relational source of truth: MySQL
-- MongoDB is intended for application audit/event logs; it is not created here.
--
-- IMPORTANT:
-- 1. This script is deliberately non-destructive: it does NOT DROP DATABASE or TABLES.
-- 2. CREATE TABLE IF NOT EXISTS does not alter an older table definition. If you
--    already have an older/incompatible RecallNet schema, inspect it before proceeding.
-- 3. MySQL 8.0.16+ is recommended because CHECK constraints are enforced from 8.0.16.
-- 4. Run this script against a fresh RecallNet database for the cleanest setup.

CREATE DATABASE IF NOT EXISTS recallnet
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE recallnet;

-- =========================================================
-- 1. MASTER TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    contact_person VARCHAR(120) NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(254) NULL,
    address TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (supplier_id),
    UNIQUE KEY uq_suppliers_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
    product_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    description TEXT NULL,
    unit VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id),
    UNIQUE KEY uq_products_name_category (name, category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS warehouses (
    warehouse_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(160) NOT NULL,
    address TEXT NULL,
    warehouse_type ENUM('RAW_MATERIAL', 'FINISHED_GOODS', 'BOTH')
        NOT NULL DEFAULT 'BOTH',
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (warehouse_id),
    UNIQUE KEY uq_warehouses_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS distributors (
    distributor_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    contact_person VARCHAR(120) NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(254) NULL,
    address TEXT NULL,
    PRIMARY KEY (distributor_id),
    UNIQUE KEY uq_distributors_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS retailers (
    retailer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    contact_person VARCHAR(120) NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(254) NULL,
    address TEXT NULL,
    PRIMARY KEY (retailer_id),
    UNIQUE KEY uq_retailers_email (email)
) ENGINE=InnoDB;

-- =========================================================
-- 2. RAW MATERIAL AND PRODUCTION BATCH TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS raw_material_batches (
    rm_batch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    supplier_id BIGINT UNSIGNED NOT NULL,
    material_name VARCHAR(120) NOT NULL,
    batch_no VARCHAR(60) NOT NULL,
    mfg_date DATE NOT NULL,
    exp_date DATE NOT NULL,
    quantity DECIMAL(14,3) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    status ENUM(
        'AVAILABLE', 'PARTIALLY_USED', 'CONSUMED', 'QUARANTINED', 'EXPIRED'
    ) NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (rm_batch_id),
    UNIQUE KEY uq_rm_supplier_batch (supplier_id, batch_no),
    KEY idx_rm_supplier (supplier_id),
    CONSTRAINT fk_rm_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_rm_quantity CHECK (quantity >= 0),
    CONSTRAINT chk_rm_dates CHECK (exp_date >= mfg_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_batches (
    prod_batch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    batch_no VARCHAR(60) NOT NULL,
    mfg_date DATE NOT NULL,
    exp_date DATE NOT NULL,
    quantity DECIMAL(14,3) NOT NULL,
    status ENUM(
        'PLANNED', 'IN_PRODUCTION', 'COMPLETED',
        'QUARANTINED', 'RECALLED', 'EXPIRED'
    ) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (prod_batch_id),
    UNIQUE KEY uq_production_product_batch (product_id, batch_no),
    KEY idx_pb_product_status (product_id, status),
    CONSTRAINT fk_pb_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_pb_quantity CHECK (quantity >= 0),
    CONSTRAINT chk_pb_dates CHECK (exp_date >= mfg_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS batch_composition (
    comp_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prod_batch_id BIGINT UNSIGNED NOT NULL,
    rm_batch_id BIGINT UNSIGNED NOT NULL,
    quantity_used DECIMAL(14,3) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    PRIMARY KEY (comp_id),
    UNIQUE KEY uq_batch_composition_pair (prod_batch_id, rm_batch_id),
    CONSTRAINT fk_bc_production_batch
        FOREIGN KEY (prod_batch_id) REFERENCES production_batches(prod_batch_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_bc_raw_material_batch
        FOREIGN KEY (rm_batch_id) REFERENCES raw_material_batches(rm_batch_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_bc_quantity CHECK (quantity_used > 0)
) ENGINE=InnoDB;

-- =========================================================
-- 3. SHIPMENT TABLES
-- A shipment is a dispatch header; shipment_items lists the
-- production batches and quantities carried in that dispatch.
-- A shipment can be addressed to one distributor OR one retailer.
-- =========================================================

CREATE TABLE IF NOT EXISTS shipments (
    shipment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    warehouse_id BIGINT UNSIGNED NOT NULL,
    shipment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    destination_type ENUM('DISTRIBUTOR', 'RETAILER') NOT NULL,
    distributor_id BIGINT UNSIGNED NULL,
    retailer_id BIGINT UNSIGNED NULL,
    status ENUM(
        'DRAFT', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'BLOCKED'
    ) NOT NULL DEFAULT 'DRAFT',
    lr_number VARCHAR(80) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shipment_id),
    UNIQUE KEY uq_shipments_lr_number (lr_number),
    KEY idx_ship_date_status (shipment_date, status),
    CONSTRAINT fk_ship_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_ship_distributor
        FOREIGN KEY (distributor_id) REFERENCES distributors(distributor_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_ship_retailer
        FOREIGN KEY (retailer_id) REFERENCES retailers(retailer_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_ship_destination CHECK (
        (destination_type = 'DISTRIBUTOR'
            AND distributor_id IS NOT NULL AND retailer_id IS NULL)
        OR
        (destination_type = 'RETAILER'
            AND retailer_id IS NOT NULL AND distributor_id IS NULL)
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shipment_items (
    shipment_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    shipment_id BIGINT UNSIGNED NOT NULL,
    prod_batch_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(14,3) NOT NULL,
    PRIMARY KEY (shipment_item_id),
    UNIQUE KEY uq_shipment_batch (shipment_id, prod_batch_id),
    KEY idx_si_batch (prod_batch_id),
    CONSTRAINT fk_si_shipment
        FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_si_production_batch
        FOREIGN KEY (prod_batch_id) REFERENCES production_batches(prod_batch_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_si_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

-- =========================================================
-- 4. RECALL TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS recalls (
    recall_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recall_no VARCHAR(60) NOT NULL,
    reason TEXT NOT NULL,
    recall_date DATETIME NOT NULL,
    initiated_by VARCHAR(120) NOT NULL,
    status ENUM('OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED')
        NOT NULL DEFAULT 'OPEN',
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recall_id),
    UNIQUE KEY uq_recalls_recall_no (recall_no),
    KEY idx_recall_status_date (status, recall_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recall_affected_batches (
    rab_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recall_id BIGINT UNSIGNED NOT NULL,
    prod_batch_id BIGINT UNSIGNED NOT NULL,
    affected_quantity DECIMAL(14,3) NOT NULL,
    recovered_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
    status ENUM(
        'PENDING', 'NOTIFIED', 'QUARANTINED', 'RECOVERED', 'CLOSED'
    ) NOT NULL DEFAULT 'PENDING',
    PRIMARY KEY (rab_id),
    UNIQUE KEY uq_recall_affected_batch (recall_id, prod_batch_id),
    KEY idx_rab_prod_batch (prod_batch_id),
    CONSTRAINT fk_rab_recall
        FOREIGN KEY (recall_id) REFERENCES recalls(recall_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_rab_production_batch
        FOREIGN KEY (prod_batch_id) REFERENCES production_batches(prod_batch_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_rab_affected_quantity CHECK (affected_quantity > 0),
    CONSTRAINT chk_rab_recovered_quantity
        CHECK (recovered_quantity >= 0 AND recovered_quantity <= affected_quantity)
) ENGINE=InnoDB;

-- =========================================================
-- 5. VIEWS
-- =========================================================

CREATE OR REPLACE VIEW v_active_recall_impact AS
SELECT
    r.recall_id,
    r.recall_no,
    r.recall_date,
    r.status AS recall_status,
    rab.rab_id,
    rab.prod_batch_id,
    pb.batch_no AS production_batch_no,
    p.product_id,
    p.name AS product_name,
    rab.affected_quantity,
    rab.recovered_quantity,
    rab.status AS affected_batch_status,
    COALESCE(ship.shipped_quantity, 0) AS shipped_quantity,
    COALESCE(ship.shipment_count, 0) AS shipment_count
FROM recalls AS r
JOIN recall_affected_batches AS rab
    ON rab.recall_id = r.recall_id
JOIN production_batches AS pb
    ON pb.prod_batch_id = rab.prod_batch_id
JOIN products AS p
    ON p.product_id = pb.product_id
LEFT JOIN (
    SELECT
        prod_batch_id,
        SUM(quantity) AS shipped_quantity,
        COUNT(DISTINCT shipment_id) AS shipment_count
    FROM shipment_items
    GROUP BY prod_batch_id
) AS ship
    ON ship.prod_batch_id = rab.prod_batch_id
WHERE r.status IN ('OPEN', 'IN_PROGRESS');

CREATE OR REPLACE VIEW v_supplier_batch_exposure AS
SELECT
    s.supplier_id,
    s.name AS supplier_name,
    rmb.rm_batch_id,
    rmb.batch_no AS raw_material_batch_no,
    rmb.material_name,
    rmb.quantity AS received_quantity,
    rmb.unit,
    rmb.status AS raw_material_status,
    COUNT(DISTINCT bc.prod_batch_id) AS production_batches_using_material,
    COALESCE(exposure.finished_units_shipped, 0) AS finished_units_shipped
FROM suppliers AS s
JOIN raw_material_batches AS rmb
    ON rmb.supplier_id = s.supplier_id
LEFT JOIN batch_composition AS bc
    ON bc.rm_batch_id = rmb.rm_batch_id
LEFT JOIN (
    SELECT
        bc2.rm_batch_id,
        SUM(si.quantity) AS finished_units_shipped
    FROM batch_composition AS bc2
    JOIN shipment_items AS si
        ON si.prod_batch_id = bc2.prod_batch_id
    GROUP BY bc2.rm_batch_id
) AS exposure
    ON exposure.rm_batch_id = rmb.rm_batch_id
GROUP BY
    s.supplier_id, s.name,
    rmb.rm_batch_id, rmb.batch_no, rmb.material_name,
    rmb.quantity, rmb.unit, rmb.status,
    exposure.finished_units_shipped;

-- =========================================================
-- 6. RECALL-PROTECTION TRIGGERS
-- Shipment lines dated on or after a non-cancelled recall date
-- are rejected for an affected production batch.
-- Historical shipment lines dated before the recall date remain
-- recordable.
-- =========================================================

DROP TRIGGER IF EXISTS trg_block_recalled_shipment_insert;
DROP TRIGGER IF EXISTS trg_block_recalled_shipment_update;

DELIMITER $$

CREATE TRIGGER trg_block_recalled_shipment_insert
BEFORE INSERT ON shipment_items
FOR EACH ROW
BEGIN
    DECLARE v_shipment_date DATETIME DEFAULT NULL;
    DECLARE v_blocking_recall_count INT DEFAULT 0;

    SELECT shipment_date
      INTO v_shipment_date
      FROM shipments
     WHERE shipment_id = NEW.shipment_id;

    IF v_shipment_date IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Shipment does not exist or has no shipment date';
    END IF;

    SELECT COUNT(*)
      INTO v_blocking_recall_count
      FROM recall_affected_batches AS rab
      JOIN recalls AS r
        ON r.recall_id = rab.recall_id
     WHERE rab.prod_batch_id = NEW.prod_batch_id
       AND r.status <> 'CANCELLED'
       AND v_shipment_date >= r.recall_date;

    IF v_blocking_recall_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Shipment blocked: production batch is under recall';
    END IF;
END$$

CREATE TRIGGER trg_block_recalled_shipment_update
BEFORE UPDATE ON shipment_items
FOR EACH ROW
BEGIN
    DECLARE v_shipment_date DATETIME DEFAULT NULL;
    DECLARE v_blocking_recall_count INT DEFAULT 0;

    SELECT shipment_date
      INTO v_shipment_date
      FROM shipments
     WHERE shipment_id = NEW.shipment_id;

    IF v_shipment_date IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Shipment does not exist or has no shipment date';
    END IF;

    SELECT COUNT(*)
      INTO v_blocking_recall_count
      FROM recall_affected_batches AS rab
      JOIN recalls AS r
        ON r.recall_id = rab.recall_id
     WHERE rab.prod_batch_id = NEW.prod_batch_id
       AND r.status <> 'CANCELLED'
       AND v_shipment_date >= r.recall_date;

    IF v_blocking_recall_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Shipment blocked: production batch is under recall';
    END IF;
END$$

DELIMITER ;

-- =========================================================
-- 7. STORED PROCEDURE: OPEN A RECALL FOR ONE PRODUCTION BATCH
-- This procedure validates the batch and quantity, creates the
-- recall and affected-batch row in one transaction, and marks
-- the production batch as RECALLED.
-- =========================================================

DROP PROCEDURE IF EXISTS sp_open_recall;

DELIMITER $$

CREATE PROCEDURE sp_open_recall(
    IN p_recall_no VARCHAR(60),
    IN p_reason TEXT,
    IN p_recall_date DATETIME,
    IN p_initiated_by VARCHAR(120),
    IN p_prod_batch_id BIGINT UNSIGNED,
    IN p_affected_quantity DECIMAL(14,3)
)
BEGIN
    DECLARE v_batch_quantity DECIMAL(14,3) DEFAULT NULL;
    DECLARE v_recall_id BIGINT UNSIGNED DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT quantity
      INTO v_batch_quantity
      FROM production_batches
     WHERE prod_batch_id = p_prod_batch_id
     FOR UPDATE;

    IF v_batch_quantity IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Production batch was not found';
    END IF;

    IF p_affected_quantity IS NULL
       OR p_affected_quantity <= 0
       OR p_affected_quantity > v_batch_quantity THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Affected quantity must be greater than zero and no more than batch quantity';
    END IF;

    IF p_recall_no IS NULL OR TRIM(p_recall_no) = ''
       OR p_reason IS NULL OR TRIM(p_reason) = ''
       OR p_recall_date IS NULL
       OR p_initiated_by IS NULL OR TRIM(p_initiated_by) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Recall number, reason, date and initiator are required';
    END IF;

    INSERT INTO recalls (
        recall_no, reason, recall_date, initiated_by, status
    )
    VALUES (
        p_recall_no, p_reason, p_recall_date, p_initiated_by, 'OPEN'
    );

    SET v_recall_id = LAST_INSERT_ID();

    INSERT INTO recall_affected_batches (
        recall_id, prod_batch_id, affected_quantity,
        recovered_quantity, status
    )
    VALUES (
        v_recall_id, p_prod_batch_id, p_affected_quantity, 0, 'PENDING'
    );

    UPDATE production_batches
       SET status = 'RECALLED'
     WHERE prod_batch_id = p_prod_batch_id;

    COMMIT;

    SELECT
        v_recall_id AS recall_id,
        p_recall_no AS recall_no,
        p_prod_batch_id AS prod_batch_id,
        p_affected_quantity AS affected_quantity,
        'OPEN' AS recall_status;
END$$

DELIMITER ;

-- =========================================================
-- 8. STORED PROCEDURE: TRACE A PRODUCTION BATCH
-- Returns three result sets:
--   1) production batch and product details
--   2) raw-material batches and suppliers used
--   3) shipment destinations and quantities
-- =========================================================

DROP PROCEDURE IF EXISTS sp_trace_batch;

DELIMITER $$

CREATE PROCEDURE sp_trace_batch(
    IN p_prod_batch_id BIGINT UNSIGNED
)
BEGIN
    DECLARE v_batch_count INT DEFAULT 0;

    SELECT COUNT(*)
      INTO v_batch_count
      FROM production_batches
     WHERE prod_batch_id = p_prod_batch_id;

    IF v_batch_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Production batch was not found';
    END IF;

    -- Result set 1: production batch and product
    SELECT
        pb.prod_batch_id,
        pb.batch_no AS production_batch_no,
        pb.mfg_date,
        pb.exp_date,
        pb.quantity,
        pb.status AS batch_status,
        p.product_id,
        p.name AS product_name,
        p.category,
        p.unit AS product_unit
    FROM production_batches AS pb
    JOIN products AS p
      ON p.product_id = pb.product_id
    WHERE pb.prod_batch_id = p_prod_batch_id;

    -- Result set 2: raw materials and their suppliers
    SELECT
        rmb.rm_batch_id,
        rmb.batch_no AS raw_material_batch_no,
        rmb.material_name,
        bc.quantity_used,
        bc.unit AS quantity_unit,
        rmb.mfg_date,
        rmb.exp_date,
        rmb.status AS raw_material_status,
        s.supplier_id,
        s.name AS supplier_name,
        s.contact_person,
        s.phone,
        s.email
    FROM batch_composition AS bc
    JOIN raw_material_batches AS rmb
      ON rmb.rm_batch_id = bc.rm_batch_id
    JOIN suppliers AS s
      ON s.supplier_id = rmb.supplier_id
    WHERE bc.prod_batch_id = p_prod_batch_id
    ORDER BY rmb.material_name, rmb.batch_no;

    -- Result set 3: shipment path and destination
    SELECT
        sh.shipment_id,
        sh.shipment_date,
        sh.status AS shipment_status,
        sh.lr_number,
        si.quantity AS shipped_quantity,
        w.warehouse_id,
        w.name AS warehouse_name,
        sh.destination_type,
        d.distributor_id,
        d.name AS distributor_name,
        rt.retailer_id,
        rt.name AS retailer_name
    FROM shipment_items AS si
    JOIN shipments AS sh
      ON sh.shipment_id = si.shipment_id
    JOIN warehouses AS w
      ON w.warehouse_id = sh.warehouse_id
    LEFT JOIN distributors AS d
      ON d.distributor_id = sh.distributor_id
    LEFT JOIN retailers AS rt
      ON rt.retailer_id = sh.retailer_id
    WHERE si.prod_batch_id = p_prod_batch_id
    ORDER BY sh.shipment_date, sh.shipment_id;
END$$

DELIMITER ;

-- =========================================================
-- 9. QUICK VERIFICATION QUERIES
-- Run these after the schema is created. They should return
-- the 12 table names, the two views, two triggers and two
-- stored procedures created above.
-- =========================================================

SHOW TABLES;

SHOW FULL TABLES
WHERE Table_type = 'VIEW';

SHOW TRIGGERS;

SHOW PROCEDURE STATUS
WHERE Db = 'recallnet';

-- Optional: inspect the five project indexes.
SHOW INDEX FROM raw_material_batches;
SHOW INDEX FROM production_batches;
SHOW INDEX FROM shipments;
SHOW INDEX FROM shipment_items;
SHOW INDEX FROM recalls;

-- END OF RECALLNET MYSQL 8.0 DDL
