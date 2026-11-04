import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";

export const instant = false;

interface BatchRow extends RowDataPacket { prod_batch_id: string; batch_no: string; mfg_date: string; exp_date: string; quantity: string; status: string; product_name: string; warehouse_name: string }
type Props = { searchParams: Promise<{ search?: string; status?: string; page?: string }> };

export default async function BatchesPage({searchParams}:Props) {
  const params=await searchParams;
  const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth=await authorizePermission(new Request("http://recallnet.local/",{headers:token?{cookie:`${SESSION_COOKIE_NAME}=${token}`}:{}}),"batches:read");
  if(!auth.authorized) redirect("/login");
  const search=(params.search??"").trim().slice(0,120);
  const status=(params.status??"").trim().toUpperCase();
  const allowed=["PLANNED","IN_PRODUCTION","COMPLETED","QUARANTINED","RECALLED","EXPIRED"];
  const filterStatus=allowed.includes(status)?status:"";
  const page=Math.max(1,Math.min(100000,Number(params.page)||1));
  const conditions:string[]=[]; const values:(string|number)[]=[];
  if(search){conditions.push("(pb.batch_no LIKE ? OR p.name LIKE ?)");values.push(`%${search}%`,`%${search}%`)}
  if(filterStatus){conditions.push("pb.status=?");values.push(filterStatus)}
  const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";
  const [countRows]=await mysqlPool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM production_batches pb JOIN products p ON p.product_id=pb.product_id ${where}`,values).catch(()=>[[] as RowDataPacket[],[]]);
  const total=Number(countRows[0]?.total??0);
  const [rows]=await mysqlPool.execute<BatchRow[]>(`SELECT pb.prod_batch_id,pb.batch_no,pb.mfg_date,pb.exp_date,pb.quantity,pb.status,p.name AS product_name,w.name AS warehouse_name FROM production_batches pb JOIN products p ON p.product_id=pb.product_id JOIN warehouses w ON w.warehouse_id=pb.warehouse_id ${where} ORDER BY pb.created_at DESC,pb.prod_batch_id DESC LIMIT 30 OFFSET ?`,[...values,(page-1)*30]).catch(()=>[[] as BatchRow[],[]]);
  return <main className="content"><div className="section-heading"><div><p className="eyebrow">INVENTORY</p><h1>Production batches</h1><p className="subhead">Search production records and open a full supplier-to-destination trace.</p></div><Link className="text-link" href="/">← Operations overview</Link></div><form className="search-row"><input name="search" defaultValue={search} placeholder="Search batch or product"/><select name="status" defaultValue={filterStatus}><option value="">All statuses</option>{allowed.map(s=><option key={s}>{s}</option>)}</select><button type="submit">Filter</button><Link className="secondary-button" href="/batches">Reset</Link></form><div className="table-card table-wrap"><table><thead><tr><th>Batch</th><th>Product</th><th>Manufactured</th><th>Expires</th><th>Quantity</th><th>Warehouse</th><th>Status</th></tr></thead><tbody>{rows.map(b=><tr key={b.prod_batch_id}><td><Link className="batch-link" href={`/batches/${b.prod_batch_id}`}>{b.batch_no}</Link></td><td>{b.product_name}</td><td>{String(b.mfg_date).slice(0,10)}</td><td>{String(b.exp_date).slice(0,10)}</td><td>{b.quantity}</td><td>{b.warehouse_name}</td><td><span className={`state state-${b.status.toLowerCase()}`}>{b.status.replaceAll("_"," ")}</span></td></tr>)}{rows.length===0&&<tr><td colSpan={7} className="empty">No matching batches found.</td></tr>}</tbody></table><div className="pagination"><span>{total} batches · Page {page}</span><span>{page>1&&<Link href={`/batches?search=${encodeURIComponent(search)}&status=${filterStatus}&page=${page-1}`}>← Previous</Link>}{page*30<total&&<Link href={`/batches?search=${encodeURIComponent(search)}&status=${filterStatus}&page=${page+1}`}>Next →</Link>}</span></div></div></main>;
}
