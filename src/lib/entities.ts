// HTML entities and tags leak out of scraped pages and calendar feeds and then
// render raw on the site ("Debussy&#8217;s Complete Préludes"). The scanner had
// four partial decoders, each knowing a different handful of entities, and none
// at all for ICS feeds. This is the one place that knows how.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  frac12: "½",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  agrave: "à",
  egrave: "è",
  ccedil: "ç",
  ntilde: "ñ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
};

const ENTITY_RE = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,10});/gi;

function decodeOnce(s: string): string {
  return s.replace(ENTITY_RE, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return whole;
      }
      // Control characters have no business in a title.
      if (code < 32 || code === 127 || code === 160) return " ";
      return String.fromCodePoint(code);
    }
    // An entity this table doesn't know is left as it is, so validate-events
    // reports it rather than the site showing a wrong character.
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** "&#8220;Lucky Finds&#8221; &amp; more" → "“Lucky Finds” & more". */
export function decodeHtmlEntities(s: string): string {
  // Twice, because feeds double-encode: "&amp;#8217;" is an entity in an entity.
  const once = decodeOnce(s);
  return once === s ? s : decodeOnce(once);
}

/** Decode entities, drop tags, and tidy the whitespace they leave behind. */
export function cleanText(s: string): string {
  return decodeHtmlEntities(s)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
