export default function Loading() {
  return (
    <main aria-busy="true" className="loading-shell" role="status">
      <span className="loading-indicator" aria-hidden="true" />
      <span>Loading RecallNet…</span>
    </main>
  );
}
