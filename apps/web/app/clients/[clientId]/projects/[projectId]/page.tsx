import { CreateSessionForm } from '../../../../../src/components/create-session-form';
import { WorkspaceHeader } from '../../../../../src/components/workspace-header';
import {
  fetchClientDetailForOwner,
  fetchClientProjectDetailForOwner,
  fetchProjectSessionsForOwner,
  getRawSessionCookie,
  requireAuthenticatedOwner,
  triggerNotFound,
  unwrapSsrDataOrRedirect,
} from '../../../../../src/lib/api';
import { formatUtcInTimeZone } from '../../../../../src/lib/timezone';

export const dynamic = 'force-dynamic';

export interface ProjectDetailPageProps {
  readonly params: Promise<{ clientId: string; projectId: string }>;
  readonly searchParams?: Promise<{ cursor?: string | string[] }>;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: ProjectDetailPageProps) {
  const owner = await requireAuthenticatedOwner();
  const { clientId, projectId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawCursor = resolvedSearchParams?.cursor;

  if (Array.isArray(rawCursor) || (typeof rawCursor === 'string' && rawCursor.trim().length === 0)) {
    triggerNotFound();
  }
  const activeCursor = typeof rawCursor === 'string' ? rawCursor.trim() : undefined;

  const rawToken = await getRawSessionCookie();

  const [clientRes, projectRes, sessionsRes] = await Promise.all([
    fetchClientDetailForOwner(clientId, rawToken),
    fetchClientProjectDetailForOwner(clientId, projectId, rawToken),
    fetchProjectSessionsForOwner(
      projectId,
      rawToken,
      activeCursor ? { cursor: activeCursor } : undefined,
    ),
  ]);

  const client = unwrapSsrDataOrRedirect(clientRes);
  const project = unwrapSsrDataOrRedirect(projectRes);
  const sessionPage = unwrapSsrDataOrRedirect(sessionsRes);

  if (!client || !project) {
    return (
      <main id="main-content" tabIndex={-1}>
        <WorkspaceHeader
          breadcrumbs={[
            { label: 'Overview', href: '/' },
            { label: 'Clients', href: '/clients' },
            { label: 'Project unavailable' },
          ]}
          heading="Project temporarily unavailable"
          owner={owner}
        />
        <div className="status-banner status-banner--not-ready" role="alert">
          <p className="status-heading">Unable to load project details</p>
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
          { label: project.name },
        ]}
        heading={project.name}
        owner={owner}
      />

      <section aria-labelledby="project-details-heading" className="card">
        <div className="record-item__header">
          <h2 id="project-details-heading">Project context</h2>
          <span
            className={`status-pill ${
              project.status === 'Active' ? 'status-pill--active' : 'status-pill--archived'
            }`}
          >
            Status: {project.status}
          </span>
        </div>

        <dl className="detail-grid">
          <div className="detail-entry">
            <dt className="detail-term">Client</dt>
            <dd className="detail-value">
              <a href={`/clients/${client.id}`}>{client.name}</a>
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Created</dt>
            <dd className="detail-value">
              <time dateTime={project.createdAt}>
                {formatUtcInTimeZone(project.createdAt, owner.timezone)}
              </time>
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Description</dt>
            <dd className="detail-value plain-text-block">
              {project.description ?? 'No project description recorded.'}
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Testing context</dt>
            <dd className="detail-value plain-text-block">
              {project.testingContext ?? 'No testing context recorded.'}
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Instructions</dt>
            <dd className="detail-value plain-text-block">
              {project.instructions ?? 'No special testing instructions recorded.'}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="new-session-heading" className="card no-print">
        <h2 id="new-session-heading">Create test session</h2>
        <CreateSessionForm
          clientId={client.id}
          ownerTimezone={owner.timezone}
          projectId={project.id}
        />
      </section>

      <section aria-labelledby="sessions-list-heading" className="card">
        <h2 id="sessions-list-heading">Test sessions</h2>
        {sessionPage === null ? (
          <div className="status-banner status-banner--not-ready" role="alert">
            <p className="status-heading">Unable to load test sessions</p>
            <p className="status-detail">
              The internal API service did not respond. Reload to try again.
            </p>
          </div>
        ) : sessionPage.items.length === 0 ? (
          <p className="empty-state">
            {activeCursor
              ? 'No older test sessions found for this project.'
              : 'No test sessions created for this project yet.'}
          </p>
        ) : (
          <ul className="record-list">
            {sessionPage.items.map((session) => (
              <li className="record-item" key={session.id}>
                <div className="record-item__header">
                  <a
                    className="record-item__title"
                    href={`/clients/${client.id}/projects/${project.id}/sessions/${session.id}`}
                  >
                    {session.purpose}
                  </a>
                </div>
                <p className="record-item__meta">
                  Started{' '}
                  <time dateTime={session.startedAt}>
                    {formatUtcInTimeZone(session.startedAt, owner.timezone)}
                  </time>
                  {session.endedAt ? (
                    <>
                      {' · '}Ended{' '}
                      <time dateTime={session.endedAt}>
                        {formatUtcInTimeZone(session.endedAt, owner.timezone)}
                      </time>
                    </>
                  ) : (
                    ' · End time not recorded'
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        {sessionPage !== null && (activeCursor || sessionPage.nextCursor) ? (
          <nav aria-label="Test sessions pagination" className="pagination-nav no-print">
            {activeCursor ? (
              <a
                className="pagination-link"
                href={`/clients/${client.id}/projects/${project.id}`}
              >
                Newest sessions
              </a>
            ) : null}
            {sessionPage.nextCursor ? (
              <a
                className="pagination-link"
                href={`/clients/${client.id}/projects/${project.id}?cursor=${encodeURIComponent(
                  sessionPage.nextCursor,
                )}`}
              >
                Older sessions
              </a>
            ) : null}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
