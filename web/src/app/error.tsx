"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="error-shell">
      <p className="eyebrow">WORKSPACE ERROR</p>
      <h1>This page could not be loaded</h1>
      <p className="subhead">The request failed. Check the database services and try again.</p>
      <button className="primary-button" onClick={() => reset()} type="button">Try again</button>
    </main>
  );
}
