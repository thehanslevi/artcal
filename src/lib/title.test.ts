import assert from "node:assert/strict";
import { test } from "node:test";
import { seriesPrefixes, tidyTitle } from "./title.ts";

const same = (t: string) => assert.equal(tidyTitle(t), t);

test("the three examples that set the rule", () => {
  assert.equal(tidyTitle("M³ Festival 2026 (5th annual)"), "M³ Festival");
  assert.equal(
    tidyTitle("Transatlantik II: ReFash NYNY Band, Anaïs Maviel & Friends, DJ Tara"),
    "Transatlantik II",
  );
  same("Film Series: The Films of Barbara Loden");
});

test("a year, a season, an edition, a date or showtimes come off the end", () => {
  assert.equal(tidyTitle("Moves! Dance Festival 2026"), "Moves! Dance Festival");
  assert.equal(tidyTitle("Quilt Making (Summer 2026)"), "Quilt Making");
  assert.equal(tidyTitle("HOT Festival Opening Night Party (34th annual)"), "HOT Festival Opening Night Party");
  assert.equal(tidyTitle("Andrew Bird + Wordless Music Orchestra (20th anniversary)"), "Andrew Bird + Wordless Music Orchestra");
  assert.equal(tidyTitle("Intermediate Darkroom Printing - October 18th, 2026"), "Intermediate Darkroom Printing");
  assert.equal(tidyTitle("Intro to Darkroom Printing (B&W Film) - July 6"), "Intro to Darkroom Printing (B&W Film)");
  assert.equal(tidyTitle("Intro to Knitting Class - Nov 2026"), "Intro to Knitting Class");
  assert.equal(
    tidyTitle("Live Jazz Brunch for All Ages: Music Explorers (2 sets EVERY SUNDAY @ 10:30 & 11:30AM)"),
    "Live Jazz Brunch for All Ages: Music Explorers",
  );
});

test("a line-up after the name goes; a subtitle stays", () => {
  assert.equal(tidyTitle("No Fun Night 1: Giffoni, Charmaine Lee, Twig Harper + more"), "No Fun Night 1");
  assert.equal(tidyTitle("False Harmonics #26: Conrad Tao / Charmaine Lee"), "False Harmonics #26");
  assert.equal(tidyTitle("MIKE's Young World: Max B / MIKE w/ Band of the Century"), "MIKE's Young World");
  assert.equal(tidyTitle("Bill Chats — Bill T. Jones, Joanna Kotze & guests"), "Bill Chats");
  assert.equal(tidyTitle("Deep Listening Lounge: VPC Ensemble, Blood Estate"), "Deep Listening Lounge");
  assert.equal(tidyTitle("WordHack feat. Nick Montfort, Maura Brewer and Connie Liu"), "WordHack");
  assert.equal(tidyTitle("Trio Fadolín feat. Kinan Azmeh and Inna Barmash"), "Trio Fadolín");
  same("Narcisa Hirsch: Graffiti, Film & Political Gesture");
  same("(No) Refunds — Red, White, and Blonde");
  same("Clean Lines: Writing Toward Clarity, Precision and Refinement");
  same("Verse4Verse: Drag + Poetry + Rap");
  same("Theresa Rosas: Solo Piano Pieces of Bach, Brahms, Chopin, Debussy");
  same("Soil and Sand: A Sonic Journey with Kino Benally, Tati Benally, and dre jácome");
  same("The Essence of Us: A Cuban Story (dance, film, music celebration)");
  same("Music: The Sounds of Math, Science & Social Studies");
});

test("a teacher, a proper name with a number, and a film opening stay whole", () => {
  same("Relief Printmaking with Anat Keinan");
  same("Scene and Song w/ Matthew Gellman");
  same("The 25th Annual Putnam County Spelling Bee");
  same("REMAKE — Ross McElwee opens");
  same("Natalia Lassalle-Morillo — En Parábola / Conversations on Tragedy opens");
  same("LAUREL & HARDY (25+ films, some w/ live piano) opens");
  same("GOODBYE HORSES — an unauthorized retelling of Silence of the Lambs");
  same("CANCELLED: Saree: Memory, Politics, & Inheritance");
});

test("a presenter or a genre label in front comes off", () => {
  assert.equal(tidyTitle("x TEM present: Rat City Sunrise, HALFTIME, Kevin Clark"), "Rat City Sunrise, HALFTIME, Kevin Clark");
  assert.equal(tidyTitle("Lord Debacle Presents: A Free Celebration of Nasty Heaviness"), "A Free Celebration of Nasty Heaviness");
  assert.equal(tidyTitle("Bar Laika presents Playback 0035 with Greg Fox"), "Playback 0035 with Greg Fox");
  assert.equal(tidyTitle("JAZZ - Joel Viera Trio"), "Joel Viera Trio");
  assert.equal(tidyTitle("Indie Folk - The Interim, maybe so, Tuxis Giant"), "The Interim, maybe so, Tuxis Giant");
  assert.equal(tidyTitle("STANDARD+IMPROV JAZZ - Smith / Atwal / Marcus Trio"), "Smith / Atwal / Marcus Trio");
  assert.equal(
    tidyTitle("JAZZ - Eric Garcia Album Release (feat. M. Alex Ramirez, Tyler Bauer, and Pat Petrus)"),
    "Eric Garcia Album Release",
  );
});

test("a long-running series keeps its headliner", () => {
  const series = seriesPrefixes([
    "BRIC Celebrate Brooklyn!: Royel Otis + Ax and the Hatchetmen",
    "BRIC Celebrate Brooklyn!: CARRTOONS + Hailé Supreme + Sofía Valdés",
    "BRIC Celebrate Brooklyn!: Habibi Festival",
    "Transatlantik II: ReFash NYNY Band, Anaïs Maviel & Friends, DJ Tara",
    "Transatlantik II: Jardineros, Tree Trini Collective, DJ Sabine Blaizin",
  ]);
  assert.deepEqual([...series], ["BRIC Celebrate Brooklyn!"]);
  assert.equal(
    tidyTitle("BRIC Celebrate Brooklyn!: Royel Otis + Ax and the Hatchetmen", { series }),
    "BRIC Celebrate Brooklyn!: Royel Otis",
  );
  assert.equal(tidyTitle("BRIC Celebrate Brooklyn!: Habibi Festival", { series }), "BRIC Celebrate Brooklyn!: Habibi Festival");
  assert.equal(tidyTitle("Transatlantik II: Jardineros, Tree Trini Collective, DJ Sabine Blaizin", { series }), "Transatlantik II");
});

test("applying the rule twice changes nothing", () => {
  for (const t of [
    "M³ Festival 2026 (5th annual)",
    "JAZZ - Eric Garcia Album Release (feat. M. Alex Ramirez, Tyler Bauer, and Pat Petrus)",
    "x TEM present: Rat City Sunrise, HALFTIME, Kevin Clark",
    "🦇 THIS HALLOWEEN, ENTER THE UNEXPECTED. 🖤 NIGHT OF THE LIVING SOUND 🖤 @ DADA - Oct 31, 2026, 9:30PM",
  ]) {
    const once = tidyTitle(t);
    assert.equal(tidyTitle(once), once);
  }
});

test("a course counter on the end comes off; a programme number stays", () => {
  assert.equal(tidyTitle("HAND BUILDING COURSE FALL SESSION WEEK 5"), "Hand Building Course");
  assert.equal(tidyTitle("HANDBUILDING COURSE SUMMER SESSION WEEK 6"), "Handbuilding Course");
  assert.equal(tidyTitle("Producing Fundamentals (2 of 3)"), "Producing Fundamentals");
  assert.equal(tidyTitle("6-Day Intensive Shoemaking Workshop Day 4 - 6"), "6-Day Intensive Shoemaking Workshop");
  assert.equal(tidyTitle("6-Day Intensive Shoemaking Workshop Private Class Day 4, 5 & 6"), "6-Day Intensive Shoemaking Workshop Private Class");
  assert.equal(tidyTitle("2-day Simple Sneaker Class day 1 of 2"), "2-day Simple Sneaker Class");
  same("No Fun Night 1");
  same("Smash Bash Vol. 26");
  same("adaku, part 2 (dance/theater)");
  same("Jessica Cook (Night 1) — Roulette Commission");
});

test("nothing is in all caps unless it's a name", () => {
  assert.equal(tidyTitle("PICKLING PARTY"), "Pickling Party");
  assert.equal(tidyTitle("WHAT A WORLD, WHAT A WORLD"), "What a World, What a World");
  assert.equal(tidyTitle("TOUHOU RAVE BUT IT’S ALSO A CHAINSMOKER CAT RAVE!"), "Touhou Rave but It’s Also a Chainsmoker Cat Rave!");
  assert.equal(tidyTitle("KRAMER/FAUCI"), "Kramer/Fauci");
  assert.equal(tidyTitle("SHIBUYA69: ANNIVERSARY"), "Shibuya69: Anniversary");
  assert.equal(tidyTitle("FORT90 TV"), "Fort90 TV");
  assert.equal(tidyTitle("NIGHT OF THE LIVING SOUND @ DADA"), "Night of the Living Sound @ DADA");
  same("UMORA");
  same("SOUNDWRDS");
  same("MIKE's Young World");
  same("BRIC Celebrate Brooklyn!: CARRTOONS");
  same("Intro to Darkroom Printing (B&W Film)");
});

test("a title never tidies away to nothing", () => {
  assert.equal(tidyTitle("2026"), "2026");
  assert.equal(tidyTitle("   "), "");
});

test("a premiere tag in brackets comes off; a premiere that is the event stays", () => {
  assert.equal(tidyTitle("Cherrie Yu — Daily Diversions (World Premiere)"), "Cherrie Yu — Daily Diversions");
  assert.equal(tidyTitle("John Zorn's Alea Iacta Est (World Premiere)"), "John Zorn's Alea Iacta Est");
  assert.equal(tidyTitle("Ghost Light (NYC premiere)"), "Ghost Light");
  assert.equal(tidyTitle("Ghost Light [U.S. Premiere]"), "Ghost Light");
  assert.equal(tidyTitle("Ghost Light (North American Premiere!)"), "Ghost Light");
  assert.equal(tidyTitle("Ghost Light (New York City Premiere)"), "Ghost Light");
  assert.equal(tidyTitle("Ghost Light (Premiere)"), "Ghost Light");
  assert.equal(tidyTitle("GHOST LIGHT (WORLD PREMIERE)"), "Ghost Light");
  same("Morley — Meditations on The Gift of Awe Record Premiere Celebration");
  same('Climate Week Evening Celebration with the NYC premiere of "Songs of the Earth"');
  same("Ghost Light (Album Premiere)");
  same("Premiere Night");
});

test("a slur keeps its first letter and loses the rest", () => {
  assert.equal(tidyTitle("Field Niggas"), "Field N*****");
  assert.equal(tidyTitle("FIELD NIGGAS"), "Field N*****");
  assert.equal(tidyTitle("Field N*****"), "Field N*****");
  same("Niger Delta Stories");
  same("Snigger");
});
