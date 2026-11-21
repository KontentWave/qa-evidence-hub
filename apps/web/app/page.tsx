import { LogoutButton } from '../src/components/logout-button';
import { fetchPlatformReadiness, requireAuthenticatedOwner } from '../src/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const owner = await requireAuthenticatedOwner();
  const readiness = await fetchPlatformReadiness();
  const isReady = readiness.state === 'ready';

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="workspace-topbar">
        <div>
          <h1>QA Evidence Hub</h1>
          <p className="owner-meta">
            Signed in as <strong>{owner.loginIdentifier}</strong> · Timezone{' '}
            <span>{owner.timezone}</span>
          </p>
        </div>
        <LogoutButton />
      </div>

      <nav aria-label="Workspace sections" className="section-nav workspace-section-nav no-print">
        <a href="#system-readiness">System readiness</a>
        <a href="#workspace-scope">Access boundary</a>
      </nav>

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
            Browser mutations call <code>/api/v1/auth/*</code> directly with exact{' '}
            <code>Origin</code> and session-bound <code>X-CSRF-Token</code> checks.
          </li>
        </ul>
      </section>
    </main>
  );
}
