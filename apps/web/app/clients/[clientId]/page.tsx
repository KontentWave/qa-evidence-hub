import { CreateProjectForm } from '../../../src/components/create-project-form';
import { WorkspaceHeader } from '../../../src/components/workspace-header';
import {
  fetchClientDetailForOwner,
  fetchClientProjectsForOwner,
  getRawSessionCookie,
  requireAuthenticatedOwner,
  unwrapSsrDataOrRedirect,
} from '../../../src/lib/api';
import { formatUtcInTimeZone } from '../../../src/lib/timezone';

export const dynamic = 'force-dynamic';

export interface ClientDetailPageProps {
  readonly params: Promise<{ clientId: string }>;
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const owner = await requireAuthenticatedOwner();
  const { clientId } = await params;
  const rawToken = await getRawSessionCookie();

  const [clientRes, projectsRes] = await Promise.all([
    fetchClientDetailForOwner(clientId, rawToken),
    fetchClientProjectsForOwner(clientId, rawToken),
  ]);

  const client = unwrapSsrDataOrRedirect(clientRes);
  const projects = unwrapSsrDataOrRedirect(projectsRes);

  if (!client) {
    return (
      <main id="main-content" tabIndex={-1}>
        <WorkspaceHeader
          breadcrumbs={[
            { label: 'Overview', href: '/' },
            { label: 'Clients', href: '/clients' },
            { label: 'Client unavailable' },
          ]}
          heading="Client temporarily unavailable"
          owner={owner}
        />
        <div className="status-banner status-banner--not-ready" role="alert">
          <p className="status-heading">Unable to load client details</p>
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
          { label: client.name },
        ]}
        heading={client.name}
        owner={owner}
      />

      <section aria-labelledby="client-details-heading" className="card">
        <h2 id="client-details-heading">Client details</h2>
        <dl className="detail-grid">
          <div className="detail-entry">
            <dt className="detail-term">Notes</dt>
            <dd className="detail-value plain-text-block">
              {client.notes ?? 'No client notes recorded.'}
            </dd>
          </div>
          <div className="detail-entry">
            <dt className="detail-term">Created</dt>
            <dd className="detail-value">
              <time dateTime={client.createdAt}>
                {formatUtcInTimeZone(client.createdAt, owner.timezone)}
              </time>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="new-project-heading" className="card no-print">
        <h2 id="new-project-heading">Create project</h2>
        <CreateProjectForm clientId={client.id} />
      </section>

      <section aria-labelledby="projects-list-heading" className="card">
        <h2 id="projects-list-heading">Projects</h2>
        {projects === null ? (
          <div className="status-banner status-banner--not-ready" role="alert">
            <p className="status-heading">Unable to load projects</p>
            <p className="status-detail">
              The internal API service did not respond. Reload to try again.
            </p>
          </div>
        ) : projects.length === 0 ? (
          <p className="empty-state">No projects created for this client yet.</p>
        ) : (
          <ul className="record-list">
            {projects.map((project) => (
              <li className="record-item" key={project.id}>
                <div className="record-item__header">
                  <a
                    className="record-item__title"
                    href={`/clients/${client.id}/projects/${project.id}`}
                  >
                    {project.name}
                  </a>
                  <span
                    className={`status-pill ${
                      project.status === 'Active'
                        ? 'status-pill--active'
                        : 'status-pill--archived'
                    }`}
                  >
                    Status: {project.status}
                  </span>
                </div>
                {project.description ? (
                  <p className="plain-text-block">{project.description}</p>
                ) : null}
                <p className="record-item__meta">
                  Created{' '}
                  <time dateTime={project.createdAt}>
                    {formatUtcInTimeZone(project.createdAt, owner.timezone)}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
