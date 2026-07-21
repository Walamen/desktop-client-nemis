import type { ApplicationLayer, ApplicationResponse } from '@nemis-desktop/application';
import {
  DatabaseUnavailableError,
  NetworkUnavailableError,
  NotImplementedPresentationError,
} from '@nemis-desktop/presentation';
import { nemisBridge } from '@/services/nemis-bridge';

/** Parses the `[CODE] message` prefix the preload bridge throws on IpcResult
 * failure. Returns null when the error is not in that shape (e.g. the bridge
 * itself was unavailable, or a non-IPC throw). */
function ipcCodeOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const match = /^\[([A-Z_]+)\]/.exec(error.message);
  return match ? match[1]! : null;
}

/** Runs a bridge call and translates transport/DB failures into presentation
 * errors the ViewModels understand. Other coded errors flow through unchanged
 * (toPresentationError degrades them to LoadingError for queries). */
async function callBridge<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const code = ipcCodeOf(error);
    if (code === 'DATABASE_UNAVAILABLE' || code === 'MIGRATION_REQUIRED') {
      throw new DatabaseUnavailableError(
        'The local database is unavailable. Please restart the application.',
        { cause: error },
      );
    }
    if (code === null) {
      throw new NetworkUnavailableError(
        'Lost connection to the local service. Please restart the application.',
        { cause: error },
      );
    }
    throw error;
  }
}

function query<T>(fn: () => Promise<T>): Promise<ApplicationResponse<T>> {
  return callBridge(fn).then((data) => ({ data }));
}

/** Every method not wired to a channel this phase. ComingSoon screens
 * construct their ViewModels with these groups but never invoke them. */
function group<T extends object>(name: string, methods: Partial<T>): T {
  return new Proxy(methods as T, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (value !== undefined) return value;
      return async () => {
        throw new NotImplementedPresentationError(`${name}.${String(prop)}`);
      };
    },
  });
}

/** THE Phase-8 SEAM (now live): an ApplicationLayer-shaped facade over the IPC
 * bridge. Only the five dashboard/bootstrap queries are wired; the rest throw
 * NotImplementedPresentationError until their feature phase. */
export function createIpcApplicationLayer(): ApplicationLayer {
  const facade = {
    reporting: group('reporting', {
      getDashboardOverview: () => query(() => nemisBridge.getDashboardOverview()),
    }),
    institution: group('institution', {
      getCurrentSchool: () => query(() => nemisBridge.getSchoolSummary()),
    }),
    identity: group('identity', {
      getCurrentUser: () => query(() => nemisBridge.getCurrentUser()),
    }),
    academics: group('academics', {
      getCurrentAcademicYear: () => query(() => nemisBridge.getCurrentAcademicYear()),
    }),
    infra: group('infra', {
      getDeviceInfo: () => query(() => nemisBridge.getDeviceInfo()),
    }),
    students: group('students', {}),
    attendance: group('attendance', {}),
    assessments: group('assessments', {}),
  };
  // Private class fields prevent structural typing; this cast is intentional.
  return facade as unknown as ApplicationLayer;
}
