import type { Metadata } from 'next';
import { LoginForm } from '../../src/components/login-form';
import { getOptionalAuthenticatedOwner, redirectToPath } from '../../src/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — QA Evidence Hub',
};

export default async function LoginPage() {
  const existingOwner = await getOptionalAuthenticatedOwner();
  if (existingOwner) {
    redirectToPath('/');
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <h1>Sign in to QA Evidence Hub</h1>
      <p className="lead">
        Private single-owner QA workspace. Sign in with the provisioned owner credentials.
      </p>

      <section aria-labelledby="signin-card-heading" className="card auth-card">
        <h2 id="signin-card-heading">Owner credentials</h2>
        <LoginForm />
        <p className="auth-note">
          Public account registration and email password reset are disabled. Provisioning and
          credential rotation are operator-only CLI commands.
        </p>
      </section>
    </main>
  );
}
