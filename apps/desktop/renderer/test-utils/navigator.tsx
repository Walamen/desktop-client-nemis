import { useState, type ReactNode } from 'react';
import { mockSearch } from './search-params';

/** Test harness: clicking the button (named "go" unless `label` says
 * otherwise) changes the mocked address and re-renders the page, like an
 * in-app link to the same route with a new query. `page` is a function so
 * each render builds a fresh element (React skips re-rendering an identical
 * element). Nest two with different labels for a test that moves twice. */
export function Navigator({ to, page, label = 'go' }: { to: string; page: () => ReactNode; label?: string }) {
  const [, bump] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          mockSearch(to);
          bump((n) => n + 1);
        }}
      >
        {label}
      </button>
      {page()}
    </>
  );
}
