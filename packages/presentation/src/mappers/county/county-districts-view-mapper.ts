import type {
  CountyDistrictDetailResult,
  CountyDistrictInstitution,
  CountyDistrictOfficer,
  CountyDistrictsResult,
} from '@nemis-desktop/types';
import type {
  CountyDistrictDetailView,
  CountyDistrictsView,
  DistrictOfficerView,
  DistrictSchoolView,
} from '../../view-models/county/county-districts-views';

const officerView = (officer: CountyDistrictOfficer): DistrictOfficerView => ({
  userId: officer.userId,
  name: officer.name,
  email: officer.email,
});

const schoolView = ({ street, type: _type, ...row }: CountyDistrictInstitution): DistrictSchoolView => ({
  ...row,
  address: street,
});

export function toCountyDistrictsView(dto: CountyDistrictsResult): CountyDistrictsView {
  return {
    county: dto.county,
    districts: dto.districts.map((district) => ({
      id: district.id,
      name: district.name,
      code: district.code,
      isActive: district.isActive,
      _count: { institutions: district.activeSchoolCount, users: district.activeDeoCount },
      users: district.firstDeo
        ? [
            {
              user: {
                id: district.firstDeo.userId,
                firstName: district.firstDeo.firstName,
                lastName: district.firstDeo.lastName,
                email: district.firstDeo.email,
                imageUrl: district.firstDeo.photoUrl,
              },
            },
          ]
        : [],
    })),
    deoUsers: dto.deoUsers.map(({ photoUrl, ...user }) => ({ ...user, imageUrl: photoUrl })),
    officersByDistrict: Object.fromEntries(
      Object.entries(dto.officersByDistrict).map(([id, officers]) => [id, officers.map(officerView)]),
    ),
  };
}

export function toCountyDistrictDetailView(dto: CountyDistrictDetailResult): CountyDistrictDetailView {
  return {
    county: dto.county,
    district: { ...dto.district, institutions: dto.institutions.map(schoolView) },
    officers: dto.officers.map(officerView),
    schools: dto.institutions.filter((institution) => institution.type === 'SCHOOL').map(schoolView),
    stats: dto.stats,
  };
}
