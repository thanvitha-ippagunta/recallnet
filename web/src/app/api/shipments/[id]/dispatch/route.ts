import type { RowDataPacket } from "mysql2";
import { apiError, internalApiError, parsePositiveSqlId } from "@/lib/api/http";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { authorizePermission } from "@/lib/auth/session";
import { getMongoDb } from "@/lib/db/mongodb";
import { mysqlPool } from "@/lib/db/mysql";

type Context={params:Promise<{id:string}>};
interface DispatchedRow extends RowDataPacket{shipment_id:string;status:string;dispatched_at:string}
function isProcedureValidationError(error: unknown): boolean {
 return typeof error === "object" && error !== null && "code" in error && error.code === "ER_SIGNAL_EXCEPTION";
}
export async function POST(request:Request,{params}:Context):Promise<Response>{
 const csrf=requireSameOrigin(request);if(csrf)return csrf;
 const admin=await authorizePermission(request,"dashboard:read");
 const downstream=admin.authorized?null:await authorizePermission(request,"downstream-shipments:dispatch");
 const auth=admin.authorized?admin:downstream;
 if(!auth?.authorized)return admin.authorized?internalApiError():downstream?.authorized?internalApiError():admin.response;
 const {id:raw}=await params;const id=parsePositiveSqlId(raw);if(!id)return apiError(400,"INVALID_SHIPMENT_ID","Shipment ID must be a positive integer.");
 try{
  const [routeRows]=await mysqlPool.execute<RowDataPacket[]>("SELECT source_warehouse_id,source_distributor_id,destination_distributor_id FROM shipments WHERE shipment_id=?",[id]);const route=routeRows[0];if(!route)return apiError(404,"SHIPMENT_NOT_FOUND","Shipment was not found.");
  if(auth.user.role==="DISTRIBUTOR"&&(String(route.source_distributor_id)!==auth.user.distributorId||route.source_warehouse_id!==null))return apiError(403,"FORBIDDEN","You may dispatch only downstream shipments from your distributor account.");
  if(auth.user.role!=="ADMIN"&&auth.user.role!=="DISTRIBUTOR")return apiError(403,"FORBIDDEN","You do not have shipment dispatch permission.");
  await mysqlPool.query("CALL sp_dispatch_shipment(?)",[id]);
  const [rows]=await mysqlPool.execute<DispatchedRow[]>("SELECT shipment_id,status,dispatched_at FROM shipments WHERE shipment_id=?",[id]);const dispatched=rows[0];if(!dispatched)return internalApiError();
  try{await (await getMongoDb()).collection("audit_events").insertOne({eventType:"SHIPMENT_DISPATCHED",occurredAt:new Date(),actor:{userId:auth.user.id,role:auth.user.role},entity:{type:"shipment",mysqlId:Number(id)},details:{status:dispatched.status,dispatchedAt:dispatched.dispatched_at},requestId:request.headers.get("x-request-id")??crypto.randomUUID()})}catch{console.error("RecallNet audit event write failed after shipment commit",{shipmentId:id,eventType:"SHIPMENT_DISPATCHED"})}
  return Response.json({data:{id:dispatched.shipment_id,status:dispatched.status,dispatchedAt:dispatched.dispatched_at}});
 }catch(error){
  if(isProcedureValidationError(error)){
   try{await (await getMongoDb()).collection("audit_events").insertOne({eventType:"SHIPMENT_BLOCKED",occurredAt:new Date(),actor:{userId:auth.user.id,role:auth.user.role},entity:{type:"shipment",mysqlId:Number(id)},details:{reason:"DISPATCH_VALIDATION_FAILED"},requestId:request.headers.get("x-request-id")??crypto.randomUUID()})}catch{console.error("RecallNet blocked-shipment audit write failed",{shipmentId:id,eventType:"SHIPMENT_BLOCKED"})}
   return apiError(409,"SHIPMENT_BLOCKED","Dispatch was blocked by inventory, recall, or shipment-route validation.");
  }
  return internalApiError();
 }
}
