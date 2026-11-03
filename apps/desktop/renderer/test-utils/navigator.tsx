import { useState, type ReactNode } from 'react';
import { mockSearch } from './search-params';

/** Test harness: clicking "go" changes the mocked address and re-renders the
 * page, like an in-app link to the same route with a new query. `page` is a
 * function so each render builds a fresh element (React skips re-rendering an
 * identical element). */
export function Navigator({ to, page }: { to: string; page: () => ReactNode }) {
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
        go
      </button>
      {page()}
    </>
  );
}
