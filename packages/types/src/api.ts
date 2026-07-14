export interface SystemApi {
  getVersion(): Promise<string>;
}

export interface NemisApi {
  system: SystemApi;
}
