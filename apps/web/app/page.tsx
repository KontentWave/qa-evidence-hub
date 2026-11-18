import { fetchPlatformReadiness } from '../src/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const readiness = await fetchPlatformReadiness();
  const isReady = readiness.state === 'ready';

  return (
    <main id="main-content" tabIndex={-1}>
      <h1>QA Evidence Hub</h1>
      <p className="lead">
        Structured workspace for engagement evidence capture, finding lifecycle tracking, and
        printable project reports.
      </p>

      <section aria-labelledby="readiness-heading" className="card" id="system-readiness">
        <h2 id="readiness-heading">Platform readiness</h2>
        <div
          aria-live="polite"
          className={`status-banner ${
            isReady ? 'status-banner--ready' : 'status-banner--not-ready'
          }`}
          role="status"
        >
          <p className="status-heading">System status: {readiness.label}</p>
          <p className="status-detail">{readiness.detail}</p>
        </div>
      </section>

      <section aria-labelledby="scope-heading" className="card" id="workspace-scope">
        <h2 id="scope-heading">Foundation boundary</h2>
        <ul className="scope-list">
          <li>
            Single-origin HTTP routing via Nginx to standalone Next.js presentation and private
            NestJS API services.
          </li>
          <li>
            Server-rendered pages query the internal API with <code>no-store</code> semantics and
            hold zero database or object-storage credentials.
          </li>
          <li>
            Authentication, domain entities, and private evidence storage arrive in subsequent Phase
            1 slices after CI gates (F01–F02) complete.
          </li>
        </ul>
      </section>
    </main>
  );
}
