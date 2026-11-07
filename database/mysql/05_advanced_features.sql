-- Advanced database features. Run after 01_schema.sql.
USE recallnet;

CREATE OR REPLACE VIEW v_active_recall_impact AS
SELECT r.recall_id,r.recall_no,r.initiated_at,r.status AS recall_status,
       rab.prod_batch_id,pb.batch_no AS production_batch_no,p.name AS product_name,
       rab.affected_quantity,rab.recovered_quantity,rab.status AS recovery_status
FROM recalls r
JOIN recall_affected_batches rab ON rab.recall_id=r.recall_id
JOIN production_batches pb ON pb.prod_batch_id=rab.prod_batch_id
JOIN products p ON p.product_id=pb.product_id
WHERE r.status IN ('OPEN','IN_PROGRESS');

CREATE OR REPLACE VIEW v_batch_distribution AS
SELECT pb.prod_batch_id,pb.batch_no,sh.shipment_id,sh.status,sh.dispatched_at,
       wh.name AS source_warehouse,sd.name AS source_distributor,
       dd.name AS destination_distributor,rt.name AS destination_retailer,si.quantity
FROM production_batches pb
JOIN shipment_items si ON si.prod_batch_id=pb.prod_batch_id
JOIN shipments sh ON sh.shipment_id=si.shipment_id
LEFT JOIN warehouses wh ON wh.warehouse_id=sh.source_warehouse_id
LEFT JOIN distributors sd ON sd.distributor_id=sh.source_distributor_id
LEFT JOIN distributors dd ON dd.distributor_id=sh.destination_distributor_id
LEFT JOIN retailers rt ON rt.retailer_id=sh.destination_retailer_id
WHERE sh.status IN ('DISPATCHED','DELIVERED');

-- Safe re-run setup: replace only the routines and triggers defined below.
DROP PROCEDURE IF EXISTS sp_open_recall;
DROP PROCEDURE IF EXISTS sp_trace_batch;
DROP PROCEDURE IF EXISTS sp_dispatch_shipment;

DROP TRIGGER IF EXISTS trg_shipment_insert_guard;
DROP TRIGGER IF EXISTS trg_shipment_dispatch_guard;
DROP TRIGGER IF EXISTS trg_shipment_items_insert_guard;
DROP TRIGGER IF EXISTS trg_shipment_items_update_guard;
DROP TRIGGER IF EXISTS trg_shipment_items_delete_guard;

DELIMITER $$

CREATE PROCEDURE sp_open_recall(
  IN p_recall_no VARCHAR(60), IN p_reason TEXT, IN p_initiated_by VARCHAR(120),
  IN p_prod_batch_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_batch_qty DECIMAL(14,3) DEFAULT NULL;
  DECLARE v_active_count INT DEFAULT 0;
  DECLARE v_recall_id BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT quantity INTO v_batch_qty FROM production_batches WHERE prod_batch_id=p_prod_batch_id FOR UPDATE;
  IF v_batch_qty IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production batch not found'; END IF;
  IF p_recall_no IS NULL OR TRIM(p_recall_no)='' OR p_reason IS NULL OR TRIM(p_reason)='' OR p_initiated_by IS NULL OR TRIM(p_initiated_by)='' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Recall number, reason and initiator are required';
  END IF;
  SELECT COUNT(*) INTO v_active_count FROM recall_affected_batches rab JOIN recalls r ON r.recall_id=rab.recall_id
   WHERE rab.prod_batch_id=p_prod_batch_id AND r.status IN ('OPEN','IN_PROGRESS');
  IF v_active_count>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='This batch already has an active recall'; END IF;
  INSERT INTO recalls(recall_no,reason,initiated_by,status) VALUES(p_recall_no,p_reason,p_initiated_by,'OPEN');
  SET v_recall_id=LAST_INSERT_ID();
  INSERT INTO recall_affected_batches(recall_id,prod_batch_id,affected_quantity,recovered_quantity,status)
    VALUES(v_recall_id,p_prod_batch_id,v_batch_qty,0,'PENDING');
  UPDATE production_batches SET status='RECALLED' WHERE prod_batch_id=p_prod_batch_id;
  COMMIT;
  SELECT v_recall_id AS recall_id,p_prod_batch_id AS prod_batch_id,v_batch_qty AS affected_quantity,'OPEN' AS recall_status;
END$$

CREATE PROCEDURE sp_trace_batch(IN p_prod_batch_id BIGINT UNSIGNED)
BEGIN
  IF NOT EXISTS(SELECT 1 FROM production_batches WHERE prod_batch_id=p_prod_batch_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production batch not found';
  END IF;
  SELECT pb.prod_batch_id,pb.batch_no,pb.quantity,pb.status,p.name AS product_name,w.name AS initial_warehouse
    FROM production_batches pb JOIN products p ON p.product_id=pb.product_id JOIN warehouses w ON w.warehouse_id=pb.warehouse_id
   WHERE pb.prod_batch_id=p_prod_batch_id;
  SELECT rmb.rm_batch_id,rmb.batch_no,rmb.material_name,bc.quantity_used,bc.unit,s.supplier_id,s.name AS supplier_name
    FROM batch_composition bc JOIN raw_material_batches rmb ON rmb.rm_batch_id=bc.rm_batch_id JOIN suppliers s ON s.supplier_id=rmb.supplier_id
   WHERE bc.prod_batch_id=p_prod_batch_id ORDER BY rmb.material_name,rmb.batch_no;
  SELECT * FROM v_batch_distribution WHERE prod_batch_id=p_prod_batch_id ORDER BY dispatched_at,shipment_id;
END$$

CREATE PROCEDURE sp_dispatch_shipment(IN p_shipment_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_source_wh BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_source_dist BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_parent_shipment_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_batch_id BIGINT UNSIGNED;
  DECLARE v_qty DECIMAL(14,3);
  DECLARE v_initial_wh BIGINT UNSIGNED;
  DECLARE v_batch_qty DECIMAL(14,3);
  DECLARE v_batch_status VARCHAR(20);
  DECLARE v_available DECIMAL(14,3);
  DECLARE v_recalled INT DEFAULT 0;
  DECLARE v_done BOOLEAN DEFAULT FALSE;
  DECLARE c_items CURSOR FOR SELECT prod_batch_id FROM shipment_items WHERE shipment_id=p_shipment_id ORDER BY prod_batch_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT status,source_warehouse_id,source_distributor_id,parent_shipment_id
    INTO v_status,v_source_wh,v_source_dist,v_parent_shipment_id
    FROM shipments WHERE shipment_id=p_shipment_id FOR UPDATE;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment not found'; END IF;
  IF v_status<>'DRAFT' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only a draft shipment can be dispatched'; END IF;
  IF NOT EXISTS(SELECT 1 FROM shipment_items WHERE shipment_id=p_shipment_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment has no items'; END IF;
  OPEN c_items;
  item_loop: LOOP
    FETCH c_items INTO v_batch_id;
    IF v_done THEN LEAVE item_loop; END IF;
    SELECT warehouse_id,quantity,status INTO v_initial_wh,v_batch_qty,v_batch_status FROM production_batches WHERE prod_batch_id=v_batch_id FOR UPDATE;
    IF v_batch_status<>'COMPLETED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only completed, non-quarantined batches can be dispatched'; END IF;
    SELECT quantity INTO v_qty FROM shipment_items WHERE shipment_id=p_shipment_id AND prod_batch_id=v_batch_id;
    SELECT COUNT(*) INTO v_recalled FROM recall_affected_batches rab JOIN recalls r ON r.recall_id=rab.recall_id
      WHERE rab.prod_batch_id=v_batch_id AND r.status<>'CANCELLED';
    IF v_recalled>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatch blocked: batch has a non-cancelled recall'; END IF;
    IF v_source_dist IS NOT NULL AND v_parent_shipment_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM shipments parent
      JOIN shipment_items parent_item ON parent_item.shipment_id=parent.shipment_id
      WHERE parent.shipment_id=v_parent_shipment_id
        AND parent.status IN ('DISPATCHED','DELIVERED')
        AND parent.destination_distributor_id=v_source_dist
        AND parent_item.prod_batch_id=v_batch_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Parent shipment must be dispatched to this distributor and contain this production batch';
    END IF;
    IF v_source_wh IS NOT NULL THEN
      SELECT (CASE WHEN v_initial_wh=v_source_wh THEN v_batch_qty ELSE 0 END)
        - COALESCE((SELECT SUM(si.quantity) FROM shipment_items si JOIN shipments sh ON sh.shipment_id=si.shipment_id
          WHERE si.prod_batch_id=v_batch_id AND sh.source_warehouse_id=v_source_wh AND sh.status IN ('DISPATCHED','DELIVERED')),0)
        INTO v_available;
    ELSE
      SELECT COALESCE((SELECT SUM(si.quantity) FROM shipment_items si JOIN shipments sh ON sh.shipment_id=si.shipment_id
          WHERE si.prod_batch_id=v_batch_id AND sh.destination_distributor_id=v_source_dist AND sh.status IN ('DISPATCHED','DELIVERED')),0)
        - COALESCE((SELECT SUM(si.quantity) FROM shipment_items si JOIN shipments sh ON sh.shipment_id=si.shipment_id
          WHERE si.prod_batch_id=v_batch_id AND sh.source_distributor_id=v_source_dist AND sh.status IN ('DISPATCHED','DELIVERED')),0)
        INTO v_available;
    END IF;
    IF v_qty>v_available THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatch blocked: insufficient batch quantity at source'; END IF;
  END LOOP;
  CLOSE c_items;
  UPDATE shipments SET status='DISPATCHED' WHERE shipment_id=p_shipment_id;
  COMMIT;
  SELECT shipment_id,status,dispatched_at FROM shipments WHERE shipment_id=p_shipment_id;
END$$

CREATE TRIGGER trg_shipment_insert_guard BEFORE INSERT ON shipments FOR EACH ROW
BEGIN
  IF NEW.status<>'DRAFT' OR NEW.dispatched_at IS NOT NULL OR NEW.delivered_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New shipments must be drafts; dispatch timestamps are database generated';
  END IF;
END$$

CREATE TRIGGER trg_shipment_dispatch_guard BEFORE UPDATE ON shipments FOR EACH ROW
BEGIN
  IF OLD.status='CANCELLED' AND NEW.status<>'CANCELLED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancelled shipments cannot be reopened';
  END IF;
  IF OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','DISPATCHED','CANCELLED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid shipment status transition';
  END IF;
  IF OLD.status='DRAFT' AND NEW.status='DISPATCHED' THEN
    IF NOT EXISTS(SELECT 1 FROM shipment_items WHERE shipment_id=OLD.shipment_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot dispatch an empty shipment';
    END IF;
    IF EXISTS(SELECT 1 FROM shipment_items si JOIN production_batches pb ON pb.prod_batch_id=si.prod_batch_id
      WHERE si.shipment_id=OLD.shipment_id AND pb.status<>'COMPLETED') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatch blocked: batch is not in completed status';
    END IF;
    IF EXISTS(SELECT 1 FROM shipment_items si JOIN recall_affected_batches rab ON rab.prod_batch_id=si.prod_batch_id
      JOIN recalls r ON r.recall_id=rab.recall_id WHERE si.shipment_id=OLD.shipment_id AND r.status<>'CANCELLED') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatch blocked: shipment contains a recalled batch';
    END IF;
    IF NEW.source_distributor_id IS NOT NULL AND NEW.parent_shipment_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM shipments parent
         WHERE parent.shipment_id=NEW.parent_shipment_id
           AND parent.destination_distributor_id=NEW.source_distributor_id
           AND parent.status IN ('DISPATCHED','DELIVERED')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Parent shipment must deliver to this distributor before onward dispatch';
    END IF;
    IF NEW.source_distributor_id IS NOT NULL AND NEW.parent_shipment_id IS NOT NULL
       AND EXISTS(SELECT 1 FROM shipment_items child_item
         WHERE child_item.shipment_id=OLD.shipment_id
           AND NOT EXISTS(SELECT 1 FROM shipment_items parent_item
             WHERE parent_item.shipment_id=NEW.parent_shipment_id
               AND parent_item.prod_batch_id=child_item.prod_batch_id)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Parent shipment must contain every production batch in the onward movement';
    END IF;
    SET NEW.dispatched_at=CURRENT_TIMESTAMP;
  ELSEIF NEW.dispatched_at IS NOT NULL AND NOT (NEW.dispatched_at <=> OLD.dispatched_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatch timestamp is server generated and immutable';
  END IF;
  IF OLD.status IN ('DISPATCHED','DELIVERED') AND NEW.status NOT IN (OLD.status,'DELIVERED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatched history cannot be cancelled or rewritten; record a corrective movement';
  END IF;
  IF OLD.status IN ('DISPATCHED','DELIVERED') AND (
      NOT (NEW.source_warehouse_id <=> OLD.source_warehouse_id)
      OR NOT (NEW.source_distributor_id <=> OLD.source_distributor_id)
      OR NOT (NEW.destination_distributor_id <=> OLD.destination_distributor_id)
      OR NOT (NEW.destination_retailer_id <=> OLD.destination_retailer_id)
      OR NOT (NEW.parent_shipment_id <=> OLD.parent_shipment_id)
      OR NOT (NEW.lr_number <=> OLD.lr_number)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatched shipment route is immutable';
  END IF;
  IF OLD.status='DISPATCHED' AND NEW.status='DELIVERED' THEN SET NEW.delivered_at=CURRENT_TIMESTAMP; END IF;
  IF NOT (OLD.status='DISPATCHED' AND NEW.status='DELIVERED')
     AND NOT (NEW.delivered_at <=> OLD.delivered_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Delivery timestamp is server generated and immutable';
  END IF;
  IF OLD.status='DELIVERED' AND NEW.status<>'DELIVERED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Delivered shipment history is immutable'; END IF;
END$$

CREATE TRIGGER trg_shipment_items_insert_guard BEFORE INSERT ON shipment_items FOR EACH ROW
BEGIN
  IF (SELECT status FROM shipments WHERE shipment_id=NEW.shipment_id)<>'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment lines can only be added to drafts';
  END IF;
  IF EXISTS(SELECT 1 FROM recall_affected_batches rab JOIN recalls r ON r.recall_id=rab.recall_id
    WHERE rab.prod_batch_id=NEW.prod_batch_id AND r.status<>'CANCELLED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment blocked: batch has a non-cancelled recall';
  END IF;
END$$

CREATE TRIGGER trg_shipment_items_update_guard BEFORE UPDATE ON shipment_items FOR EACH ROW
BEGIN
  IF (SELECT status FROM shipments WHERE shipment_id=OLD.shipment_id)<>'DRAFT'
     OR (SELECT status FROM shipments WHERE shipment_id=NEW.shipment_id)<>'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatched shipment lines are immutable';
  END IF;
  IF EXISTS(SELECT 1 FROM recall_affected_batches rab JOIN recalls r ON r.recall_id=rab.recall_id
    WHERE rab.prod_batch_id=NEW.prod_batch_id AND r.status<>'CANCELLED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment blocked: batch has a non-cancelled recall';
  END IF;
END$$

CREATE TRIGGER trg_shipment_items_delete_guard BEFORE DELETE ON shipment_items FOR EACH ROW
BEGIN
  IF (SELECT status FROM shipments WHERE shipment_id=OLD.shipment_id)<>'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatched shipment lines cannot be deleted';
  END IF;
END$$

DELIMITER ;

-- Transaction example: disposable temporary row proves rollback without changing project data.
CREATE TEMPORARY TABLE transaction_demo (demo_id INT PRIMARY KEY, note VARCHAR(40) NOT NULL);
INSERT INTO transaction_demo VALUES (1,'before');
START TRANSACTION;
UPDATE transaction_demo SET note='inside transaction' WHERE demo_id=1;
SELECT demo_id,note FROM transaction_demo;
ROLLBACK;
SELECT demo_id,note AS value_after_rollback FROM transaction_demo;
DROP TEMPORARY TABLE transaction_demo;

-- Index examples are created in 01_schema.sql; inspect via SHOW INDEX FROM shipment_items;
