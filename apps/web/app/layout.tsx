import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'QA Evidence Hub — Engagement Evidence & Findings Workspace',
  description:
    'Private single-owner workspace for capturing QA evidence, recording findings and observations, and printing engagement reports.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="page-shell">
          <header className="site-header">
            <span className="brand-label">QA Evidence Hub</span>
            <nav aria-label="Page sections" className="section-nav no-print">
              <a href="#system-readiness">System readiness</a>
              <a href="#workspace-scope">Foundation scope</a>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <p>Private QA engagement workspace — Phase 1 Foundation (P1-01).</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
