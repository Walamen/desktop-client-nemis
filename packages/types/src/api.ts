export interface SystemApi {
  getVersion(): Promise<string>;
}

export interface SettingsApi {
  /** The stored value for the key, or null when it does not exist. */
  get(key: string): Promise<unknown>;
}

export interface NemisApi {
  system: SystemApi;
  settings: SettingsApi;
}
