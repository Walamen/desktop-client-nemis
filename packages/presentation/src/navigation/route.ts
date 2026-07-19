/** Known screens. Extension-point screens are listed so navigation is typed
 * end-to-end before their ViewModels are implemented. */
export type ScreenId =
  | 'dashboard'
  | 'students'
  | 'class-roster'
  | 'attendance'
  | 'assessments'
  | 'settings'
  | 'device'
  | 'sync'
  | 'teachers';

export interface RouteDescriptor {
  readonly screen: ScreenId;
  readonly params: Readonly<Record<string, string>>;
}
