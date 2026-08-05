import { type ReactElement } from 'react';
import { Link } from 'react-router';

export function NotFoundPage(): ReactElement {
  return (
    <main className="not-found">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The requested portal page does not exist.</p>
      <Link to="/">Return to the foundation page</Link>
    </main>
  );
}
