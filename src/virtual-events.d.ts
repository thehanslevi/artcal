// Modules made at build time by the events-split plugin in vite.config.ts.
// Import them through src/lib/events.ts, not directly.

declare module "virtual:events-current" {
  /** Events from the start of the current week on, in events.json order. */
  export const events: import("./types").CalEvent[];
  export const lastVerified: string;
  /** How many events virtual:events-past holds. */
  export const pastCount: number;
}

declare module "virtual:events-past" {
  /** Every event dated before the current week, in events.json order. */
  const events: import("./types").CalEvent[];
  export default events;
}
