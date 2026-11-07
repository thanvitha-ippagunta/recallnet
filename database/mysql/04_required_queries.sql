-- Required query demonstrations. Run after schema and seed data.
USE recallnet;

-- SELECT + ORDER BY
SELECT prod_batch_id,batch_no,quantity,status FROM production_batches ORDER BY mfg_date DESC,batch_no;

-- JOIN: full supplier-to-retailer route through both movement legs.
SELECT s.name AS supplier,p.name AS product,pb.batch_no,
       wh.name AS initial_warehouse,d.name AS distributor,r.name AS retailer,
       s1.shipment_id AS warehouse_to_distributor,
       s2.shipment_id AS distributor_to_retailer,
       si1.quantity AS quantity_to_distributor,si2.quantity AS quantity_to_retailer
FROM suppliers s
JOIN raw_material_batches rmb ON rmb.supplier_id=s.supplier_id
JOIN batch_composition bc ON bc.rm_batch_id=rmb.rm_batch_id
JOIN production_batches pb ON pb.prod_batch_id=bc.prod_batch_id
JOIN products p ON p.product_id=pb.product_id
JOIN warehouses wh ON wh.warehouse_id=pb.warehouse_id
JOIN shipment_items si1 ON si1.prod_batch_id=pb.prod_batch_id
JOIN shipments s1 ON s1.shipment_id=si1.shipment_id AND s1.status IN ('DISPATCHED','DELIVERED')
JOIN distributors d ON d.distributor_id=s1.destination_distributor_id
JOIN shipments s2 ON s2.parent_shipment_id=s1.shipment_id AND s2.status IN ('DISPATCHED','DELIVERED')
JOIN shipment_items si2 ON si2.shipment_id=s2.shipment_id AND si2.prod_batch_id=pb.prod_batch_id
JOIN retailers r ON r.retailer_id=s2.destination_retailer_id
GROUP BY s.name,p.name,pb.batch_no,wh.name,d.name,r.name,s1.shipment_id,s2.shipment_id,si1.quantity,si2.quantity
ORDER BY pb.batch_no,s1.shipment_id,s2.shipment_id;

-- Aggregate + GROUP BY + HAVING
SELECT p.name,COUNT(*) AS batch_count,SUM(pb.quantity) AS units_produced,AVG(pb.quantity) AS avg_batch_size
FROM products p JOIN production_batches pb ON pb.product_id=p.product_id
GROUP BY p.product_id,p.name HAVING SUM(pb.quantity) >= 500 ORDER BY units_produced DESC;

-- Subquery: batches whose production quantity exceeds the product's average batch size.
SELECT pb.prod_batch_id,pb.batch_no,pb.quantity
FROM production_batches pb
WHERE pb.quantity > (SELECT AVG(pb2.quantity) FROM production_batches pb2 WHERE pb2.product_id=pb.product_id)
ORDER BY pb.quantity DESC;

-- Recall impact with aggregate shipment totals.
SELECT pb.batch_no,COALESCE(SUM(CASE WHEN sh.shipment_id IS NOT NULL THEN si.quantity ELSE 0 END),0) AS units_moved,
       COUNT(DISTINCT sh.shipment_id) AS movement_count
FROM production_batches pb
LEFT JOIN shipment_items si ON si.prod_batch_id=pb.prod_batch_id
LEFT JOIN shipments sh ON sh.shipment_id=si.shipment_id AND sh.status IN ('DISPATCHED','DELIVERED')
GROUP BY pb.prod_batch_id,pb.batch_no ORDER BY pb.batch_no;
