import { describe, expect, it } from 'vitest';
import type { SidebarConfig } from './sidebarConfig';
import { normalizePath, resolveActiveHref } from './active-nav';

const Icon = () => null;
const BASE = '/government/school-admin';
const config: SidebarConfig = {
  dashboardItem: { name: 'Overview', href: BASE, icon: Icon },
  navGroups: [
    {
      label: 'STUDENTS',
      items: [
        { name: 'Students', href: `${BASE}/students`, icon: Icon },
        { name: 'Student Transfers', href: `${BASE}/students/inter-school-transfer`, icon: Icon },
      ],
    },
    {
      label: 'SCHOOL',
      items: [{ name: 'Settings', href: `${BASE}/settings`, icon: Icon, alsoActiveOn: [`${BASE}/school-profile`] }],
    },
  ],
};

// DEO/Teacher shape: the home page is a group item, not a dashboardItem.
const DEO = '/government/deo';
const deoConfig: SidebarConfig = {
  navGroups: [
    { label: 'OVERVIEW', items: [{ name: 'Dashboard', href: DEO, icon: Icon }] },
    { label: 'MAIN', items: [{ name: 'Schools', href: `${DEO}/schools`, icon: Icon }] },
  ],
};

describe('normalizePath', () => {
  it('strips one trailing slash but keeps the root', () => {
    expect(normalizePath('/a/b/')).toBe('/a/b');
    expect(normalizePath('/a/b')).toBe('/a/b');
    expect(normalizePath('/')).toBe('/');
  });
});

describe('resolveActiveHref', () => {
  it('matches an item exactly', () => {
    expect(resolveActiveHref(`${BASE}/students`, config, BASE)).toBe(`${BASE}/students`);
  });

  it('highlights the parent item on a sub-page', () => {
    expect(resolveActiveHref(`${BASE}/students/profile`, config, BASE)).toBe(`${BASE}/students`);
  });

  it('only matches on a path-segment boundary', () => {
    expect(resolveActiveHref(`${BASE}/students-archive`, config, BASE)).toBeNull();
  });

  it('prefers the longest matching item', () => {
    expect(resolveActiveHref(`${BASE}/students/inter-school-transfer`, config, BASE)).toBe(
      `${BASE}/students/inter-school-transfer`,
    );
  });

  it('matches the dashboard item only exactly', () => {
    expect(resolveActiveHref(BASE, config, BASE)).toBe(BASE);
    expect(resolveActiveHref(`${BASE}/sync-conflicts`, config, BASE)).toBeNull();
  });

  it('honours alsoActiveOn', () => {
    expect(resolveActiveHref(`${BASE}/school-profile`, config, BASE)).toBe(`${BASE}/settings`);
  });

  it('ignores a trailing slash on the pathname (static export)', () => {
    expect(resolveActiveHref(`${BASE}/students/`, config, BASE)).toBe(`${BASE}/students`);
    expect(resolveActiveHref(`${BASE}/`, config, BASE)).toBe(BASE);
  });

  it('never prefix-matches a group item that is the role home page', () => {
    expect(resolveActiveHref(`${DEO}/sync-conflicts`, deoConfig, DEO)).toBeNull();
    expect(resolveActiveHref(DEO, deoConfig, DEO)).toBe(DEO);
    expect(resolveActiveHref(`${DEO}/schools/detail`, deoConfig, DEO)).toBe(`${DEO}/schools`);
  });
});
