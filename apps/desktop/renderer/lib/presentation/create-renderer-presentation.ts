import { createPresentationLayer, type PresentationLayer } from '@nemis-desktop/presentation';
import { createIpcApplicationLayer } from '../ipc';
import { academicYearBridge } from '@/services/nemis-bridge/school-admin/academic-year-bridge';

/** THE Phase-8 SEAM (now live): the renderer's presentation layer is built over
 * an ApplicationLayer-shaped IPC facade to the main process — no in-memory
 * fakes, no seeded demo data. Every screen reads real local SQLite data. */
export function createRendererPresentation(): PresentationLayer {
  return createPresentationLayer(createIpcApplicationLayer(), {
    startAcademicYear: (id) => academicYearBridge.start(id),
  });
}
