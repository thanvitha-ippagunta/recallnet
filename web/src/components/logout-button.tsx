"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function signOut() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Could not sign out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to reach RecallNet. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logout-control">
      <button className="logout" disabled={busy} onClick={() => void signOut()} type="button">
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <span className="logout-error" role="alert">{error}</span>}
    </div>
  );
}
