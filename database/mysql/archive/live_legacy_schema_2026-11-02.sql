-- Snapshot of the empty legacy recallnet schema before project schema refresh.
-- Captured 2026-11-02 using SHOW CREATE; no row data included.
USE recallnet;
DELIMITER ;;

CREATE TABLE `batch_composition` (
  `production_batch_id` varchar(12) NOT NULL,
  `raw_batch_id` varchar(12) NOT NULL,
  `quantity_used` decimal(12,2) NOT NULL,
  PRIMARY KEY (`production_batch_id`,`raw_batch_id`),
  KEY `fk_comp_rawbatch` (`raw_batch_id`),
  CONSTRAINT `fk_comp_prodbatch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`production_batch_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comp_rawbatch` FOREIGN KEY (`raw_batch_id`) REFERENCES `raw_material_batches` (`raw_batch_id`),
  CONSTRAINT `chk_comp_quantity` CHECK ((`quantity_used` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `distributors` (
  `distributor_id` varchar(10) NOT NULL,
  `distributor_name` varchar(120) NOT NULL,
  `city` varchar(60) NOT NULL,
  `state` varchar(60) NOT NULL,
  `service_level` char(1) NOT NULL,
  PRIMARY KEY (`distributor_id`),
  CONSTRAINT `chk_service_level` CHECK ((`service_level` in (_utf8mb4'A',_utf8mb4'B',_utf8mb4'C')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `production_batches` (
  `production_batch_id` varchar(12) NOT NULL,
  `product_id` varchar(10) NOT NULL,
  `manufactured_date` date NOT NULL,
  `expiry_date` date NOT NULL,
  `quantity_produced` int NOT NULL,
  `batch_status` varchar(15) NOT NULL,
  `qa_score` decimal(5,2) DEFAULT NULL,
  PRIMARY KEY (`production_batch_id`),
  KEY `idx_pb_product_status` (`product_id`,`batch_status`),
  CONSTRAINT `fk_prodbatch_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`),
  CONSTRAINT `chk_batch_status` CHECK ((`batch_status` in (_utf8mb4'RELEASED',_utf8mb4'HOLD',_utf8mb4'RECALLED',_utf8mb4'EXPIRED'))),
  CONSTRAINT `chk_produced_quantity` CHECK ((`quantity_produced` > 0)),
  CONSTRAINT `chk_production_dates` CHECK ((`expiry_date` > `manufactured_date`)),
  CONSTRAINT `chk_qa_score` CHECK ((`qa_score` between 0 and 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `products` (
  `product_id` varchar(10) NOT NULL,
  `product_name` varchar(150) NOT NULL,
  `category` varchar(60) NOT NULL,
  `unit_type` varchar(30) NOT NULL,
  `mrp` decimal(10,2) NOT NULL,
  `shelf_life_days` int NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`product_id`),
  CONSTRAINT `chk_product_mrp` CHECK ((`mrp` > 0)),
  CONSTRAINT `chk_shelf_life` CHECK ((`shelf_life_days` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `raw_material_batches` (
  `raw_batch_id` varchar(12) NOT NULL,
  `material_name` varchar(120) NOT NULL,
  `supplier_id` varchar(10) NOT NULL,
  `received_date` date NOT NULL,
  `quantity_received` decimal(12,2) NOT NULL,
  `unit` varchar(20) NOT NULL,
  `quality_status` varchar(12) NOT NULL,
  `expiry_date` date NOT NULL,
  PRIMARY KEY (`raw_batch_id`),
  KEY `idx_rm_supplier` (`supplier_id`),
  CONSTRAINT `fk_rawbatch_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`),
  CONSTRAINT `chk_quality_status` CHECK ((`quality_status` in (_utf8mb4'PASSED',_utf8mb4'HOLD',_utf8mb4'REJECTED'))),
  CONSTRAINT `chk_raw_batch_dates` CHECK ((`expiry_date` > `received_date`)),
  CONSTRAINT `chk_raw_quantity` CHECK ((`quantity_received` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `recall_affected_batches` (
  `recall_id` varchar(12) NOT NULL,
  `production_batch_id` varchar(12) NOT NULL,
  `action_status` varchar(24) NOT NULL,
  `affected_quantity` int NOT NULL,
  PRIMARY KEY (`recall_id`,`production_batch_id`),
  KEY `fk_affected_prodbatch` (`production_batch_id`),
  CONSTRAINT `fk_affected_prodbatch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`production_batch_id`),
  CONSTRAINT `fk_affected_recall` FOREIGN KEY (`recall_id`) REFERENCES `recalls` (`recall_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_action_status` CHECK ((`action_status` in (_utf8mb4'QUARANTINED',_utf8mb4'RECOVERY_IN_PROGRESS',_utf8mb4'RECOVERED'))),
  CONSTRAINT `chk_affected_quantity` CHECK ((`affected_quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `recalls` (
  `recall_id` varchar(12) NOT NULL,
  `product_id` varchar(10) NOT NULL,
  `initiated_date` date NOT NULL,
  `reason` text NOT NULL,
  `classification` varchar(10) NOT NULL,
  `status` varchar(15) NOT NULL,
  `initiated_by` varchar(80) NOT NULL,
  `source_type` varchar(80) DEFAULT NULL,
  PRIMARY KEY (`recall_id`),
  KEY `fk_recall_product` (`product_id`),
  KEY `idx_recall_status_date` (`status`,`initiated_date`),
  CONSTRAINT `fk_recall_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`),
  CONSTRAINT `chk_recall_classification` CHECK ((`classification` in (_utf8mb4'Class I',_utf8mb4'Class II',_utf8mb4'Class III'))),
  CONSTRAINT `chk_recall_reason_length` CHECK ((char_length(`reason`) >= 5)),
  CONSTRAINT `chk_recall_status` CHECK ((`status` in (_utf8mb4'OPEN',_utf8mb4'MONITORING',_utf8mb4'CLOSED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `retailers` (
  `retailer_id` varchar(10) NOT NULL,
  `retailer_name` varchar(120) NOT NULL,
  `city` varchar(60) NOT NULL,
  `state` varchar(60) NOT NULL,
  `store_type` varchar(40) NOT NULL,
  PRIMARY KEY (`retailer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `shipment_items` (
  `shipment_item_id` varchar(15) NOT NULL,
  `shipment_id` varchar(15) NOT NULL,
  `production_batch_id` varchar(12) NOT NULL,
  `quantity` int NOT NULL,
  PRIMARY KEY (`shipment_item_id`),
  KEY `fk_item_shipment` (`shipment_id`),
  KEY `idx_si_batch` (`production_batch_id`),
  CONSTRAINT `fk_item_prodbatch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`production_batch_id`),
  CONSTRAINT `fk_item_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`shipment_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_item_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `shipments` (
  `shipment_id` varchar(15) NOT NULL,
  `warehouse_id` varchar(10) NOT NULL,
  `distributor_id` varchar(10) NOT NULL,
  `retailer_id` varchar(10) DEFAULT NULL,
  `shipment_date` date NOT NULL,
  `status` varchar(15) NOT NULL,
  `tracking_code` varchar(30) NOT NULL,
  PRIMARY KEY (`shipment_id`),
  UNIQUE KEY `tracking_code` (`tracking_code`),
  KEY `fk_shipment_warehouse` (`warehouse_id`),
  KEY `fk_shipment_distributor` (`distributor_id`),
  KEY `fk_shipment_retailer` (`retailer_id`),
  KEY `idx_ship_date_status` (`shipment_date`,`status`),
  CONSTRAINT `fk_shipment_distributor` FOREIGN KEY (`distributor_id`) REFERENCES `distributors` (`distributor_id`),
  CONSTRAINT `fk_shipment_retailer` FOREIGN KEY (`retailer_id`) REFERENCES `retailers` (`retailer_id`),
  CONSTRAINT `fk_shipment_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`warehouse_id`),
  CONSTRAINT `chk_shipment_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'IN_TRANSIT',_utf8mb4'DELIVERED',_utf8mb4'BLOCKED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `suppliers` (
  `supplier_id` varchar(10) NOT NULL,
  `supplier_name` varchar(120) NOT NULL,
  `city` varchar(60) NOT NULL,
  `state` varchar(60) NOT NULL,
  `contact_email` varchar(150) DEFAULT NULL,
  `risk_rating` varchar(10) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`supplier_id`),
  UNIQUE KEY `contact_email` (`contact_email`),
  CONSTRAINT `chk_supplier_email_format` CHECK (((`contact_email` is null) or (locate(_utf8mb4'@',`contact_email`) > 1))),
  CONSTRAINT `chk_supplier_risk` CHECK ((`risk_rating` in (_utf8mb4'Low',_utf8mb4'Medium',_utf8mb4'High')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `warehouses` (
  `warehouse_id` varchar(10) NOT NULL,
  `warehouse_name` varchar(120) NOT NULL,
  `city` varchar(60) NOT NULL,
  `state` varchar(60) NOT NULL,
  `capacity_units` int NOT NULL,
  PRIMARY KEY (`warehouse_id`),
  CONSTRAINT `chk_warehouse_capacity` CHECK ((`capacity_units` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_active_recall_impact` AS select `r`.`recall_id` AS `recall_id`,`p`.`product_name` AS `product_name`,`r`.`classification` AS `classification`,`r`.`status` AS `status`,count(distinct `rab`.`production_batch_id`) AS `affected_batches`,coalesce(sum(`rab`.`affected_quantity`),0) AS `affected_units`,count(distinct `s`.`warehouse_id`) AS `warehouses_reached`,count(distinct `s`.`distributor_id`) AS `distributors_reached`,count(distinct `s`.`retailer_id`) AS `retailers_reached` from ((((`recalls` `r` join `products` `p` on((`p`.`product_id` = `r`.`product_id`))) join `recall_affected_batches` `rab` on((`rab`.`recall_id` = `r`.`recall_id`))) left join `shipment_items` `si` on((`si`.`production_batch_id` = `rab`.`production_batch_id`))) left join `shipments` `s` on((`s`.`shipment_id` = `si`.`shipment_id`))) where (`r`.`status` <> 'CLOSED') group by `r`.`recall_id`,`p`.`product_name`,`r`.`classification`,`r`.`status`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_supplier_batch_exposure` AS select `s`.`supplier_id` AS `supplier_id`,`s`.`supplier_name` AS `supplier_name`,count(distinct `rm`.`raw_batch_id`) AS `raw_batches`,count(distinct `bc`.`production_batch_id`) AS `production_batches`,count(distinct (case when (`pb`.`batch_status` = 'RECALLED') then `pb`.`production_batch_id` end)) AS `recalled_batches` from (((`suppliers` `s` left join `raw_material_batches` `rm` on((`rm`.`supplier_id` = `s`.`supplier_id`))) left join `batch_composition` `bc` on((`bc`.`raw_batch_id` = `rm`.`raw_batch_id`))) left join `production_batches` `pb` on((`pb`.`production_batch_id` = `bc`.`production_batch_id`))) group by `s`.`supplier_id`,`s`.`supplier_name`;

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_open_recall`(
    IN p_recall_id       VARCHAR(12),
    IN p_product_id      VARCHAR(10),
    IN p_batch_id        VARCHAR(12),
    IN p_reason          TEXT,
    IN p_classification  VARCHAR(10),
    IN p_initiated_by    VARCHAR(80)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    INSERT INTO recalls(
        recall_id,
        product_id,
        initiated_date,
        reason,
        classification,
        status,
        initiated_by,
        source_type
    )
    VALUES (
        p_recall_id,
        p_product_id,
        CURRENT_DATE(),
        p_reason,
        p_classification,
        'OPEN',
        p_initiated_by,
        'Application'
    );

    INSERT INTO recall_affected_batches(
        recall_id,
        production_batch_id,
        action_status,
        affected_quantity
    )
    SELECT
        p_recall_id,
        production_batch_id,
        'QUARANTINED',
        quantity_produced
    FROM production_batches
    WHERE production_batch_id = p_batch_id;

    UPDATE production_batches
       SET batch_status = 'RECALLED'
     WHERE production_batch_id = p_batch_id;

    COMMIT;
END;;

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_trace_batch`(
    IN p_batch_id VARCHAR(12)
)
BEGIN
    SELECT
        s.shipment_id,
        w.warehouse_name,
        d.distributor_name,
        COALESCE(r.retailer_name, 'Direct Distributor') AS retailer_name,
        s.shipment_date,
        si.quantity
    FROM shipment_items si
    JOIN shipments s
        ON s.shipment_id = si.shipment_id
    JOIN warehouses w
        ON w.warehouse_id = s.warehouse_id
    JOIN distributors d
        ON d.distributor_id = s.distributor_id
    LEFT JOIN retailers r
        ON r.retailer_id = s.retailer_id
    WHERE si.production_batch_id = p_batch_id
    ORDER BY s.shipment_date;
END;;

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_block_recalled_batch_insert` BEFORE INSERT ON `shipment_items` FOR EACH ROW BEGIN
    DECLARE v_ship_date DATE;
    DECLARE v_recall_date DATE;
    DECLARE v_message VARCHAR(255);

    SELECT shipment_date
      INTO v_ship_date
      FROM shipments
     WHERE shipment_id = NEW.shipment_id;

    SELECT MIN(r.initiated_date)
      INTO v_recall_date
      FROM recall_affected_batches rab
      JOIN recalls r
        ON r.recall_id = rab.recall_id
     WHERE rab.production_batch_id = NEW.production_batch_id;

    IF v_recall_date IS NOT NULL
       AND v_ship_date >= v_recall_date THEN
        SET v_message = CONCAT(
            'Cannot ship batch ',
            NEW.production_batch_id,
            ' on/after recall date ',
            v_recall_date
        );
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = v_message;
    END IF;
END;;

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_block_recalled_batch_update` BEFORE UPDATE ON `shipment_items` FOR EACH ROW BEGIN
    DECLARE v_ship_date DATE;
    DECLARE v_recall_date DATE;
    DECLARE v_message VARCHAR(255);

    SELECT shipment_date
      INTO v_ship_date
      FROM shipments
     WHERE shipment_id = NEW.shipment_id;

    SELECT MIN(r.initiated_date)
      INTO v_recall_date
      FROM recall_affected_batches rab
      JOIN recalls r
        ON r.recall_id = rab.recall_id
     WHERE rab.production_batch_id = NEW.production_batch_id;

    IF v_recall_date IS NOT NULL
       AND v_ship_date >= v_recall_date THEN
        SET v_message = CONCAT(
            'Cannot ship batch ',
            NEW.production_batch_id,
            ' on/after recall date ',
            v_recall_date
        );
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = v_message;
    END IF;
END;;

DELIMITER ;
