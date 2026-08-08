'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the County (CEO) portal. */
export const useSchoolsViewModel = () => usePresentation().viewModels.schools;
