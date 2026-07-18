/** Supplies the injected timestamp the domain requires (the domain never reads
 * the clock itself). Returns ISO-8601 UTC. */
export interface IClock {
  now(): string;
}
