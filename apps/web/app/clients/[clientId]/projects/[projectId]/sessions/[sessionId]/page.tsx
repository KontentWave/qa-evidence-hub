import { WorkspaceHeader } from '../../../../../../../src/components/workspace-header';
import {
  fetchClientDetailForOwner,
  fetchClientProjectDetailForOwner,
  fetchProjectSessionDetailForOwner,
  getRawSessionCookie,
  requireAuthenticatedOwner,
  unwrapSsrDataOrRedirect,
} from '../../../../../../../src/lib/api';
import { formatUtcInTimeZone } from '../../../../../../../src/lib/timezone';

export const dynamic = 'force-dynamic';

export interface SessionDetailPageProps {
  readonly params: Promise<{
    clientId: string;
    projectId: string;
    sessionId: string;
  }>;
}

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const owner = await requireAuthenticatedOwner();
  const { clientId, projectId, sessionId } = await params;
  const rawToken = await getRawSessionCookie();

  const [clientRes, projectRes, sessionRes] = await Promise.all([
    fetchClientDetailForOwner(clientId, rawToken),
    fetchClientProjectDetailForOwner(clientId, projectId, rawToken),
    fetchProjectSessionDetailForOwner(projectId, sessionId, rawToken),
  ]);

  const client = unwrapSsrDataOrRedirect(clientRes);
  const project = unwrapSsrDataOrRedirect(projectRes);
  const session = unwrapSsrDataOrRedirect(sessionRes);

  if (!client || !project || !session) {
    return (
      <main id="main-content" tabIndex={-1}>
        <WorkspaceHeader
          breadcrumbs={[
            { label: 'Overview', href: '/' },
            { label: 'Clients', href: '/clients' },
            { label: 'Session unavailable' },
          ]}
          heading="Test session temporarily unavailable"
          owner={owner}
        />
        <div className="status-banner status-banner--not-ready" role="alert">
          <p className="status-heading">Unable to load test session details</p>
          <p className="status-detail">
            The internal API service did not respond. Reload to try again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <WorkspaceHeader
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Clients', href: '/clients' },
          { label: client.name, href: `/clients/${client.id}` },
          { label: project.name, href: `/clients/${client.id}/projects/${project.id}` },
          { label: session.purpose },
        ]}
        heading={session.purpose}
        owner={owner}
      />

      <section aria-labelledby="session-details-heading" className="card">
        <h2 id="session-details-heading">Test session details</h2>
        <dl className="detail-grid">
          <div className="detail-entry">
            <dt className="detail-term">Purpose</dt>
            <dd className="detail-value">{session.purpose}</dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Project</dt>
            <dd className="detail-value">
              <a href={`/clients/${client.id}/projects/${project.id}`}>{project.name}</a>
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Client</dt>
            <dd className="detail-value">
              <a href={`/clients/${client.id}`}>{client.name}</a>
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Start time ({owner.timezone})</dt>
            <dd className="detail-value">
              <time dateTime={session.startedAt}>
                {formatUtcInTimeZone(session.startedAt, owner.timezone)}
              </time>
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">End time ({owner.timezone})</dt>
            <dd className="detail-value">
              {session.endedAt ? (
                <time dateTime={session.endedAt}>
                  {formatUtcInTimeZone(session.endedAt, owner.timezone)}
                </time>
              ) : (
                'Not recorded'
              )}
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Environment</dt>
            <dd className="detail-value">{session.environment ?? 'Not specified'}</dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Device</dt>
            <dd className="detail-value">{session.device ?? 'Not specified'}</dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Operating system</dt>
            <dd className="detail-value">{session.os ?? 'Not specified'}</dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Browser</dt>
            <dd className="detail-value">{session.browser ?? 'Not specified'}</dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Build or version</dt>
            <dd className="detail-value">{session.buildVersion ?? 'Not specified'}</dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Notes</dt>
            <dd className="detail-value plain-text-block">
              {session.notes ?? 'No session notes recorded.'}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
