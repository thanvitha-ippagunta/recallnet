"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : "Sign in failed.";
        setError(message);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to reach the RecallNet service. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="auth-card" onSubmit={submit}><p className="eyebrow">WELCOME BACK</p><h2>Sign in to RecallNet</h2><p className="subhead">Use your assigned operations account.</p>{error&&<p className="auth-error" role="alert">{error}</p>}<label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254}/><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024}/><button className="primary-button" type="submit" disabled={busy}>{busy?"Signing in…":"Sign in"}</button><p className="login-foot">Access is provided by your RecallNet administrator. Accounts and permissions are managed securely.</p></form>;
}
