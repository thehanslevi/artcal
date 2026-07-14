export type Category =
  | "sound"
  | "dance"
  | "film"
  | "tech"
  | "making"
  | "theatre"
  | "literature"
  | "community";
export type Flag = "urgent" | "priority" | "decide" | null;
export type CategoryFilter = "all" | Category;

export type Mode = "make" | "witness";
export type SpaceMode = Mode | "both";
export type TabMode = "practice" | "attend" | "all";

export interface CalEvent {
  /**
   * Opaque, permanent identity. Assigned once when the event first appears and
   * never regenerated. Do NOT derive this from date, title, or venue.
   *
   * Picks used to be keyed by `date|title`, so any title change silently
   * orphaned a saved star: it vanished from the owner's subscribed calendar
   * with no error and no trace. Titles change often — a dedupe merge, a typo
   * fixed in the GitHub web editor, a venue renaming its own show.
   */
  uid: string;
  /**
   * Identities that now resolve to this event: uids of duplicates merged into
   * it, and legacy `date|title` keys. Lets an old saved pick keep working
   * instead of dangling.
   */
  aliases?: string[];
  day: string;
  date: string;
  event: string;
  where: string;
  cost: string;
  category: Category;
  flag: Flag;
  mode: Mode;
  start: string | null;
  end: string | null;
  note: string | null;
  url: string | null;
}

export interface Week {
  label: string;
  events: CalEvent[];
}

export interface EventsData {
  lastVerified: string;
  weeks: Week[];
}

export interface Space {
  name: string;
  category: Category;
  description: string;
  note: string;
  url: string | null;
  mode?: SpaceMode;
}
