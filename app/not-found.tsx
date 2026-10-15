import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="container">
      <div className="not-found">
        <img src="/img/icons/agent.png" alt="" width={120} height={120} />
        <span className="eyebrow">Error 404</span>
        <h1 className="page__title">This page went to cash</h1>
        <p className="muted">The link may be old, or the agent was removed.</p>
        <Link className="button button--primary" href="/">
          Back to home
        </Link>
      </div>
    </main>
  );
}
