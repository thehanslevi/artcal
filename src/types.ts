export type Category =
  | "sound"
  | "dance"
  | "film"
  | "tech"
  | "make"
  | "stage"
  | "word"
  | "circle";
export type Flag = "urgent" | "priority" | "decide" | null;
export type CategoryFilter = "all" | Category;

export type Mode = "make" | "watch";
export type SpaceMode = Mode | "both";
export type TabMode = "practice" | "attend" | "all";

export interface CalEvent {
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

export interface Decision {
  text: string;
  url: string | null;
  date?: string | null;
  mode?: Mode;
}

export interface DecisionsData {
  urgent: Decision[];
  open: Decision[];
}

export interface Anchor {
  name: string;
  description: string;
  note: string;
  url: string | null;
  mode?: SpaceMode;
}

export interface FallItem {
  title: string;
  detail: string;
  url: string | null;
  mode?: SpaceMode;
}

export interface Space {
  name: string;
  category: Category;
  description: string;
  note: string;
  url: string | null;
  mode?: SpaceMode;
}
