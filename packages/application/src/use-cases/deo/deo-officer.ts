import type { AlertOfficer } from '../../interfaces/deo/district-alert-store';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';

/** The signed-in officer as the alert store records them: first + last name, else "DEO". */
export function resolveOfficer(readModel: IDistrictOverviewReadModel, userId: string): AlertOfficer {
  const profile = readModel.getUserProfile(userId);
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || 'DEO';
  return { id: userId, name };
}
