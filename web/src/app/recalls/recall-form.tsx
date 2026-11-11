"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type BatchOption = { id: string; batchNo: string; status: string };

function responseMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = value.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  return typeof error.message === "string" ? error.message : null;
}

export default function RecallForm({ batches }: { batches: BatchOption[] }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const completedBatches = batches.filter((batch) => batch.status === "COMPLETED");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/recalls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recallNo: form.get("recallNo"),
          reason: form.get("reason"),
          batchId: form.get("batchId"),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(responseMessage(body) ?? "Unable to open the recall.");
        return;
      }

      formElement.reset();
      setSuccess("Recall opened and added to the recall history.");
      router.refresh();
    } catch {
      setError("Unable to reach RecallNet. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="trace-form" onSubmit={submit}>
      <p className="eyebrow">QUALITY MANAGER</p>
      <h2>Open a recall</h2>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && <p className="notice success" role="status">{success}</p>}
      <label htmlFor="recall-no">Recall number</label>
      <input id="recall-no" name="recallNo" required maxLength={60} placeholder="RN-2026-001" />
      <label htmlFor="batch-id">Production batch</label>
      <select id="batch-id" name="batchId" required defaultValue="" disabled={completedBatches.length === 0}>
        <option value="" disabled>Select a completed batch</option>
        {completedBatches.map((batch) => (
          <option key={batch.id} value={batch.id}>{batch.batchNo}</option>
        ))}
      </select>
      {completedBatches.length === 0 && (
        <p className="form-help">A recall can be opened after a batch is marked completed.</p>
      )}
      <label htmlFor="reason">Reason</label>
      <textarea id="reason" name="reason" required maxLength={4000} rows={3} placeholder="Describe the quality issue" />
      <button className="primary-button" type="submit" disabled={busy || completedBatches.length === 0}>
        {busy ? "Opening recall…" : "Open full batch recall"}
      </button>
      <p>Opening a recall affects the entire production batch and blocks future dispatches.</p>
    </form>
  );
}
