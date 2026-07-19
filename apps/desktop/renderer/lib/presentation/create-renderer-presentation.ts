import { createPresentationLayer, type PresentationLayer } from '@nemis-desktop/presentation';
import { createTestApplication } from '@nemis-desktop/presentation/testing';
import { seedDemoData } from './seed-demo-data';

/** THE Phase-8 SEAM: today this builds the in-memory fake application; the
 * sync/IPC phase replaces the body with an ApplicationLayer-shaped proxy over
 * window.nemis. Nothing else in the renderer changes. */
export async function createRendererPresentation(): Promise<PresentationLayer> {
  const { app, ports } = createTestApplication();
  await seedDemoData(app, ports);
  return createPresentationLayer(app);
}
