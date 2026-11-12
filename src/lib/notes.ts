// Which event notes the public sees.
//
// An event's note is shown on its row and written into the calendar feeds.
// Notes arrive three ways: written by hand, written by the scan's model, and
// written by dedupe when it collapses a run. Some were never meant for the
// public ("Tickets bought.", "Same night as Mono No Aware") and some are a
// venue's blurb ("Boo! Haha, gotcha! It's spooky season..."). A note is
// shown only when it reads as a plain fact about the event.

const ALLCAPS_OK = new Set(["RSVP", "NYTW", "DADA", "NYSCA", "NYCHA", "LGBTQ", "BIPOC", "CUNY", "MOMA", "NYFF", "BRIC", "UNDO"]);

const PRIVATE =
  /\b(?:i|i'm|i've|i'd|me|my|we|we're|we've|our|us)\b|\b(?:tickets? bought|bought tickets|rsvp(?:'d|ed)?\s+(?:sent|submitted|done)|same night as|pick one|skip|maybe|todo|tbc|as of)\b/i;
const POINTERS = /\bsee (?:the )?(?:url|link|site|website)\b|\bfull details\b|\bclick\b/i;
const SALES =
  /\b(?:rare|landmark|massive|must[- ]see|iconic|legendary|unmissable|don't miss|world premiere|spooky|gotcha|incredible|amazing|unforgettable|electrifying|stunning|epic)\b/i;

export const NOTE_MAX = 110;

export function isPublicNote(note: string | null | undefined): note is string {
  if (typeof note !== "string") return false;
  const n = note.trim();
  if (!n || n.length > NOTE_MAX) return false;
  if (/[!?]/.test(n)) return false;
  if (PRIVATE.test(n) || POINTERS.test(n) || SALES.test(n)) return false;
  const shouted = (n.match(/\b[A-Z]{4,}\b/g) ?? []).filter((w) => !ALLCAPS_OK.has(w));
  return shouted.length === 0;
}
