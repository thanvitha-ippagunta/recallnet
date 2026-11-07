-- Small deterministic sample dataset. Intended for an empty RecallNet schema.
USE recallnet;

INSERT INTO suppliers (supplier_id,name,contact_person,phone,email,address) VALUES
(1,'Northstar Ingredients','Asha Rao','+91-80-5550-1001','asha@northstar.example','Bengaluru'),
(2,'Greenfield Packaging','Dev Shah','+91-22-5550-1002','dev@greenfield.example','Mumbai')
ON DUPLICATE KEY UPDATE name=VALUES(name),contact_person=VALUES(contact_person),phone=VALUES(phone),email=VALUES(email),address=VALUES(address);

INSERT INTO products (product_id,name,category,description,unit) VALUES
(1,'Cocoa Oat Bar','Snack','Oat and cocoa energy bar','unit')
ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),description=VALUES(description),unit=VALUES(unit);

INSERT INTO warehouses (warehouse_id,name,location,warehouse_type) VALUES
(1,'Bengaluru Finished Goods','Bengaluru','FINISHED_GOODS')
ON DUPLICATE KEY UPDATE name=VALUES(name),location=VALUES(location),warehouse_type=VALUES(warehouse_type);

INSERT INTO distributors (distributor_id,name,contact_person,phone,email,address) VALUES
(1,'Southline Distribution','Mohan Iyer','+91-80-5550-2001','ops@southline.example','Bengaluru')
ON DUPLICATE KEY UPDATE name=VALUES(name),contact_person=VALUES(contact_person),phone=VALUES(phone),email=VALUES(email),address=VALUES(address);

INSERT INTO retailers (retailer_id,name,contact_person,phone,email,address) VALUES
(1,'Corner Market','Leela Nair','+91-80-5550-3001','store@corner.example','Mysuru')
ON DUPLICATE KEY UPDATE name=VALUES(name),contact_person=VALUES(contact_person),phone=VALUES(phone),email=VALUES(email),address=VALUES(address);

INSERT INTO raw_material_batches
(rm_batch_id,supplier_id,material_name,batch_no,mfg_date,exp_date,quantity,unit) VALUES
(1,1,'Rolled oats','OAT-2601','2026-01-05','2027-01-05',120.000,'kg'),
(2,1,'Cocoa powder','COC-2602','2026-02-01','2027-02-01',30.000,'kg'),
(3,2,'Food wrapper','WRP-2601','2026-01-10','2028-01-10',10000.000,'unit')
ON DUPLICATE KEY UPDATE supplier_id=VALUES(supplier_id),material_name=VALUES(material_name),batch_no=VALUES(batch_no),mfg_date=VALUES(mfg_date),exp_date=VALUES(exp_date),quantity=VALUES(quantity),unit=VALUES(unit);

INSERT INTO production_batches
(prod_batch_id,product_id,warehouse_id,batch_no,mfg_date,exp_date,quantity,status) VALUES
(1,1,1,'CB-2603-A','2026-03-10','2027-09-10',500.000,'COMPLETED'),
(2,1,1,'CB-2603-B','2026-03-12','2027-09-12',300.000,'COMPLETED')
ON DUPLICATE KEY UPDATE product_id=VALUES(product_id),warehouse_id=VALUES(warehouse_id),batch_no=VALUES(batch_no),mfg_date=VALUES(mfg_date),exp_date=VALUES(exp_date),quantity=VALUES(quantity),status=VALUES(status);

INSERT INTO batch_composition (prod_batch_id,rm_batch_id,quantity_used,unit) VALUES
(1,1,45.000,'kg'),(1,2,8.000,'kg'),(1,3,500.000,'unit'),
(2,1,27.000,'kg'),(2,2,5.000,'kg'),(2,3,300.000,'unit')
ON DUPLICATE KEY UPDATE quantity_used=VALUES(quantity_used),unit=VALUES(unit);

-- Draft movements are deliberately not dispatched by this seed script.
INSERT INTO shipments
(shipment_id,source_warehouse_id,destination_distributor_id,status,lr_number) VALUES
(1,1,1,'DRAFT','LR-DEMO-001')
ON DUPLICATE KEY UPDATE source_warehouse_id=VALUES(source_warehouse_id),destination_distributor_id=VALUES(destination_distributor_id),status='DRAFT';
INSERT INTO shipment_items (shipment_id,prod_batch_id,quantity) VALUES (1,1,180.000)
ON DUPLICATE KEY UPDATE quantity=VALUES(quantity);
INSERT INTO shipments
(shipment_id,source_distributor_id,destination_retailer_id,parent_shipment_id,status,lr_number) VALUES
(2,1,1,1,'DRAFT','LR-DEMO-002')
ON DUPLICATE KEY UPDATE source_distributor_id=VALUES(source_distributor_id),destination_retailer_id=VALUES(destination_retailer_id),parent_shipment_id=VALUES(parent_shipment_id),status='DRAFT';
INSERT INTO shipment_items (shipment_id,prod_batch_id,quantity) VALUES (2,1,120.000)
ON DUPLICATE KEY UPDATE quantity=VALUES(quantity);
