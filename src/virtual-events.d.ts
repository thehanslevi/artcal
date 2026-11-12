// Modules made at build time by the events-split plugin in vite.config.ts.
// Import them through src/lib/events.ts, not directly.

declare module "virtual:events-current" {
  /**
   * Events from two weeks before the current week's Monday on, in events.json
   * order.
   */
  export const events: import("./types").CalEvent[];
  export const lastVerified: string;
  /** How many events virtual:events-past holds. */
  export const pastCount: number;
}

declare module "virtual:events-past" {
  /**
   * Every event dated more than two weeks before the current week's Monday,
   * in events.json order.
   */
  const events: import("./types").CalEvent[];
  export default events;
}
