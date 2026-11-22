export default function NotFoundPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <h1>Page not found</h1>
      <p className="lead">The requested page does not exist in this workspace.</p>
      <p>
        <a href="/login">Return to sign in</a>
      </p>
    </main>
  );
}
