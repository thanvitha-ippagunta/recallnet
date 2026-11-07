-- RecallNet core schema | MySQL 8.0.16+
-- Execute against a fresh MySQL server with privileges to create recallnet.
-- This file contains no DROP statements and is not an upgrade migration.
CREATE DATABASE IF NOT EXISTS recallnet CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE recallnet;

CREATE TABLE suppliers (
  supplier_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  contact_person VARCHAR(120), phone VARCHAR(30), email VARCHAR(254), address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (supplier_id), UNIQUE KEY uq_suppliers_email (email)
) ENGINE=InnoDB;

CREATE TABLE products (
  product_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL, category VARCHAR(80) NOT NULL,
  description TEXT, unit VARCHAR(30) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id), UNIQUE KEY uq_products_name_category (name, category)
) ENGINE=InnoDB;

CREATE TABLE warehouses (
  warehouse_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL, location VARCHAR(160) NOT NULL, address TEXT,
  warehouse_type ENUM('RAW_MATERIAL','FINISHED_GOODS','BOTH') NOT NULL DEFAULT 'BOTH',
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (warehouse_id), UNIQUE KEY uq_warehouses_name (name)
) ENGINE=InnoDB;

CREATE TABLE distributors (
  distributor_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL, contact_person VARCHAR(120), phone VARCHAR(30),
  email VARCHAR(254), address TEXT,
  PRIMARY KEY (distributor_id), UNIQUE KEY uq_distributors_email (email)
) ENGINE=InnoDB;

CREATE TABLE retailers (
  retailer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL, contact_person VARCHAR(120), phone VARCHAR(30),
  email VARCHAR(254), address TEXT,
  PRIMARY KEY (retailer_id), UNIQUE KEY uq_retailers_email (email)
) ENGINE=InnoDB;

CREATE TABLE raw_material_batches (
  rm_batch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT UNSIGNED NOT NULL, material_name VARCHAR(120) NOT NULL,
  batch_no VARCHAR(60) NOT NULL, mfg_date DATE NOT NULL, exp_date DATE NOT NULL,
  quantity DECIMAL(14,3) NOT NULL, unit VARCHAR(30) NOT NULL,
  status ENUM('AVAILABLE','PARTIALLY_USED','CONSUMED','QUARANTINED','EXPIRED') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rm_batch_id), UNIQUE KEY uq_rm_supplier_batch (supplier_id,batch_no),
  KEY idx_rm_supplier (supplier_id),
  CONSTRAINT fk_rm_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_rm_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_rm_dates CHECK (exp_date >= mfg_date)
) ENGINE=InnoDB;

CREATE TABLE production_batches (
  prod_batch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL, warehouse_id BIGINT UNSIGNED NOT NULL,
  batch_no VARCHAR(60) NOT NULL, mfg_date DATE NOT NULL, exp_date DATE NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  status ENUM('PLANNED','IN_PRODUCTION','COMPLETED','QUARANTINED','RECALLED','EXPIRED') NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prod_batch_id), UNIQUE KEY uq_production_product_batch (product_id,batch_no),
  KEY idx_pb_product_status (product_id,status), KEY idx_pb_warehouse (warehouse_id),
  CONSTRAINT fk_pb_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pb_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_pb_quantity CHECK (quantity >= 0), CONSTRAINT chk_pb_dates CHECK (exp_date >= mfg_date)
) ENGINE=InnoDB;

CREATE TABLE batch_composition (
  comp_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  prod_batch_id BIGINT UNSIGNED NOT NULL, rm_batch_id BIGINT UNSIGNED NOT NULL,
  quantity_used DECIMAL(14,3) NOT NULL, unit VARCHAR(30) NOT NULL,
  PRIMARY KEY (comp_id), UNIQUE KEY uq_batch_composition_pair (prod_batch_id,rm_batch_id),
  KEY idx_bc_rm_batch (rm_batch_id),
  CONSTRAINT fk_bc_production_batch FOREIGN KEY (prod_batch_id) REFERENCES production_batches(prod_batch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_bc_raw_material_batch FOREIGN KEY (rm_batch_id) REFERENCES raw_material_batches(rm_batch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_bc_quantity CHECK (quantity_used > 0)
) ENGINE=InnoDB;

-- Each shipment is a movement. Supported routes: warehouse->distributor, distributor->retailer.
-- A distributor-to-retailer movement can point to its preceding shipment.
CREATE TABLE shipments (
  shipment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_warehouse_id BIGINT UNSIGNED NULL,
  source_distributor_id BIGINT UNSIGNED NULL,
  destination_distributor_id BIGINT UNSIGNED NULL,
  destination_retailer_id BIGINT UNSIGNED NULL,
  parent_shipment_id BIGINT UNSIGNED NULL,
  status ENUM('DRAFT','DISPATCHED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  dispatched_at DATETIME NULL, delivered_at DATETIME NULL,
  lr_number VARCHAR(80) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shipment_id), UNIQUE KEY uq_shipments_lr_number (lr_number),
  KEY idx_ship_status_date (status,dispatched_at),
  KEY idx_ship_source_warehouse (source_warehouse_id,status),
  KEY idx_ship_source_distributor (source_distributor_id,status),
  KEY idx_ship_dest_distributor (destination_distributor_id,status),
  KEY idx_ship_dest_retailer (destination_retailer_id,status),
  CONSTRAINT fk_ship_source_warehouse FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(warehouse_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ship_source_distributor FOREIGN KEY (source_distributor_id) REFERENCES distributors(distributor_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ship_dest_distributor FOREIGN KEY (destination_distributor_id) REFERENCES distributors(distributor_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ship_dest_retailer FOREIGN KEY (destination_retailer_id) REFERENCES retailers(retailer_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ship_parent FOREIGN KEY (parent_shipment_id) REFERENCES shipments(shipment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_ship_route CHECK (
    (source_warehouse_id IS NOT NULL AND source_distributor_id IS NULL AND destination_distributor_id IS NOT NULL AND destination_retailer_id IS NULL AND parent_shipment_id IS NULL)
    OR
    (source_warehouse_id IS NULL AND source_distributor_id IS NOT NULL AND destination_distributor_id IS NULL AND destination_retailer_id IS NOT NULL)
  ),
  CONSTRAINT chk_ship_not_same_distributor CHECK (source_distributor_id IS NULL OR destination_distributor_id IS NULL OR source_distributor_id <> destination_distributor_id)
) ENGINE=InnoDB;

CREATE TABLE shipment_items (
  shipment_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shipment_id BIGINT UNSIGNED NOT NULL, prod_batch_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  PRIMARY KEY (shipment_item_id), UNIQUE KEY uq_shipment_batch (shipment_id,prod_batch_id),
  KEY idx_si_batch_shipment (prod_batch_id,shipment_id),
  CONSTRAINT fk_si_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_si_production_batch FOREIGN KEY (prod_batch_id) REFERENCES production_batches(prod_batch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_si_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE recalls (
  recall_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recall_no VARCHAR(60) NOT NULL, reason TEXT NOT NULL,
  initiated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  initiated_by VARCHAR(120) NOT NULL,
  status ENUM('OPEN','IN_PROGRESS','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  description TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recall_id), UNIQUE KEY uq_recalls_recall_no (recall_no),
  KEY idx_recall_status_date (status,initiated_at)
) ENGINE=InnoDB;

CREATE TABLE recall_affected_batches (
  rab_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recall_id BIGINT UNSIGNED NOT NULL, prod_batch_id BIGINT UNSIGNED NOT NULL,
  affected_quantity DECIMAL(14,3) NOT NULL,
  recovered_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  status ENUM('PENDING','NOTIFIED','QUARANTINED','RECOVERED','CLOSED') NOT NULL DEFAULT 'PENDING',
  PRIMARY KEY (rab_id), UNIQUE KEY uq_recall_affected_batch (recall_id,prod_batch_id),
  KEY idx_rab_batch (prod_batch_id), KEY idx_rab_recall (recall_id),
  CONSTRAINT fk_rab_recall FOREIGN KEY (recall_id) REFERENCES recalls(recall_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rab_production_batch FOREIGN KEY (prod_batch_id) REFERENCES production_batches(prod_batch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_rab_affected_quantity CHECK (affected_quantity > 0),
  CONSTRAINT chk_rab_recovered_quantity CHECK (recovered_quantity >= 0 AND recovered_quantity <= affected_quantity)
) ENGINE=InnoDB;

