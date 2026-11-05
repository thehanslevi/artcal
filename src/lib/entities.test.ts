import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, decodeHtmlEntities } from "./entities";

// Each title here shipped to the live calendar with its entities showing.
test("decodes the entities that reached events.json", () => {
  assert.equal(
    decodeHtmlEntities("T-Shirt Silkscreen Workshop &#8220;Lucky Finds: Second Chances&#8221;"),
    "T-Shirt Silkscreen Workshop “Lucky Finds: Second Chances”",
  );
  assert.equal(
    decodeHtmlEntities("Blue &#038; White Porcelain Painting Workshop"),
    "Blue & White Porcelain Painting Workshop",
  );
  assert.equal(decodeHtmlEntities("Fay Victor&#039;s Black Sonic Space"), "Fay Victor's Black Sonic Space");
  assert.equal(
    decodeHtmlEntities("Debussy&#8217;s Complete Préludes &#8211; Book I &#038; II"),
    "Debussy’s Complete Préludes – Book I & II",
  );
});

test("decodes named, hex and double-encoded entities", () => {
  assert.equal(decodeHtmlEntities("Caf&eacute; &amp; Bar &ndash; open"), "Café & Bar – open");
  assert.equal(decodeHtmlEntities("&#x201C;Hi&#x201D;"), "“Hi”");
  assert.equal(decodeHtmlEntities("Debussy&amp;#8217;s"), "Debussy’s");
});

test("leaves alone what isn't an entity, and what it doesn't know", () => {
  assert.equal(decodeHtmlEntities("Q&A; R&D at 5 & 6"), "Q&A; R&D at 5 & 6");
  assert.equal(decodeHtmlEntities("&notarealentity;"), "&notarealentity;");
  assert.equal(decodeHtmlEntities("&#99999999;"), "&#99999999;");
});

test("cleanText drops tags and the whitespace they leave", () => {
  assert.equal(cleanText("<p>Open  Studio<br/>Night</p>"), "Open Studio Night");
  assert.equal(cleanText("&lt;b&gt;Bold&lt;/b&gt; move&nbsp;"), "Bold move");
  // "<3" and "a < b" aren't tags.
  assert.equal(cleanText("Clay <3 and 2 < 3"), "Clay <3 and 2 < 3");
});
