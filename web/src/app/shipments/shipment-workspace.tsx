"use client";

import { useState, type FormEvent } from "react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };
type Batch = { id: string; batchNo: string; availableQuantity: string };
type Shipment = { id: string; status: string; createdAt: string; dispatchedAt: string | null; sourceWarehouseId: string | null; sourceDistributorId: string | null; destinationDistributorId: string | null; destinationRetailerId: string | null; trackingNumber: string | null; itemCount: string; quantity: string; batches: string };
type AuditEvent = { id: string; eventType: string; occurredAt: string; actor: { userId: string; role: string }; entity: { mysqlId: number }; details: Record<string, unknown> | null };

function responseMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

export default function ShipmentWorkspace({ shipments, batches, warehouses, distributors, retailers, role, canCreate, canDispatch, canAudit }: { shipments: Shipment[]; batches: Batch[]; warehouses: Option[]; distributors: Option[]; retailers: Option[]; role: string; canCreate: boolean; canDispatch: boolean; canAudit: boolean }) {
  const [rows, setRows] = useState(shipments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [auditByShipment, setAuditByShipment] = useState<Record<string, AuditEvent[]>>({});
  const [auditLoading, setAuditLoading] = useState<string | null>(null);
  const [auditError, setAuditError] = useState("");
  const isDistributor = role === "DISTRIBUTOR";
  const router = useRouter();

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      sourceWarehouseId: form.get("sourceWarehouseId") || undefined,
      destinationDistributorId: form.get("destinationDistributorId") || undefined,
      destinationRetailerId: form.get("destinationRetailerId") || undefined,
      parentShipmentId: form.get("parentShipmentId") || undefined,
      trackingNumber: form.get("trackingNumber") || undefined,
      items: [{ batchId: form.get("batchId"), quantity: form.get("quantity") }],
    };
    try {
      const response = await fetch("/api/shipments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result: unknown = await response.json();
      if (!response.ok) { setError(responseMessage(result, "Unable to create the shipment.")); return; }
      setNotice("Draft shipment created and recorded.");
      formElement.reset();
      router.refresh();
    } catch { setError("Unable to reach RecallNet."); }
    finally { setBusy(false); }
  }

  async function dispatch(id: string) {
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await fetch(`/api/shipments/${id}/dispatch`, { method: "POST" });
      const result: unknown = await response.json();
      if (!response.ok) { setError(responseMessage(result, "Shipment dispatch failed validation.")); return; }
      setRows(current => current.map(row => row.id === id ? { ...row, status: "DISPATCHED", dispatchedAt: new Date().toISOString() } : row));
      setNotice(`Shipment ${id} dispatched and recorded.`);
      router.refresh();
    } catch { setError("Unable to reach RecallNet."); }
    finally { setBusy(false); }
  }

  async function toggleAudit(id: string) {
    if (expandedAudit === id) { setExpandedAudit(null); return; }
    setExpandedAudit(id); setAuditError("");
    if (auditByShipment[id]) return;
    setAuditLoading(id);
    try {
      const response = await fetch(`/api/shipments/${id}/audit-events`, { cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("data" in result) || !Array.isArray(result.data)) {
        setAuditError(responseMessage(result, "Unable to load MongoDB audit events.")); return;
      }
      setAuditByShipment(current => ({ ...current, [id]: result.data as AuditEvent[] }));
    } catch { setAuditError("Unable to reach the MongoDB audit viewer."); }
    finally { setAuditLoading(null); }
  }

  return <>
    {error && <p className="notice warning" role="alert">{error}</p>}{notice && <p className="notice success" role="status">{notice}</p>}
    {canCreate && <form className="shipment-form" onSubmit={createShipment}>
      <div className="section-heading compact"><div><p className="eyebrow">NEW MOVEMENT</p><h2>Create a draft shipment</h2></div></div>
      <div className="shipment-fields">
        {!isDistributor && <label>Source warehouse<select name="sourceWarehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label>Batch<select name="batchId" required defaultValue=""><option value="" disabled>Select batch</option>{batches.map(x => <option key={x.id} value={x.id}>{x.batchNo} · available {x.availableQuantity}</option>)}</select></label>
        <label>Quantity<input name="quantity" required type="number" min="0.001" step="0.001" /></label>
        <label>Tracking / LR number<input name="trackingNumber" maxLength={80} /></label>
        {isDistributor ? <><label>Destination retailer<select name="destinationRetailerId" required defaultValue=""><option value="" disabled>Select retailer</option>{retailers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Parent shipment ID<input name="parentShipmentId" required inputMode="numeric" pattern="[1-9][0-9]*" /></label></> : <label>Destination distributor<select name="destinationDistributorId" defaultValue=""><option value="">Direct / other destination</option>{distributors.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
      </div><button className="primary-button shipment-submit" disabled={busy || batches.length === 0}>{busy ? "Saving…" : "Create draft shipment"}</button>
      {batches.length === 0 && <p className="subhead">No completed batches are currently available for shipment.</p>}
    </form>}
    {!canCreate && <p className="notice">Your {role.replaceAll("_", " ").toLowerCase()} role can review shipments but cannot create or dispatch them.</p>}
    <div className="table-card table-wrap"><table><thead><tr><th>Shipment</th><th>Status</th><th>Created</th><th>Batch items</th><th>Quantity</th><th>Tracking</th><th>Action</th></tr></thead><tbody>{rows.map(row => <Fragment key={row.id}><tr><td className="batch-link">#{row.id}</td><td><span className={`state state-${row.status.toLowerCase()}`}>{row.status.replaceAll("_", " ")}</span></td><td>{String(row.createdAt).slice(0, 16)}</td><td>{row.batches || `${row.itemCount} item(s)`}</td><td>{row.quantity}</td><td>{row.trackingNumber || "—"}</td><td><div className="shipment-actions">{canDispatch && row.status === "DRAFT" ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void dispatch(row.id)}>Dispatch</button> : row.dispatchedAt ? <span>{String(row.dispatchedAt).slice(0, 16)}</span> : null}{canAudit && <button className="secondary-button" type="button" aria-expanded={expandedAudit === row.id} onClick={() => void toggleAudit(row.id)}>{expandedAudit === row.id ? "Hide Mongo audit" : "View Mongo audit"}</button>}</div></td></tr>{expandedAudit === row.id && <tr><td colSpan={7}><section className="shipment-audit" aria-label={`MongoDB audit events for shipment ${row.id}`}><h3>MongoDB audit events for shipment #{row.id}</h3>{auditLoading === row.id ? <p>Loading audit events…</p> : auditError ? <p className="audit-error" role="alert">{auditError}</p> : (auditByShipment[row.id] ?? []).length === 0 ? <p>No MongoDB audit events are recorded for this shipment.</p> : <ol>{auditByShipment[row.id].map(event => <li key={event.id}><div><b>{event.eventType.replaceAll("_", " ")}</b><time>{new Date(event.occurredAt).toLocaleString()}</time></div><small>Actor: {event.actor.role} · MySQL shipment ID: {event.entity.mysqlId}</small>{event.details && <pre>{JSON.stringify(event.details, null, 2)}</pre>}</li>)}</ol>}</section></td></tr>}</Fragment>)}{rows.length === 0 && <tr><td colSpan={7} className="empty">No shipments recorded.</td></tr>}</tbody></table></div>
  </>;
}
