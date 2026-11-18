import "server-only";
import type { RowDataPacket } from "mysql2";
import { mysqlPool } from "@/lib/db/mysql";

interface BatchCoreRow extends RowDataPacket {
  prod_batch_id: string;
  batch_no: string;
  mfg_date: string;
  exp_date: string;
  quantity: string;
  status: string;
  created_at: string;
  product_id: string;
  product_name: string;
  product_category: string;
  product_description: string | null;
  product_unit: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_location: string;
  warehouse_type: string;
}

interface CompositionRow extends RowDataPacket {
  rm_batch_id: string;
  material_name: string;
  batch_no: string;
  mfg_date: string;
  exp_date: string;
  quantity: string;
  unit: string;
  status: string;
  quantity_used: string;
  quantity_unit: string;
  supplier_id: string;
  supplier_name: string;
  supplier_contact_person: string | null;
}

export interface BatchCore {
  id: string;
  batchNo: string;
  manufacturedOn: string;
  expiresOn: string;
  quantity: string;
  status: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    unit: string;
  };
  initialWarehouse: {
    id: string;
    name: string;
    location: string;
    type: string;
  };
}

export async function loadBatchCore(id: string): Promise<BatchCore | null> {
  const [rows] = await mysqlPool.execute<BatchCoreRow[]>(
    `SELECT pb.prod_batch_id, pb.batch_no, pb.mfg_date, pb.exp_date,
            pb.quantity, pb.status, pb.created_at,
            p.product_id, p.name AS product_name, p.category AS product_category,
            p.description AS product_description, p.unit AS product_unit,
            w.warehouse_id, w.name AS warehouse_name, w.location AS warehouse_location,
            w.warehouse_type AS warehouse_type
     FROM production_batches pb
     JOIN products p ON p.product_id = pb.product_id
     JOIN warehouses w ON w.warehouse_id = pb.warehouse_id
     WHERE pb.prod_batch_id = ?
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.prod_batch_id,
    batchNo: row.batch_no,
    manufacturedOn: row.mfg_date,
    expiresOn: row.exp_date,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at,
    product: {
      id: row.product_id,
      name: row.product_name,
      category: row.product_category,
      description: row.product_description,
      unit: row.product_unit,
    },
    initialWarehouse: {
      id: row.warehouse_id,
      name: row.warehouse_name,
      location: row.warehouse_location,
      type: row.warehouse_type,
    },
  };
}

export async function loadBatchComposition(id: string) {
  const [rows] = await mysqlPool.execute<CompositionRow[]>(
    `SELECT rmb.rm_batch_id, rmb.material_name, rmb.batch_no,
            rmb.mfg_date, rmb.exp_date, rmb.quantity, rmb.unit,
            rmb.status, bc.quantity_used, bc.unit AS quantity_unit,
            s.supplier_id, s.name AS supplier_name,
            s.contact_person AS supplier_contact_person
     FROM batch_composition bc
     JOIN raw_material_batches rmb ON rmb.rm_batch_id = bc.rm_batch_id
     JOIN suppliers s ON s.supplier_id = rmb.supplier_id
     WHERE bc.prod_batch_id = ?
     ORDER BY rmb.material_name, rmb.batch_no`,
    [id],
  );

  return rows.map((row) => ({
    rawMaterialBatch: {
      id: row.rm_batch_id,
      materialName: row.material_name,
      batchNo: row.batch_no,
      manufacturedOn: row.mfg_date,
      expiresOn: row.exp_date,
      receivedQuantity: row.quantity,
      unit: row.unit,
      status: row.status,
    },
    quantityUsed: row.quantity_used,
    quantityUnit: row.quantity_unit,
    supplier: {
      id: row.supplier_id,
      name: row.supplier_name,
      contactPerson: row.supplier_contact_person,
    },
  }));
}
