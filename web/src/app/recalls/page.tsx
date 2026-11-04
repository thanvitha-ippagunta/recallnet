import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

export const instant = false;
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";
import RecallForm from "./recall-form";

interface Recall extends RowDataPacket {recall_id:string;recall_no:string;reason:string;initiated_at:string;initiated_by:string;status:string;batch_count:string}
interface BatchOption extends RowDataPacket{id:string;batchNo:string;status:string}
export default async function RecallsPage(){
 const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;const auth=await authorizePermission(new Request("http://recallnet.local/",{headers:token?{cookie:`${SESSION_COOKIE_NAME}=${token}`}:{}}),"recalls:read");if(!auth.authorized)redirect("/login");
 const [rows]=await mysqlPool.execute<Recall[]>(`SELECT r.recall_id,r.recall_no,r.reason,r.initiated_at,r.initiated_by,r.status,COUNT(rab.rab_id) AS batch_count FROM recalls r LEFT JOIN recall_affected_batches rab ON rab.recall_id=r.recall_id GROUP BY r.recall_id ORDER BY r.initiated_at DESC LIMIT 100`).catch(()=>[[] as Recall[],[]]);
 const [batchOptions]=await mysqlPool.execute<BatchOption[]>(`SELECT prod_batch_id AS id,batch_no AS batchNo,status FROM production_batches ORDER BY batch_no`).catch(()=>[[] as BatchOption[],[]]);
 return <main className="content"><div className="section-heading"><div><p className="eyebrow">QUALITY MANAGEMENT</p><h1>Recall center</h1><p className="subhead">Review affected production batches and follow their distribution trail.</p></div><Link className="text-link" href="/">← Operations overview</Link></div>{auth.user.role==="ADMIN"||auth.user.role==="QUALITY_MANAGER"?<div style={{maxWidth:540,marginBottom:28}}><RecallForm batches={batchOptions}/></div>:null}<div className="table-card table-wrap"><table><thead><tr><th>Recall</th><th>Reason</th><th>Started</th><th>Initiated by</th><th>Affected batches</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.recall_id}><td><Link className="batch-link" href={`/recalls/${r.recall_id}`}>{r.recall_no}</Link></td><td>{r.reason}</td><td>{String(r.initiated_at).slice(0,16)}</td><td>{r.initiated_by}</td><td>{r.batch_count}</td><td><span className={`state state-${r.status.toLowerCase()}`}>{r.status.replaceAll("_"," ")}</span></td></tr>)}{rows.length===0&&<tr><td colSpan={6} className="empty">No recall records available.</td></tr>}</tbody></table></div></main>;
}
