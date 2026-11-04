import type { RowDataPacket } from "mysql2";
import { apiError, internalApiError, parsePositiveSqlId } from "@/lib/api/http";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { authorizePermission, type AuthenticatedUser } from "@/lib/auth/session";
import { getMongoDb } from "@/lib/db/mongodb";
import { mysqlPool } from "@/lib/db/mysql";

interface ShipmentRow extends RowDataPacket {shipment_id:string;status:string;dispatched_at:string|null;delivered_at:string|null;source_warehouse_id:string|null;source_distributor_id:string|null;destination_distributor_id:string|null;destination_retailer_id:string|null;lr_number:string|null;quantity:string;batch_no:string}
function isObject(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
async function audit(event:Record<string,unknown>,shipmentId:string):Promise<void>{try{await (await getMongoDb()).collection("audit_events").insertOne(event)}catch{console.error("RecallNet audit event write failed after shipment commit",{shipmentId,eventType:event.eventType})}}

async function loadScopedRows(user:AuthenticatedUser,filters:string,values:(string|number)[],limit=100,offset=0){
 const [rows]=await mysqlPool.execute<ShipmentRow[]>(`SELECT sh.shipment_id,sh.status,sh.dispatched_at,sh.delivered_at,sh.source_warehouse_id,sh.source_distributor_id,sh.destination_distributor_id,sh.destination_retailer_id,sh.lr_number,si.quantity,pb.batch_no FROM shipments sh JOIN shipment_items si ON si.shipment_id=sh.shipment_id JOIN production_batches pb ON pb.prod_batch_id=si.prod_batch_id ${filters} ORDER BY sh.created_at DESC,sh.shipment_id DESC LIMIT ? OFFSET ?`,[...values,limit,offset]);
 return rows;
}

export async function GET(request:Request):Promise<Response>{
 const userAuth=await authorizePermission(request,"warehouse-shipments:read");
 const distributorAuth=userAuth.authorized?null:await authorizePermission(request,"assigned-shipments:read");
 const user=userAuth.authorized?userAuth.user:distributorAuth?.authorized?distributorAuth.user:null;
 if(!user)return userAuth.authorized?internalApiError():distributorAuth?.authorized?internalApiError():userAuth.response;
 const url=new URL(request.url);const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||50));const page=Math.max(1,Number(url.searchParams.get("page"))||1);
 try{
  let where="";let values:(string|number)[]=[];
  if(user.role==="DISTRIBUTOR"){
   if(!user.distributorId)return apiError(403,"DISTRIBUTOR_UNASSIGNED","This distributor account is not linked to a distributor.");
   where="WHERE (sh.destination_distributor_id=? OR sh.source_distributor_id=?)";values=[user.distributorId,user.distributorId];
  } else if(user.role==="WAREHOUSE_MANAGER") {
   // Existing schema does not associate a warehouse user with a warehouse; limit visibility to warehouse-origin movements.
   where="WHERE sh.source_warehouse_id IS NOT NULL";
  }
  const rows=await loadScopedRows(user,where,values,limit,(page-1)*limit);
  return Response.json({data:rows.map(r=>({id:r.shipment_id,status:r.status,dispatchedAt:r.dispatched_at,deliveredAt:r.delivered_at,sourceWarehouseId:r.source_warehouse_id,sourceDistributorId:r.source_distributor_id,destinationDistributorId:r.destination_distributor_id,destinationRetailerId:r.destination_retailer_id,trackingNumber:r.lr_number,quantity:r.quantity,batchNo:r.batch_no})),pagination:{page,limit}});
 }catch{return internalApiError()}
}

export async function POST(request:Request):Promise<Response>{
 const csrf=requireSameOrigin(request);if(csrf)return csrf;
 const warehouseAuth=await authorizePermission(request,"dashboard:read");
 const downstreamAuth=warehouseAuth.authorized?null:await authorizePermission(request,"downstream-shipments:dispatch");
 const user=warehouseAuth.authorized?warehouseAuth.user:downstreamAuth?.authorized?downstreamAuth.user:null;
 if(!user)return warehouseAuth.authorized?internalApiError():downstreamAuth?.authorized?internalApiError():warehouseAuth.response;
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return apiError(415,"UNSUPPORTED_MEDIA_TYPE","Send a JSON request body.");
 try{
  const raw=await request.text();if(Buffer.byteLength(raw,"utf8")>4096)return apiError(413,"REQUEST_TOO_LARGE","Request body is too large.");
  let body:unknown;try{body=JSON.parse(raw) as unknown}catch{return apiError(400,"INVALID_REQUEST","Request body must be valid JSON.")}
  if(!isObject(body)||!Array.isArray(body.items)||body.items.length<1||body.items.length>100)return apiError(400,"INVALID_REQUEST","Provide between 1 and 100 shipment items.");
  const items:{batchId:string;quantity:string}[]=[];for(const item of body.items){if(!isObject(item)||typeof item.batchId!=="string"||(typeof item.quantity!=="string"&&typeof item.quantity!=="number"))return apiError(400,"INVALID_ITEM","Each item needs batchId and positive quantity.");const batchId=parsePositiveSqlId(item.batchId);const quantity=String(item.quantity);if(!batchId||!/^(?:\d+)(?:\.\d{1,3})?$/.test(quantity)||Number(quantity)<=0)return apiError(400,"INVALID_ITEM","Each item needs a valid batch ID and positive quantity.");items.push({batchId,quantity})}
  if(new Set(items.map(i=>i.batchId)).size!==items.length)return apiError(400,"DUPLICATE_BATCH","A batch may appear only once in a shipment.");
  const lrNumber=typeof body.trackingNumber==="string"?body.trackingNumber.trim().slice(0,80):null;
  const connection=await mysqlPool.getConnection();let shipmentId="";
  try{
   await connection.beginTransaction();
  if(user.role==="DISTRIBUTOR"&&(!parsePositiveSqlId(String(body.destinationRetailerId??""))||!parsePositiveSqlId(String(body.parentShipmentId??"")))){
    await connection.rollback();
    return apiError(400,"INVALID_ROUTE","A downstream shipment requires a retailer destination and parent shipment.");
  }
  if(user.role==="WAREHOUSE_MANAGER"){
    await connection.rollback();
    return apiError(403,"FORBIDDEN","Warehouse shipment creation requires an administrator until warehouse-specific write permissions are configured.");
  }
   const [insert]=await connection.execute("INSERT INTO shipments (source_warehouse_id,source_distributor_id,destination_distributor_id,destination_retailer_id,parent_shipment_id,status,lr_number) VALUES (?,?,?,?,?,'DRAFT',?)",[
    user.role==="DISTRIBUTOR"?null:(typeof body.sourceWarehouseId==="string"?parsePositiveSqlId(body.sourceWarehouseId):null),
    user.role==="DISTRIBUTOR"?user.distributorId:(typeof body.sourceDistributorId==="string"?parsePositiveSqlId(body.sourceDistributorId):null),
    typeof body.destinationDistributorId==="string"?parsePositiveSqlId(body.destinationDistributorId):null,
    typeof body.destinationRetailerId==="string"?parsePositiveSqlId(body.destinationRetailerId):null,
    typeof body.parentShipmentId==="string"?parsePositiveSqlId(body.parentShipmentId):null,lrNumber,
   ]);
   shipmentId=String((insert as {insertId:number|string}).insertId);
   for(const item of items)await connection.execute("INSERT INTO shipment_items (shipment_id,prod_batch_id,quantity) VALUES (?,?,?)",[shipmentId,item.batchId,item.quantity]);
   await connection.commit();
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
  await audit({eventType:"SHIPMENT_CREATED",occurredAt:new Date(),actor:{userId:user.id,role:user.role},entity:{type:"shipment",mysqlId:Number(shipmentId)},details:{status:"DRAFT",itemCount:items.length,batchIds:items.map(item=>Number(item.batchId))},requestId:request.headers.get("x-request-id")??crypto.randomUUID()},shipmentId);
  return Response.json({data:{id:shipmentId,status:"DRAFT"}},{status:201});
 }catch{return internalApiError()}
}
