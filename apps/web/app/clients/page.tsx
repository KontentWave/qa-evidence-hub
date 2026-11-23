import { CreateClientForm } from '../../src/components/create-client-form';
import { WorkspaceHeader } from '../../src/components/workspace-header';
import {
  fetchClientsForOwner,
  getRawSessionCookie,
  requireAuthenticatedOwner,
  unwrapSsrDataOrRedirect,
} from '../../src/lib/api';
import { formatUtcInTimeZone } from '../../src/lib/timezone';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const owner = await requireAuthenticatedOwner();
  const rawToken = await getRawSessionCookie();
  const clientsResult = await fetchClientsForOwner(rawToken);
  const clients = unwrapSsrDataOrRedirect(clientsResult);

  return (
    <main id="main-content" tabIndex={-1}>
      <WorkspaceHeader
        breadcrumbs={[{ label: 'Overview', href: '/' }, { label: 'Clients' }]}
        heading="Clients"
        owner={owner}
      />

      <section aria-labelledby="new-client-heading" className="card no-print">
        <h2 id="new-client-heading">Create client</h2>
        <CreateClientForm />
      </section>

      <section aria-labelledby="clients-list-heading" className="card">
        <h2 id="clients-list-heading">Saved clients</h2>
        {clients === null ? (
          <div className="status-banner status-banner--not-ready" role="alert">
            <p className="status-heading">Unable to load clients</p>
            <p className="status-detail">
              The internal API service did not respond. Reload to try again.
            </p>
          </div>
        ) : clients.length === 0 ? (
          <p className="empty-state">No clients created yet.</p>
        ) : (
          <ul className="record-list">
            {clients.map((client) => (
              <li className="record-item" key={client.id}>
                <div className="record-item__header">
                  <a className="record-item__title" href={`/clients/${client.id}`}>
                    {client.name}
                  </a>
                </div>
                {client.notes ? <p className="plain-text-block">{client.notes}</p> : null}
                <p className="record-item__meta">
                  Created{' '}
                  <time dateTime={client.createdAt}>
                    {formatUtcInTimeZone(client.createdAt, owner.timezone)}
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
