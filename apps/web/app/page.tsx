import { WorkspaceHeader } from '../src/components/workspace-header';
import { fetchPlatformReadiness, requireAuthenticatedOwner } from '../src/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const owner = await requireAuthenticatedOwner();
  const readiness = await fetchPlatformReadiness();
  const isReady = readiness.state === 'ready';

  return (
    <main id="main-content" tabIndex={-1}>
      <WorkspaceHeader heading="QA Evidence Hub" owner={owner} />

      <p className="lead">
        Structured workspace for engagement evidence capture, finding lifecycle tracking, and
        printable project reports.
      </p>

      <section aria-labelledby="engagement-heading" className="card" id="engagement-context">
        <h2 id="engagement-heading">Engagement context</h2>
        <p>
          Organize client engagements, active testing projects, and timestamped test sessions before
          capturing evidence and findings.
        </p>
        <p className="card-actions no-print">
          <a className="btn-primary link-button" href="/clients">
            Open clients &amp; engagements
          </a>
        </p>
      </section>

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
        <h2 id="scope-heading">Private access boundary</h2>
        <ul className="scope-list">
          <li>
            Single-origin routing via Nginx to standalone Next.js presentation and private NestJS
            API services.
          </li>
          <li>
            Server-rendered pages forward only the requesting browser&apos;s session cookie to the
            internal API with read-only <code>private, no-store</code> semantics.
          </li>
          <li>
            Browser mutations call <code>/api/v1/*</code> directly with exact{' '}
            <code>Origin</code> and session-bound <code>X-CSRF-Token</code> checks.
          </li>
        </ul>
      </section>
    </main>
  );
}
