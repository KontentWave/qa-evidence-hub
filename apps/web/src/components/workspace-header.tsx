import type { OwnerSummary } from '@qa-evidence-hub/api-client';
import { LogoutButton } from './logout-button';

export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export interface WorkspaceHeaderProps {
  readonly heading: string;
  readonly owner: OwnerSummary;
  readonly breadcrumbs?: readonly BreadcrumbItem[];
}

export function WorkspaceHeader({ heading, owner, breadcrumbs }: WorkspaceHeaderProps) {
  return (
    <>
      <div className="workspace-topbar">
        <div>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav aria-label="Breadcrumb" className="breadcrumb-nav no-print">
              <ol className="breadcrumb-list">
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <li className="breadcrumb-item" key={`${crumb.label}-${idx}`}>
                      {crumb.href && !isLast ? (
                        <a href={crumb.href}>{crumb.label}</a>
                      ) : (
                        <span aria-current={isLast ? 'page' : undefined}>{crumb.label}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : null}
          <h1>{heading}</h1>
          <p className="owner-meta">
            Signed in as <strong>{owner.loginIdentifier}</strong> · Timezone{' '}
            <span>{owner.timezone}</span>
          </p>
        </div>
        <LogoutButton />
      </div>

      <nav aria-label="Workspace navigation" className="section-nav workspace-section-nav no-print">
        <a href="/">Overview</a>
        <a href="/clients">Clients</a>
      </nav>
    </>
  );
}
