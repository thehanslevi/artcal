import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { EventsData } from "../types";
import { comparableTitle, hasSlur, seriesPrefixes, tidyTitle } from "./title.ts";

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
  assert.equal(tidyTitle("Niggaz4Life at 35"), "N*****4Life at 35");
  assert.equal(tidyTitle("Niggerati Manor: A Harlem Walk"), "N*****ati Manor: A Harlem Walk");
  assert.equal(tidyTitle("#FieldNiggas"), "#FieldN*****");
  assert.equal(tidyTitle("Niggahs and Nigguh"), "N****** and N*****");
  same("Niger Delta Stories");
  same("Snigger");
  same("Sniggering in the Back Row");
  same("A Niggardly Feast");
  same("Nigg Bay");
});

test("a masked title tidies the same the second time", () => {
  for (const raw of ["UMORA Niggas", "FIELD Niggas", "MF DOOM: Niggas", "FIELD NIGGAS", "DJ NIGGAS", "Niggas"]) {
    const once = tidyTitle(raw);
    assert.equal(tidyTitle(once), once, raw);
  }
  // The masked letters read as capitals, every pass: a title whose other
  // words are all in capitals is taken as shouting.
  assert.equal(tidyTitle("UMORA Niggas"), "Umora N*****");
  assert.equal(tidyTitle("Field Niggas Live"), "Field N***** Live");
});

test("every stored title tidies the same the second time", () => {
  const data = JSON.parse(readFileSync("src/data/events.json", "utf8")) as EventsData;
  const titles = data.weeks.flatMap((w) => w.events.map((e) => e.event));
  const series = seriesPrefixes(titles);
  for (const t of titles) {
    const once = tidyTitle(t, { series });
    assert.equal(tidyTitle(once, { series }), once, t);
  }
});

test("hasSlur and comparableTitle", () => {
  assert.equal(hasSlur("https://uniondocs.org/event/field-niggas-2026-11-12/"), true);
  assert.equal(hasSlur("https://uniondocs.org/event/remake-2026-11-14/"), false);
  assert.equal(comparableTitle("Field Niggas"), comparableTitle("Field N*****"));
  assert.equal(comparableTitle("Relief Printmaking"), "Relief Printmaking");
});

test("a venue's own stars don't stop a shouted title being fixed", () => {
  assert.equal(tidyTitle("SH*T SHOW COMEDY"), "Sh*t Show Comedy");
  assert.equal(tidyTitle("WHAT THE F*** IS ART"), "What the F*** Is Art");
  assert.equal(
    tidyTitle("HOW TO LIVE & MAKE ART IN THESE F**KED-UP TIMES"),
    "How to Live & Make Art in These F**ked-Up Times",
  );
});

test("the word run into another is masked and tidies the same twice", () => {
  assert.equal(tidyTitle("NiggaHouse"), "N****House");
  assert.equal(tidyTitle("NiggaSquad Live"), "N****Squad Live");
  assert.equal(tidyTitle("#BossNiggas"), "#BossN*****");
  assert.equal(tidyTitle("ThisIsNiggas"), "ThisIsN*****");
  for (const raw of [
    "Show: Niggaband, Foo",
    "The Fest: NiggaDJ, Foo",
    "Movie Night (Niggadoors)",
    "Niggaz4Life: Ice Trio, Ren Band",
    "x TEM present: Niggaband, Foo + Bar",
    "JAZZ - Niggatrio (World Premiere)",
    "NIGGAZ4LIFE LISTENING PARTY (5th annual)",
  ]) {
    const once = tidyTitle(raw);
    assert.equal(tidyTitle(once), once, raw);
    assert.equal(hasSlur(once), false, raw);
  }
});

test("a series named with the word is one series, stored or freshly scraped", () => {
  const titles = ["N***** Night: Ali Trio", "N***** Night: Bo Band", "Niggas Night: Dee Trio + Eli Band"];
  const series = seriesPrefixes(titles);
  assert.equal(series.size, 1);
  assert.equal(tidyTitle("Niggas Night: Dee Trio + Eli Band", { series }), "N***** Night: Dee Trio");
});

test("only the mask's stars read as letters", () => {
  assert.equal(comparableTitle("**SOLD OUT** Wheel Throwing"), "**SOLD OUT** Wheel Throwing");
  assert.equal(comparableTitle("Sh*t Show"), "Sh*t Show");
});

test("the rule reads the same text on a second pass, whatever was taken off", () => {
  for (const raw of [
    "PICKLING PARTY feat. Field Niggas",
    "TRANSATLANTIK II: Field Niggas, Ali Trio & Bo Band",
    "Field Niggas present: PICKLING PARTY",
    "MOVIE NIGHT (Niggadoors)",
    "PICKLING PARTY feat. N*****",
    "FIELD NiggA",
    "Nigg (2026)as",
    "Nigg (World Premiere)as",
    "Ni (Doors 7pm)GGUH! closes",
    "Ghost Light 2026 - (World Premiere)",
    "Ghost Light 2026 | [World Premiere]",
    "Ghost Light (Summer 2026 [World Premiere])",
    "Ghost Light: (World Premiere)",
    "NIGGASQUAD LIVE",
    "NIGGAHOUSE PARTY",
  ]) {
    const once = tidyTitle(raw);
    assert.equal(tidyTitle(once), once, raw);
    assert.equal(hasSlur(once), false, raw);
  }
  assert.equal(tidyTitle("Ghost Light 2026 - (World Premiere)"), "Ghost Light");
  assert.equal(tidyTitle("Ghost Light (Summer 2026 [World Premiere])"), "Ghost Light");
  assert.equal(tidyTitle("Ghost Light: (World Premiere)"), "Ghost Light");
  assert.equal(tidyTitle("Movie Night (Niggadoors)"), "Movie Night (N****doors)");
});

test("a venue's own masked word is read as main read it", () => {
  assert.equal(tidyTitle("FIELD N***** LIVE"), "Field N***** Live");
  assert.equal(tidyTitle("UMORA N*****"), "Umora N*****");
  assert.equal(tidyTitle("Field N***"), "Field N***");
});

test("the -er spelling joined on is masked; snigger is not", () => {
  assert.equal(tidyTitle("#BossNiggers"), "#BossN******");
  assert.equal(tidyTitle("ClassNigger Live"), "ClassN***** Live");
  same("Snigger");
  assert.equal(tidyTitle("SNIGGERING CROWDS"), "Sniggering Crowds");
  same("sniggers");
  assert.equal(tidyTitle("NIGGASQUAD LIVE"), "N****squad Live");
  assert.equal(comparableTitle("NIGGASQUAD LIVE").toLowerCase(), comparableTitle("NiggaSquad Live").toLowerCase());
});

test("every spelling run into another word is masked; ordinary x's are not", () => {
  assert.equal(tidyTitle("NigguhSquad"), "N*****Squad");
  assert.equal(tidyTitle("RealNigguhsLive"), "RealN*****sLive");
  assert.equal(tidyTitle("#BOSSNiggers"), "#BOSSN******");
  assert.equal(tidyTitle("SNiggers Night"), "SN****** Night");
  assert.equal(tidyTitle("BOSSNIGGERS PARTY"), "Bossn****** Party");
  same("Snigger");
  same("SNIGGER");
  for (const t of ["Lynxxxxx Night", "Jinxxxxx!", "NXXXX Party", "Room NXXXXXXX", "Annxxxxx Building Jazz"]) same(t);
  assert.equal(tidyTitle("NiggaXXL Tour"), "N****XXL Tour");
});

test("a colon left by the line-up step comes off on the first pass", () => {
  for (const raw of ["Show:: Royel Otis + Ax", "Jazz Night:: A, B and more", "Show 2026:: Royel Otis + Ax"]) {
    const once = tidyTitle(raw);
    assert.equal(tidyTitle(once), once, raw);
  }
  assert.equal(tidyTitle("Show:: Royel Otis + Ax"), "Show");
});
