import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import AppShell from "@/components/app-shell";
import { hasPermission } from "@/lib/auth/roles";
import { authorizePermission, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { mysqlPool } from "@/lib/db/mysql";

export const instant = false;

interface BatchRow extends RowDataPacket {
  prod_batch_id: string;
  batch_no: string;
  mfg_date: string;
  exp_date: string;
  quantity: string;
  status: string;
  product_name: string;
  warehouse_name: string;
}

type Props = { searchParams: Promise<{ search?: string; status?: string; page?: string }> };

const batchStatuses = ["PLANNED", "IN_PRODUCTION", "COMPLETED", "QUARANTINED", "RECALLED", "EXPIRED"];

export default async function BatchesPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await authorizePermission(
    new Request("http://recallnet.local/", {
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    }),
    "batches:read",
  );
  if (!auth.authorized) {
    if (auth.response.status === 401) redirect("/login");
    if (auth.response.status >= 500) throw new Error("Batch access could not be checked.");
    redirect("/");
  }

  const search = (params.search ?? "").trim().slice(0, 120);
  const requestedStatus = (params.status ?? "").trim().toUpperCase();
  const status = batchStatuses.includes(requestedStatus) ? requestedStatus : "";
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 100_000)
    : 1;
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (search) {
    conditions.push("(pb.batch_no LIKE ? OR p.name LIKE ?)");
    values.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push("pb.status = ?");
    values.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let total = 0;
  let rows: BatchRow[] = [];
  let loadFailed = false;
  try {
    const [countRows] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM production_batches pb
       JOIN products p ON p.product_id = pb.product_id ${where}`,
      values,
    );
    total = Number(countRows[0]?.total ?? 0);
    [rows] = await mysqlPool.execute<BatchRow[]>(
      `SELECT pb.prod_batch_id, pb.batch_no, pb.mfg_date, pb.exp_date, pb.quantity,
              pb.status, p.name AS product_name, w.name AS warehouse_name
       FROM production_batches pb
       JOIN products p ON p.product_id = pb.product_id
       JOIN warehouses w ON w.warehouse_id = pb.warehouse_id
       ${where}
       ORDER BY pb.created_at DESC, pb.prod_batch_id DESC
       LIMIT 30 OFFSET ?`,
      [...values, (page - 1) * 30],
    );
  } catch {
    loadFailed = true;
  }

  const pageLink = (nextPage: number) =>
    `/batches?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&page=${nextPage}`;
  const canTrace = hasPermission(auth.user.role, "traceability:read");

  return (
    <AppShell active="batches" user={auth.user}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h1>Production batches</h1>
          <p className="subhead">Search production records and open a full supplier-to-destination trace.</p>
        </div>
        <Link className="text-link" href="/">← Operations overview</Link>
      </div>
      <form action="/batches" className="search-row">
        <input name="search" defaultValue={search} placeholder="Search batch or product" aria-label="Search batch or product" />
        <select name="status" defaultValue={status} aria-label="Filter by batch status">
          <option value="">All statuses</option>
          {batchStatuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
        <button type="submit">Filter</button>
        <Link className="secondary-button" href="/batches">Reset</Link>
      </form>
      {loadFailed && (
        <p className="notice warning" role="alert">
          Batch records could not be loaded. Check the database connection and try again.
        </p>
      )}
      <div className="table-card table-wrap">
        <table>
          <thead>
            <tr><th>Batch</th><th>Product</th><th>Manufactured</th><th>Expires</th><th>Quantity</th><th>Warehouse</th><th>Status</th></tr>
          </thead>
          <tbody>
            {!loadFailed && rows.map((batch) => (
              <tr key={batch.prod_batch_id}>
                <td>
                  {canTrace
                    ? <Link className="batch-link" href={`/batches/${batch.prod_batch_id}`}>{batch.batch_no}</Link>
                    : batch.batch_no}
                </td>
                <td>{batch.product_name}</td>
                <td>{String(batch.mfg_date).slice(0, 10)}</td>
                <td>{String(batch.exp_date).slice(0, 10)}</td>
                <td>{batch.quantity}</td>
                <td>{batch.warehouse_name}</td>
                <td><span className={`state state-${batch.status.toLowerCase().replaceAll("_", "-")}`}>{batch.status.replaceAll("_", " ")}</span></td>
              </tr>
            ))}
            {!loadFailed && rows.length === 0 && (
              <tr><td colSpan={7} className="empty">No matching batches found.</td></tr>
            )}
          </tbody>
        </table>
        {!loadFailed && (
          <div className="pagination">
            <span>{total} batches · Page {page}</span>
            <span>
              {page > 1 && <Link href={pageLink(page - 1)}>← Previous</Link>}
              {page * 30 < total && <Link href={pageLink(page + 1)}>Next →</Link>}
            </span>
          </div>
        )}
      </div>
    </AppShell>
  );
}
